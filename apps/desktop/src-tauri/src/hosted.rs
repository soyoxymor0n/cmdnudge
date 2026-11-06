//! Sync with an account (#18), app side: linking, status and the server's availability.
//!
//! Linking: the app opens `<server>/connect?state=<random>` in the browser. After sign-in the page
//! hands back `cmdnudge://link?token=<link token>&state=<same>`. The state must match the one
//! this app sent (so no other page can push a link onto it), and the token must have the
//! server's shape. The token lives in the local settings table, never in the settings the
//! window sees. The counter sync itself is `sync::hosted_sync`.

use std::sync::Mutex;
use std::time::Duration;

pub const DEFAULT_SERVER: &str = "https://cmdnudge.com";
pub const TOKEN_KEY: &str = "hosted_token";

static PENDING_STATE: Mutex<Option<String>> = Mutex::new(None);

/// The sync server. `CMDNUDGE_SERVER` overrides it for development (http only for 127.0.0.1).
pub fn server() -> String {
    std::env::var("CMDNUDGE_SERVER")
        .ok()
        .filter(|s| s.starts_with("https://") || s.starts_with("http://127.0.0.1:"))
        .unwrap_or_else(|| DEFAULT_SERVER.to_string())
        .trim_end_matches('/')
        .to_string()
}

#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Availability {
    /// The server accepts accounts.
    Open,
    /// The server answered, but account sync is not set up there yet (503 / 404).
    NotYet,
    /// No answer (offline, DNS, timeout).
    Offline,
}

pub fn availability(server: &str) -> Availability {
    let res = ureq::get(&format!("{server}/api/link"))
        .config()
        .timeout_global(Some(Duration::from_secs(8)))
        .http_status_as_error(false)
        .build()
        .call();
    match res {
        Ok(r) if r.status().as_u16() == 200 => Availability::Open,
        Ok(_) => Availability::NotYet,
        Err(_) => Availability::Offline,
    }
}

fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).expect("system randomness");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

/// Starts a link: remembers a fresh state and returns the page to open in the browser.
pub fn begin_link(server: &str) -> String {
    let state = random_hex(16);
    *PENDING_STATE.lock().unwrap() = Some(state.clone());
    format!("{server}/connect?state={state}")
}

pub fn valid_token(t: &str) -> bool {
    t.len() == 46 && t.starts_with("cn_") && t[3..].bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Checks a `cmdnudge://link?...` URL against the expected state and returns the token.
pub fn parse_link_url(url: &str, expected_state: Option<&str>) -> Result<String, String> {
    let rest = url.strip_prefix("cmdnudge://link?").ok_or("not a link URL")?;
    let (mut token, mut state) = (None, None);
    for pair in rest.split('&') {
        match pair.split_once('=') {
            Some(("token", v)) => token = Some(v.to_string()),
            Some(("state", v)) => state = Some(v.to_string()),
            _ => {}
        }
    }
    let expected = expected_state.ok_or("no sign-in was started from this app")?;
    if state.as_deref() != Some(expected) {
        return Err("this link was not started from this app".into());
    }
    let token = token.ok_or("the link has no key")?;
    if !valid_token(&token) {
        return Err("the link key is malformed".into());
    }
    Ok(token)
}

/// Finishes a link from the deep link. The pending state is used up either way.
pub fn finish_link(url: &str) -> Result<String, String> {
    let expected = PENDING_STATE.lock().unwrap().take();
    parse_link_url(url, expected.as_deref())
}

/// Tells the server to forget this app's link (sign out). Best effort.
pub fn unlink(server: &str, token: &str) {
    let _ = ureq::delete(&format!("{server}/api/link"))
        .config()
        .timeout_global(Some(Duration::from_secs(8)))
        .build()
        .header("Authorization", &format!("Bearer {token}"))
        .call();
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "cn_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

    #[test]
    fn a_link_needs_the_state_this_app_sent() {
        assert_eq!(TOKEN.len(), 46);
        let url = format!("cmdnudge://link?token={TOKEN}&state=ab12");
        assert_eq!(parse_link_url(&url, Some("ab12")).unwrap(), TOKEN);
        // NEGATIVE: another page pushing its own link onto the app.
        assert!(parse_link_url(&url, Some("ff00")).is_err());
        assert!(parse_link_url(&url, None).is_err());
        assert!(parse_link_url(&format!("cmdnudge://link?token={TOKEN}"), Some("ab12")).is_err());
        // Malformed keys and other URLs.
        assert!(parse_link_url("cmdnudge://link?token=cn_short&state=ab12", Some("ab12")).is_err());
        assert!(parse_link_url(&format!("cmdnudge://other?token={TOKEN}&state=ab12"), Some("ab12")).is_err());
        assert!(parse_link_url(&format!("https://evil.example/link?token={TOKEN}&state=ab12"), Some("ab12")).is_err());
    }

    #[test]
    fn the_state_is_used_once() {
        let open = begin_link("https://cmdnudge.com");
        let state = open.rsplit('=').next().unwrap().to_string();
        assert_eq!(state.len(), 32);
        let url = format!("cmdnudge://link?token={TOKEN}&state={state}");
        assert_eq!(finish_link(&url).unwrap(), TOKEN);
        assert!(finish_link(&url).is_err(), "a replayed link is refused");
    }

    #[test]
    fn availability_reads_the_servers_answer() {
        use std::io::{Read, Write};
        for (status, want) in [(200, Availability::Open), (503, Availability::NotYet)] {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let url = format!("http://{}", l.local_addr().unwrap());
            let h = std::thread::spawn(move || {
                let (mut s, _) = l.accept().unwrap();
                let mut buf = [0u8; 4096];
                let _ = s.read(&mut buf);
                let _ = s.write_all(format!("HTTP/1.1 {status} X\r\ncontent-length: 2\r\nconnection: close\r\n\r\n{{}}").as_bytes());
            });
            assert_eq!(availability(&url), want);
            h.join().unwrap();
        }
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", l.local_addr().unwrap());
        drop(l);
        assert_eq!(availability(&url), Availability::Offline);
    }
}
