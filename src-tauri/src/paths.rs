//! Filesystem locations used by the desktop app (docs/adr/0004-desktop-data-location.md).

use std::fs;
use std::io;
use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
use std::path::{Path, PathBuf};

pub const APP_DIR_NAME: &str = "SimpleSafeBanking";

/// Overrides the data root (and puts logs under it). For testing a build
/// against scratch data without touching the real workspace.
pub const DATA_DIR_OVERRIDE_ENV: &str = "SSB_DESKTOP_DATA_DIR";

/// The single definition of "an override is set": a non-empty value. `from_env` and the
/// single-instance setup in `lib.rs` both use it, so they can never disagree (an empty
/// variable must mean "no override" in both places).
pub fn override_value(value: Option<std::ffi::OsString>) -> Option<std::ffi::OsString> {
    value.filter(|v| !v.is_empty())
}

pub fn override_active() -> bool {
    override_value(std::env::var_os(DATA_DIR_OVERRIDE_ENV)).is_some()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppPaths {
    /// `~/Library/Application Support/SimpleSafeBanking`
    pub data_root: PathBuf,
    /// `<data_root>/users`: registry + per-user encrypted databases.
    pub users_dir: PathBuf,
    /// `<data_root>/backups`: only used outside local-users mode.
    pub backup_dir: PathBuf,
    /// `~/Library/Logs/SimpleSafeBanking`
    pub log_dir: PathBuf,
    /// True when `SSB_DESKTOP_DATA_DIR` redirected the data root (a scratch run).
    pub scratch: bool,
}

impl AppPaths {
    pub fn for_home(home: &Path) -> Self {
        Self::with_roots(
            home.join("Library/Application Support").join(APP_DIR_NAME),
            home.join("Library/Logs").join(APP_DIR_NAME),
            false,
        )
    }

    pub fn for_override(root: &Path) -> Self {
        Self::with_roots(root.to_path_buf(), root.join("logs"), true)
    }

    fn with_roots(data_root: PathBuf, log_dir: PathBuf, scratch: bool) -> Self {
        Self {
            users_dir: data_root.join("users"),
            backup_dir: data_root.join("backups"),
            data_root,
            log_dir,
            scratch,
        }
    }

    /// Resolve from the environment: the override if set, otherwise `$HOME`.
    pub fn from_env() -> io::Result<Self> {
        if let Some(root) = override_value(std::env::var_os(DATA_DIR_OVERRIDE_ENV)) {
            let root = PathBuf::from(root);
            if !root.is_absolute() {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    format!("{DATA_DIR_OVERRIDE_ENV} must be an absolute path"),
                ));
            }
            return Ok(Self::for_override(&root));
        }
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "HOME is not set"))?;
        Ok(Self::for_home(&home))
    }

    /// Legacy single-user database path the backend expects in `SSB_DATABASE_FILE`.
    /// It normally doesn't exist in the desktop profile, so no legacy migration is offered.
    pub fn legacy_database_file(&self) -> PathBuf {
        self.data_root.join("workspace.ssbdb")
    }

    /// Held for the whole run so only one app instance uses this data folder.
    pub fn lock_file(&self) -> PathBuf {
        self.data_root.join(".app.lock")
    }

    /// Window title. Scratch runs are labelled so they can't be mistaken for the real workspace.
    pub fn window_title(&self) -> &'static str {
        if self.scratch {
            "SimpleSafeBanking (scratch data)"
        } else {
            "SimpleSafeBanking"
        }
    }

    pub fn backend_log_file(&self) -> PathBuf {
        self.log_dir.join("backend.log")
    }

    /// Create every directory with mode 0700 and refuse symlinked or shared ones.
    pub fn ensure_private_dirs(&self) -> io::Result<()> {
        for dir in [
            &self.data_root,
            &self.users_dir,
            &self.backup_dir,
            &self.log_dir,
        ] {
            ensure_private_dir(dir)?;
        }
        Ok(())
    }
}

fn ensure_private_dir(dir: &Path) -> io::Result<()> {
    if !dir.exists() {
        fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(dir)?;
    }
    let meta = fs::symlink_metadata(dir)?;
    if meta.file_type().is_symlink() || !meta.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("{} must be a real directory", dir.display()),
        ));
    }
    if meta.permissions().mode() & 0o077 != 0 {
        fs::set_permissions(dir, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn home_layout_matches_adr_0004() {
        let paths = AppPaths::for_home(Path::new("/Users/someone"));
        assert_eq!(
            paths.data_root,
            Path::new("/Users/someone/Library/Application Support/SimpleSafeBanking")
        );
        assert_eq!(paths.users_dir, paths.data_root.join("users"));
        assert_eq!(
            paths.log_dir,
            Path::new("/Users/someone/Library/Logs/SimpleSafeBanking")
        );
        assert_eq!(
            paths.legacy_database_file(),
            paths.data_root.join("workspace.ssbdb")
        );
    }

    #[test]
    fn empty_override_means_no_override() {
        use std::ffi::OsString;
        assert_eq!(override_value(None), None);
        assert_eq!(override_value(Some(OsString::new())), None);
        assert_eq!(
            override_value(Some(OsString::from("/tmp/x"))),
            Some(OsString::from("/tmp/x"))
        );
    }

    #[test]
    fn scratch_runs_are_labelled_and_get_their_own_lock_file() {
        let real = AppPaths::for_home(Path::new("/Users/someone"));
        let scratch = AppPaths::for_override(Path::new("/tmp/scratch"));
        assert!(!real.scratch);
        assert!(scratch.scratch);
        assert_eq!(real.window_title(), "SimpleSafeBanking");
        assert!(scratch.window_title().contains("scratch"));
        assert_eq!(scratch.lock_file(), Path::new("/tmp/scratch/.app.lock"));
        assert_ne!(real.lock_file(), scratch.lock_file());
    }

    #[test]
    fn creates_private_directories_and_tightens_modes() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = AppPaths::for_override(&tmp.path().join("root"));
        paths.ensure_private_dirs().unwrap();
        fs::set_permissions(&paths.users_dir, fs::Permissions::from_mode(0o755)).unwrap();
        paths.ensure_private_dirs().unwrap();
        for dir in [
            &paths.data_root,
            &paths.users_dir,
            &paths.backup_dir,
            &paths.log_dir,
        ] {
            let mode = fs::metadata(dir).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o700, "{}", dir.display());
        }
    }

    #[test]
    fn refuses_a_symlinked_data_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let real = tmp.path().join("real");
        fs::create_dir(&real).unwrap();
        let link = tmp.path().join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        assert!(AppPaths::for_override(&link).ensure_private_dirs().is_err());
    }
}
