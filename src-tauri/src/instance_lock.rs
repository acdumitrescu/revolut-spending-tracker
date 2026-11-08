//! One running app per data folder.
//!
//! `tauri-plugin-single-instance` is keyed by the app identifier, so it cannot tell a
//! scratch run (`SSB_DESKTOP_DATA_DIR`) from the real workspace: with the real app open, a
//! scratch launch would hand off to the real window and exit. This lock is per data
//! folder instead, so runs on different folders coexist and two runs on the same folder
//! can never both open its encrypted databases.
//!
//! `flock` is released by the kernel when the process dies, including `kill -9`, so a
//! crash never leaves a stale lock. The descriptor is opened close-on-exec (the Rust
//! default), so the backend sidecar does not inherit it.

use std::fs::{File, OpenOptions};
use std::io;
use std::os::fd::AsRawFd;
use std::os::unix::fs::OpenOptionsExt;
use std::path::Path;

#[derive(Debug)]
pub struct InstanceLock {
    _file: File,
}

impl InstanceLock {
    /// Take the exclusive lock, or fail with `ErrorKind::WouldBlock` if another process holds it.
    pub fn acquire(path: &Path) -> io::Result<Self> {
        let mut options = OpenOptions::new();
        options.create(true).write(true).truncate(false).mode(0o600);
        let file = options.open(path)?;
        // SAFETY: `flock` on a descriptor we own and keep open for the lock's lifetime.
        let rc = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
        if rc != 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Self { _file: file })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn second_acquire_on_the_same_file_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".app.lock");
        let first = InstanceLock::acquire(&path).unwrap();
        let second = InstanceLock::acquire(&path).unwrap_err();
        assert_eq!(second.kind(), io::ErrorKind::WouldBlock);
        drop(first);
    }

    #[test]
    fn lock_is_released_when_dropped() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".app.lock");
        drop(InstanceLock::acquire(&path).unwrap());
        InstanceLock::acquire(&path).unwrap();
    }

    #[test]
    fn different_folders_do_not_conflict() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let _first = InstanceLock::acquire(&a.path().join(".app.lock")).unwrap();
        let _second = InstanceLock::acquire(&b.path().join(".app.lock")).unwrap();
    }

    #[test]
    fn lock_file_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".app.lock");
        let _lock = InstanceLock::acquire(&path).unwrap();
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
}
