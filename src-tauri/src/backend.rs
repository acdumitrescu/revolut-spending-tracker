//! Backend sidecar management.
//!
//! The shell only knows the backend contract (docs/desktop/backend-contract.md):
//! a program, an environment, `GET /healthz`, SIGTERM and stdin-EOF shutdown.
//! Replacing Node with a Rust backend later means adding another constructor next
//! to [`BackendSpec::node_sidecar`]; nothing else in the shell changes.

use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::paths::AppPaths;

pub const HEALTH_TIMEOUT: Duration = Duration::from_secs(15);
pub const STOP_GRACE: Duration = Duration::from_secs(5);
const LOG_ROTATE_BYTES: u64 = 5 * 1024 * 1024;

/// Everything needed to launch one backend process.
#[derive(Debug, Clone)]
pub struct BackendSpec {
    pub program: PathBuf,
    pub args: Vec<OsString>,
    pub cwd: PathBuf,
    pub env: Vec<(String, String)>,
    pub port: u16,
    pub token: String,
}

/// Per-launch values shared by every backend implementation.
#[derive(Debug, Clone)]
pub struct LaunchConfig {
    pub port: u16,
    pub token: String,
    pub static_dir: PathBuf,
}

impl LaunchConfig {
    pub fn new(static_dir: PathBuf) -> io::Result<Self> {
        Ok(Self {
            port: free_loopback_port()?,
            token: new_token()?,
            static_dir,
        })
    }

    pub fn origin(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
}

impl BackendSpec {
    /// Current implementation: bundled Node runtime + `backend/server.js`.
    pub fn node_sidecar(
        node: &Path,
        backend_dir: &Path,
        paths: &AppPaths,
        launch: &LaunchConfig,
    ) -> Self {
        let mut env = contract_env(paths, launch);
        env.push(("NODE_ENV".into(), "production".into()));
        Self {
            program: node.to_path_buf(),
            args: vec![backend_dir.join("server.js").into_os_string()],
            cwd: backend_dir.to_path_buf(),
            env,
            port: launch.port,
            token: launch.token.clone(),
        }
    }
}

/// The env contract (backend-contract.md §2) for the desktop profile: encrypted
/// local-users mode on loopback, serving the bundled UI. Never sets dev-only flags.
pub fn contract_env(paths: &AppPaths, launch: &LaunchConfig) -> Vec<(String, String)> {
    let path = |p: &Path| p.to_string_lossy().into_owned();
    let mut env = vec![
        ("HOST".into(), "127.0.0.1".into()),
        ("PORT".into(), launch.port.to_string()),
        ("SSB_SYNC_TOKEN".into(), launch.token.clone()),
        ("ALLOWED_ORIGINS".into(), launch.origin()),
        ("SSB_STATIC_DIR".into(), path(&launch.static_dir)),
        ("SSB_EXIT_ON_STDIN_CLOSE".into(), "true".into()),
        ("SSB_STORAGE".into(), "sqlcipher".into()),
        ("SSB_LOCAL_USERS".into(), "true".into()),
        (
            "SSB_DATABASE_FILE".into(),
            path(&paths.legacy_database_file()),
        ),
        ("SSB_USERS_DIR".into(), path(&paths.users_dir)),
        ("SSB_BACKUP_DIR".into(), path(&paths.backup_dir)),
        // The sidecar gets a minimal, explicit environment (no inherited secrets).
        ("PATH".into(), "/usr/bin:/bin".into()),
    ];
    for key in ["HOME", "TMPDIR", "LANG"] {
        if let Ok(value) = std::env::var(key) {
            env.push((key.into(), value));
        }
    }
    env
}

/// A running backend process. Dropping it stops the process.
pub struct Backend {
    child: Child,
    /// Held open for the backend's lifetime; EOF tells it the shell is gone.
    stdin: Option<ChildStdin>,
    pub port: u16,
    pub token: String,
    pub log_file: PathBuf,
}

impl Backend {
    pub fn start(spec: &BackendSpec, log_file: &Path) -> io::Result<Self> {
        let log = open_log(log_file)?;
        let mut command = Command::new(&spec.program);
        command
            .args(&spec.args)
            .current_dir(&spec.cwd)
            .env_clear()
            .envs(spec.env.iter().map(|(k, v)| (k.as_str(), v.as_str())))
            .stdin(Stdio::piped())
            .stdout(Stdio::from(log.try_clone()?))
            .stderr(Stdio::from(log));
        let mut child = command.spawn().map_err(|error| {
            io::Error::new(
                error.kind(),
                format!("cannot start {}: {error}", spec.program.display()),
            )
        })?;
        let stdin = child.stdin.take();
        Ok(Self {
            child,
            stdin,
            port: spec.port,
            token: spec.token.clone(),
            log_file: log_file.to_path_buf(),
        })
    }

