//! Main window: loads the backend origin, injects the per-launch token
//! (docs/adr/0003-desktop-auth-token-injection.md) and pins navigation.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const MAIN_LABEL: &str = "main";

/// At most one external browser open per interval, so a compromised page cannot
/// spam the user's browser with tabs.
const EXTERNAL_OPEN_MIN_INTERVAL: Duration = Duration::from_secs(1);

/// Script run before any page script. The token is JSON-encoded (no injection)
/// and the global is frozen and non-writable.
pub fn init_script(token: Option<&str>) -> String {
    let payload = match token {
        Some(token) => serde_json::json!({ "syncToken": token }),
        None => serde_json::json!({}),
    };
    format!(
        "Object.defineProperty(window, '__SSB_DESKTOP__', {{ value: Object.freeze({payload}), writable: false, configurable: false, enumerable: false }});"
    )
}

/// What to do with a navigation request from the webview.
#[derive(Debug, PartialEq, Eq)]
pub enum Navigation {
    Allow,
    /// Open in the default browser instead (https/mailto only, no embedded credentials).
    OpenExternally,
    Block,
}

pub fn classify_navigation(url: &Url, app_origin: &Url) -> Navigation {
    let same_origin = |u: &Url| {
        u.scheme() == app_origin.scheme()
            && u.host() == app_origin.host()
            && u.port_or_known_default() == app_origin.port_or_known_default()
    };
    match url.scheme() {
        "http" | "https" if same_origin(url) => Navigation::Allow,
        // Downloads created by the page itself (Excel/JSON export).
        "blob" => match Url::parse(url.path()) {
            Ok(inner) if same_origin(&inner) => Navigation::Allow,
            _ => Navigation::Block,
        },
        "about" if url.as_str() == "about:blank" => Navigation::Allow,
        // `https://trusted.example@evil.example/` style links are phishing, not navigation.
        "https" if url.username().is_empty() && url.password().is_none() => {
            Navigation::OpenExternally
        }
        "mailto" => Navigation::OpenExternally,
        // Plain http to anything but the app origin (including other localhost
        // ports, which may be unrelated local services) is never opened or loaded.
        _ => Navigation::Block,
    }
}

/// Rate limiter for [`open_externally`].
#[derive(Clone, Default)]
struct OpenThrottle(Arc<Mutex<Option<Instant>>>);

impl OpenThrottle {
    fn allow(&self) -> bool {
        self.allow_at(Instant::now())
    }

    fn allow_at(&self, now: Instant) -> bool {
        let Ok(mut last) = self.0.lock() else {
            return false;
        };
        if matches!(*last, Some(previous) if now.saturating_duration_since(previous) < EXTERNAL_OPEN_MIN_INTERVAL)
        {
            return false;
        }
        *last = Some(now);
        true
    }
}

fn open_externally(app: &AppHandle, throttle: &OpenThrottle, url: &Url) {
    if !throttle.allow() {
        return;
    }
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_url(url.as_str(), None::<&str>);
}

pub fn create_main_window(
    app: &AppHandle,
    start_url: Url,
    token: Option<&str>,
    title: &str,
) -> tauri::Result<WebviewWindow> {
    let mut app_origin = start_url.clone();
    app_origin.set_path("/");
    app_origin.set_query(None);
    let throttle = OpenThrottle::default();
    let nav_app = app.clone();
    let nav_throttle = throttle.clone();
    let nav_origin = app_origin.clone();
    let window_app = app.clone();
    WebviewWindowBuilder::new(app, MAIN_LABEL, WebviewUrl::External(start_url))
        .title(title)
        .inner_size(1320.0, 860.0)
        .min_inner_size(960.0, 620.0)
        .initialization_script(init_script(token))
        .on_navigation(move |url| match classify_navigation(url, &nav_origin) {
            Navigation::Allow => true,
            Navigation::OpenExternally => {
                open_externally(&nav_app, &nav_throttle, url);
                false
            }
            Navigation::Block => false,
        })
        // `window.open` / `target=_blank` never create a second webview (which would
        // bypass the navigation policy above). External links go to the browser.
        .on_new_window(move |url, _features| {
            if classify_navigation(&url, &app_origin) == Navigation::OpenExternally {
                open_externally(&window_app, &throttle, &url);
            }
            NewWindowResponse::Deny
        })
        .build()
}

pub fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn origin() -> Url {
        Url::parse("http://127.0.0.1:43210/").unwrap()
    }

    fn classify(url: &str) -> Navigation {
        classify_navigation(&Url::parse(url).unwrap(), &origin())
    }

    #[test]
    fn allows_the_app_origin_only() {
        assert_eq!(
            classify("http://127.0.0.1:43210/app/budgets"),
            Navigation::Allow
        );
        // Other local ports and hostnames are unrelated services: never load or open them.
        assert_eq!(classify("http://127.0.0.1:43211/app"), Navigation::Block);
        assert_eq!(classify("http://localhost:43210/app"), Navigation::Block);
    }

    #[test]
    fn sends_web_links_to_the_browser() {
        assert_eq!(
            classify("https://www.revolut.com/"),
            Navigation::OpenExternally
        );
        assert_eq!(
            classify("mailto:someone@example.com"),
            Navigation::OpenExternally
        );
    }

    #[test]
    fn never_opens_plain_http_or_credentialed_links_externally() {
        assert_eq!(classify("http://example.com/"), Navigation::Block);
        assert_eq!(
            classify("https://www.revolut.com@evil.example/login"),
            Navigation::Block
        );
        assert_eq!(
            classify("https://user:pass@example.com/"),
            Navigation::Block
        );
        assert_eq!(classify("ftp://example.com/file"), Navigation::Block);
    }

    #[test]
    fn external_opens_are_rate_limited() {
        let throttle = OpenThrottle::default();
        let start = Instant::now();
        assert!(throttle.allow_at(start));
        assert!(!throttle.allow_at(start + Duration::from_millis(200)));
        assert!(!throttle.allow_at(start + Duration::from_millis(999)));
        assert!(throttle.allow_at(start + EXTERNAL_OPEN_MIN_INTERVAL));
    }

    #[test]
    fn allows_same_origin_blob_downloads_only() {
        assert_eq!(
            classify("blob:http://127.0.0.1:43210/5b8c-uuid"),
            Navigation::Allow
        );
        assert_eq!(
            classify("blob:https://evil.example/5b8c-uuid"),
            Navigation::Block
        );
    }

    #[test]
    fn blocks_local_and_script_schemes() {
        assert_eq!(classify("file:///etc/passwd"), Navigation::Block);
        assert_eq!(
            classify("data:text/html,<script>1</script>"),
            Navigation::Block
        );
        assert_eq!(classify("javascript:alert(1)"), Navigation::Block);
        assert_eq!(classify("ssh://host"), Navigation::Block);
    }

    #[test]
    fn init_script_json_encodes_and_freezes_the_token() {
        let script = init_script(Some("abc\"'</script>"));
        assert!(script.contains(r#""syncToken":"abc\"'</script>""#));
        assert!(script.contains("Object.freeze"));
        assert!(script.contains("writable: false"));
        assert!(!init_script(None).contains("syncToken"));
    }
}
