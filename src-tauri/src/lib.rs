//! SimpleSafeBanking desktop shell.
//!
//! Release builds: start the bundled backend sidecar, wait for `/healthz`, open the
//! window on the backend origin with the per-launch token injected, stop the
//! sidecar on exit. Debug builds (`npm run desktop:dev`) load the Vite dev server
//! started by `scripts/startPersonalDev.mjs` instead, for hot reload.
//! See docs/desktop/README.md.

pub mod alert;
pub mod backend;
pub mod instance_lock;
pub mod paths;
pub mod window;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{App, AppHandle, Manager, RunEvent, Url};

use backend::{Backend, BackendSpec, LaunchConfig, HEALTH_TIMEOUT, STOP_GRACE};
use instance_lock::InstanceLock;
use paths::AppPaths;

/// Set to `1` in a debug build to run the real sidecar instead of the Vite dev server.
pub const USE_SIDECAR_ENV: &str = "SSB_DESKTOP_USE_SIDECAR";

#[derive(Default)]
struct BackendState(Mutex<Option<Backend>>);

/// Holds the per-data-folder lock until the process exits, which is after the backend has
/// been stopped (`RunEvent::Exit`), so a new instance can never open the databases while
/// the old sidecar is still closing them.
#[derive(Default)]
struct LockState(Mutex<Option<InstanceLock>>);

pub fn run() {
    let mut builder = tauri::Builder::default();
    // The identifier-keyed hand-off ("a second launch focuses the running app") applies only to
    // the real workspace. It must be registered first. A scratch run (SSB_DESKTOP_DATA_DIR) skips
    // it: the plugin ignores the data folder, so it would hand a scratch launch to a running real
    // app. Scratch runs are protected by the per-folder lock in `setup` instead.
    if !paths::override_active() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            window::focus_main_window(app)
        }));
    }
    let app = builder
        .plugin(tauri_plugin_opener::init())
        .manage(BackendState::default())
        .manage(LockState::default())
        .setup(|app| {
            if let Err(message) = setup(app) {
                fail_startup(app.handle(), &message);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the SimpleSafeBanking desktop app");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            stop_backend(handle);
        }
    });
}

fn use_sidecar() -> bool {
    !cfg!(debug_assertions) || std::env::var(USE_SIDECAR_ENV).as_deref() == Ok("1")
}

fn setup(app: &mut App) -> Result<(), String> {
    if !use_sidecar() {
        let dev_url = app
            .config()
            .build
            .dev_url
            .clone()
            .ok_or("build.devUrl is not configured")?;
        window::create_main_window(app.handle(), dev_url, None, "SimpleSafeBanking (dev)")
            .map_err(|e| format!("cannot open window: {e}"))?;
        return Ok(());
    }

    let paths = AppPaths::from_env().map_err(|e| format!("cannot resolve app folders: {e}"))?;
    paths
        .ensure_private_dirs()
        .map_err(|e| format!("cannot prepare {}: {e}", paths.data_root.display()))?;

    // One app per data folder, taken before anything can open the encrypted databases.
    let lock = InstanceLock::acquire(&paths.lock_file()).map_err(|e| {
        if e.kind() == std::io::ErrorKind::WouldBlock {
            format!(
                "SimpleSafeBanking is already running with this data folder:\n{}\n\nQuit the other window first.",
                paths.data_root.display()
            )
        } else {
            format!("cannot lock {}: {e}", paths.lock_file().display())
        }
    })?;
    app.state::<LockState>()
        .0
        .lock()
        .map_err(|_| "lock state poisoned")?
        .replace(lock);

    let resources = app
        .path()
        .resource_dir()
        .map_err(|e| format!("cannot locate app resources: {e}"))?;
    let node = sidecar_path("node")?;
    let launch = LaunchConfig::new(resources.join("dist"))
        .map_err(|e| format!("cannot prepare launch: {e}"))?;
    let spec = BackendSpec::node_sidecar(&node, &resources.join("backend"), &paths, &launch);

    let log_file = paths.backend_log_file();
    let mut backend = Backend::start(&spec, &log_file)
        .map_err(|e| format!("{e}\n\nLog: {}", log_file.display()))?;
    if let Err(error) = backend.wait_healthy(HEALTH_TIMEOUT) {
        backend.stop(STOP_GRACE);
        return Err(format!(
            "The local backend did not start: {error}\n\nLog: {}",
            log_file.display()
        ));
    }

    let start_url = Url::parse(&format!("{}/app", backend.origin())).map_err(|e| e.to_string())?;
    let token = backend.token.clone();
    app.state::<BackendState>()
        .0
        .lock()
        .map_err(|_| "backend state poisoned")?
        .replace(backend);
    window::create_main_window(app.handle(), start_url, Some(&token), paths.window_title())
        .map_err(|e| format!("cannot open window: {e}"))?;
    Ok(())
}

/// Sidecars declared in `bundle.externalBin` sit next to the app executable.
fn sidecar_path(name: &str) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("cannot locate executable: {e}"))?;
    let path = exe
        .parent()
        .ok_or("executable has no parent folder")?
        .join(name);
    if path.is_file() {
        Ok(path)
    } else {
        Err(format!(
            "bundled runtime missing at {}. Rebuild with `npm run desktop:build`.",
            path.display()
        ))
    }
}

fn stop_backend(handle: &AppHandle) {
    if let Some(state) = handle.try_state::<BackendState>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(mut backend) = guard.take() {
                backend.stop(STOP_GRACE);
            }
        }
    }
}

fn fail_startup(handle: &AppHandle, message: &str) {
    eprintln!("SimpleSafeBanking failed to start: {message}");
    stop_backend(handle);
    let message = message.to_owned();
    let exit_handle = handle.clone();
    // The alert blocks until dismissed, so it runs off the main thread; then the app exits.
    std::thread::spawn(move || {
        alert::show_error("SimpleSafeBanking could not start", &message);
        exit_handle.exit(1);
    });
}