    pub fn origin(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    /// Poll `/healthz` until it answers 200 *from our own child*, the process dies,
    /// or the timeout passes. The port is probed free and then released before the
    /// backend binds it, so another local process could win that race; requiring the
    /// child to own the listener stops the per-launch token reaching an impostor.
    pub fn wait_healthy(&mut self, timeout: Duration) -> io::Result<()> {
        let deadline = Instant::now() + timeout;
        let mut foreign_listener = false;
        loop {
            if let Some(status) = self.child.try_wait()? {
                return Err(io::Error::other(format!(
                    "backend exited during startup ({status})"
                )));
            }
            if health_check(self.port) {
                if listener_owned_by(self.child.id(), self.port) {
                    return Ok(());
                }
                foreign_listener = true;
            }
            if Instant::now() >= deadline {
                let reason = if foreign_listener {
                    format!(
                        "another process is listening on port {} (not the backend)",
                        self.port
                    )
                } else {
                    format!("backend not healthy after {}s", timeout.as_secs())
                };
                return Err(io::Error::new(io::ErrorKind::TimedOut, reason));
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    /// SIGTERM, wait up to `grace` for a clean exit (stores closed, keys zeroed), then SIGKILL.
    pub fn stop(&mut self, grace: Duration) {
        if matches!(self.child.try_wait(), Ok(Some(_))) {
            return;
        }
        if let Ok(pid) = libc::pid_t::try_from(self.child.id()) {
            // SAFETY: plain signal to a child we spawned and still own.
            unsafe {
                libc::kill(pid, libc::SIGTERM);
            }
        }
        let deadline = Instant::now() + grace;
        while Instant::now() < deadline {
            if matches!(self.child.try_wait(), Ok(Some(_))) {
                self.stdin.take();
                return;
            }
            thread::sleep(Duration::from_millis(50));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
        self.stdin.take();
    }
}

impl Drop for Backend {
    fn drop(&mut self) {
        self.stop(STOP_GRACE);
    }
}

/// Ask the OS for a free loopback port. There is a small race until the backend
/// binds it; [`Backend::wait_healthy`] closes it by checking who owns the listener.
pub fn free_loopback_port() -> io::Result<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

/// True when process `pid` holds a TCP listener on `port`. Fails closed: if `lsof`
/// is missing or errors, ownership is not proven and startup is refused.
pub fn listener_owned_by(pid: u32, port: u16) -> bool {
    let Ok(output) = Command::new("/usr/sbin/lsof")
        .args(["-nP", "-a", "-p", &pid.to_string()])
        .arg(format!("-iTCP:{port}"))
        .args(["-sTCP:LISTEN", "-Fp"])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
    else {
        return false;
    };
    let wanted = format!("p{pid}");
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .any(|line| line == wanted)
}

/// 32 random bytes, hex encoded (64 chars). Satisfies backend `isSafeSyncToken`.
pub fn new_token() -> io::Result<String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes)
        .map_err(|e| io::Error::other(format!("random source failed: {e}")))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Minimal HTTP/1.1 GET without extra dependencies.
pub fn health_check(port: u16) -> bool {
    let Ok(mut stream) =
        TcpStream::connect_timeout(&(([127, 0, 0, 1], port).into()), Duration::from_millis(500))
    else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let request =
        format!("GET /healthz HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut head = [0u8; 16];
    let mut read = 0;
    while read < 12 {
        match stream.read(&mut head[read..]) {
            Ok(0) | Err(_) => break,
            Ok(n) => read += n,
        }
    }
    head[..read].starts_with(b"HTTP/1.1 200")
}

fn open_log(log_file: &Path) -> io::Result<File> {
    if let Some(dir) = log_file.parent() {
        fs::create_dir_all(dir)?;
    }
    if fs::metadata(log_file)
        .map(|m| m.len() > LOG_ROTATE_BYTES)
        .unwrap_or(false)
    {
        let _ = fs::rename(log_file, log_file.with_extension("log.1"));
    }
    let mut options = OpenOptions::new();
    options.create(true).append(true);
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    options.open(log_file)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn launch() -> LaunchConfig {
        LaunchConfig {
            port: 43_210,
            token: "a".repeat(64),
            static_dir: PathBuf::from("/App/Resources/dist"),
        }
    }

    fn env_map(env: &[(String, String)]) -> std::collections::HashMap<&str, &str> {
        env.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect()
    }

    #[test]
    fn token_is_64_lowercase_hex_and_unique() {
        let a = new_token().unwrap();
        let b = new_token().unwrap();
        assert_eq!(a.len(), 64);
        assert!(a
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        assert_ne!(a, b);
    }

    #[test]
    fn free_port_is_bindable_on_loopback() {
        let port = free_loopback_port().unwrap();
        assert!(port > 0);
        TcpListener::bind(("127.0.0.1", port)).unwrap();
    }

    #[test]
    fn contract_env_is_the_desktop_profile() {
        let paths = AppPaths::for_home(Path::new("/Users/someone"));
        let env = contract_env(&paths, &launch());
        let map = env_map(&env);
        assert_eq!(map["HOST"], "127.0.0.1");
        assert_eq!(map["PORT"], "43210");
        assert_eq!(map["ALLOWED_ORIGINS"], "http://127.0.0.1:43210");
        assert_eq!(map["SSB_STORAGE"], "sqlcipher");
        assert_eq!(map["SSB_LOCAL_USERS"], "true");
        assert_eq!(map["SSB_EXIT_ON_STDIN_CLOSE"], "true");
        assert_eq!(map["SSB_STATIC_DIR"], "/App/Resources/dist");
        assert!(map["SSB_USERS_DIR"].ends_with("Application Support/SimpleSafeBanking/users"));
        assert_eq!(map["PATH"], "/usr/bin:/bin");
    }

    #[test]
    fn contract_env_never_enables_dev_only_flags() {
        let paths = AppPaths::for_home(Path::new("/Users/someone"));
        let env = contract_env(&paths, &launch());
        for key in [
            "SSB_TRUSTED_DEV_PROXY",
            "SSB_DEV_DISABLE_AUTO_LOCK",
            "SSB_ALLOW_WEAK_TEST_PASSWORDS",
            "SSB_KEYCHAIN_HELPER",
        ] {
            assert!(!env.iter().any(|(k, _)| k == key), "{key} must not be set");
        }
    }

    #[test]
    fn node_sidecar_runs_server_js_without_secrets_in_argv() {
        let paths = AppPaths::for_home(Path::new("/Users/someone"));
        let spec = BackendSpec::node_sidecar(
            Path::new("/App/MacOS/node"),
            Path::new("/App/Resources/backend"),
            &paths,
            &launch(),
        );
        assert_eq!(spec.program, Path::new("/App/MacOS/node"));
        assert_eq!(
            spec.args,
            vec![OsString::from("/App/Resources/backend/server.js")]
        );
        assert!(spec
            .args
            .iter()
            .all(|a| !a.to_string_lossy().contains(&spec.token)));
        assert_eq!(env_map(&spec.env)["NODE_ENV"], "production");
    }

    #[test]
    fn listener_ownership_is_proven_per_process() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(listener_owned_by(std::process::id(), port));
        // Not owned by some other process (pid 1), nor by us on a different port.
        assert!(!listener_owned_by(1, port));
        let other = free_loopback_port().unwrap();
        assert!(!listener_owned_by(std::process::id(), other));
    }

    #[test]
    fn health_check_is_false_when_nothing_listens() {
        let port = free_loopback_port().unwrap();
        assert!(!health_check(port));
    }

    /// Spawns the real Node backend from the repo. Needs `npm run setup:personal-dev`.
    /// Run with: cargo test -- --ignored
    #[test]
    #[ignore]
    fn real_node_backend_starts_answers_and_stops_cleanly() {
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let paths = AppPaths::for_override(tmp.path());
        paths.ensure_private_dirs().unwrap();
        let site = tmp.path().join("site");
        fs::create_dir(&site).unwrap();
        fs::write(site.join("index.html"), "<!doctype html><title>t</title>").unwrap();
        let launch = LaunchConfig::new(site).unwrap();
        let node = which_node();
        let spec = BackendSpec::node_sidecar(&node, &repo.join("backend"), &paths, &launch);
        let mut backend = Backend::start(&spec, &paths.backend_log_file()).unwrap();
        backend.wait_healthy(HEALTH_TIMEOUT).unwrap();
        backend.stop(STOP_GRACE);
        let log = fs::read_to_string(paths.backend_log_file()).unwrap();
        assert!(log.contains("SSB API listening"), "{log}");
        assert!(log.contains("SSB API stopping (SIGTERM)"), "{log}");
    }

    fn which_node() -> PathBuf {
        let output = Command::new("/usr/bin/env")
            .args(["which", "node"])
            .output()
            .unwrap();
        PathBuf::from(String::from_utf8(output.stdout).unwrap().trim())
    }
}
