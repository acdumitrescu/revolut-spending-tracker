//! Startup-failure alert.
//!
//! `tauri-plugin-dialog` hands the alert to the main thread, and in this app it never
//! produced a window: a refused or failed launch printed to stderr and then lingered as a
//! windowless process with a Dock icon (observed 2026-11-06; the window server listed no
//! dialog window for the process). `osascript` is always present, works from any thread and
//! always comes to the front. The repo's recovery scripts already use it the same way.
//!
//! The title and message are passed as arguments (`item 1/2 of argv`), never spliced into
//! the script text, so nothing in a message can be interpreted as AppleScript.

use std::ffi::OsString;
use std::process::{Command, Stdio};

const OSASCRIPT: &str = "/usr/bin/osascript";

/// Arguments for `osascript`: a fixed script, then `--`, then the title and the message.
pub fn osascript_args(title: &str, message: &str) -> Vec<OsString> {
    let script = [
        "on run argv",
        "display dialog (item 2 of argv) with title (item 1 of argv) buttons {\"OK\"} default button \"OK\" with icon stop",
        "end run",
    ];
    let mut args: Vec<OsString> = Vec::new();
    for line in script {
        args.push("-e".into());
        args.push(line.into());
    }
    args.push("--".into());
    args.push(title.into());
    args.push(message.into());
    args
}

/// Show the alert and block until it is dismissed. Failure to show it is not fatal: the
/// caller has already written the reason to stderr.
pub fn show_error(title: &str, message: &str) {
    let _ = Command::new(OSASCRIPT)
        .args(osascript_args(title, message))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_is_an_argument_never_part_of_the_script() {
        let hostile = "\" & (do shell script \"touch /tmp/pwned\") & \"";
        let args = osascript_args("Title", hostile);
        let strings: Vec<String> = args
            .iter()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        let dashdash = strings.iter().position(|a| a == "--").unwrap();
        // Everything before `--` is the fixed script; the hostile text appears only after it.
        assert!(strings[..dashdash].iter().all(|a| !a.contains("pwned")));
        assert_eq!(strings[dashdash + 1], "Title");
        assert_eq!(strings[dashdash + 2], hostile);
    }

    #[test]
    fn script_reads_title_and_message_from_argv() {
        let args = osascript_args("T", "M");
        let script = args
            .iter()
            .map(|a| a.to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join(" ");
        assert!(script.contains("item 2 of argv"));
        assert!(script.contains("item 1 of argv"));
    }
}
