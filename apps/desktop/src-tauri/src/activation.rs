//! Browser-brokered license activation. `activate_license` opens the checkout
//! page, listens on a dedicated loopback port and waits for the activation
//! token — either pushed automatically by the /activate success page's inline
//! fetch, or via the prflow:// deep link behind its Open Nod button
//! (watch_deep_links below). The received token is verified offline
//! (license::verify_license_token) and persisted; the command resolves to the
//! new license state so the webview can flip without a refetch.
//!
//! The port is deliberately not the OAuth one (auth.rs, 8765): a purchase and
//! a sign-in can overlap, and the OAuth code catcher treats a token-only
//! query as a CSRF state mismatch — sharing the port would let either flow
//! abort the other. Browser reality for the page's automatic fetch: Firefox
//! fires it plainly; Chromium sends a preflight (Private Network Access) and
//! under Local Network Access shows a permission prompt, so OPTIONS answers
//! 204 with Access-Control-Allow-Private-Network; Safari blocks
//! https→loopback as mixed content entirely and always needs the button.
//! Accepted trade-off: anything already bound to this port on a shared
//! machine could receive a token — a license token is copyable by design
//! (no-DRM stance), so this buys UX, not security theatre.
//!
//! The checkout URL is compile-time (`NOD_CHECKOUT_URL`) like the OAuth
//! secrets; without it — every dev build until a merchant account exists —
//! the command fails fast with a clear message instead of opening a browser.
//!
//! Accepted streams get a short read timeout: a connection that sends
//! nothing (port scanner, endpoint-security probe) must not park the wait
//! thread in read() forever — it drops back into the accept loop instead.
//! The overall window is 30 minutes because it spans the whole checkout,
//! card entry and 3-D Secure included, and the timeout copy points a buyer
//! who already paid at the still-valid receipt page, never at Buy again.

use std::io::Read;
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

use tauri::AppHandle;
use tauri_plugin_deep_link::DeepLinkExt;

use crate::auth::{focus_main, open_in_browser, page, success_page, write_response};
use crate::license::{self, LicenseState};

const PURCHASE_PORT: u16 = 8766;
const CHECKOUT_URL: Option<&str> = option_env!("NOD_CHECKOUT_URL");
const WAIT_LIMIT: Duration = Duration::from_secs(30 * 60);
const READ_TIMEOUT: Duration = Duration::from_secs(5);

#[tauri::command]
pub async fn activate_license(app: AppHandle) -> Result<LicenseState, String> {
    let checkout_url = CHECKOUT_URL
        .ok_or_else(|| "Purchasing isn't configured in this build.".to_string())?;
    let pubkey = license::configured_pubkey()
        .ok_or_else(|| "License verification isn't configured in this build.".to_string())?;

    let listener = TcpListener::bind(("127.0.0.1", PURCHASE_PORT)).map_err(|_| {
        "Activation is already waiting in another window — finish checkout there, \
         or restart Nod if this keeps happening."
            .to_string()
    })?;
    open_in_browser(checkout_url)?;

    let token = tokio::task::spawn_blocking(move || wait_for_token(listener, pubkey))
        .await
        .map_err(|e| format!("activation task failed: {e}"))??;

    license::store_license_token(&app, &token)?;
    focus_main(&app);
    Ok(license::get_license_state(app))
}

fn wait_for_token(listener: TcpListener, pubkey: &str) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + WAIT_LIMIT;

    loop {
        if Instant::now() > deadline {
            return Err(
                "Activation timed out. If you already paid, reopen the receipt page — \
                 the activation link works for 48 hours."
                    .to_string(),
            );
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_nonblocking(false).ok();
                stream.set_read_timeout(Some(READ_TIMEOUT)).ok();
                match handle_connection(&mut stream, pubkey) {
                    Some(token) => return Ok(token),
                    None => continue,
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => return Err(format!("local activation server error: {e}")),
        }
    }
}

/// Answers one hit on the activation listener. Preflights get the private
/// network opt-in and keep the loop alive; only a GET /callback with a token
/// that actually verifies ends the wait, so a squatter or typo can't complete
/// activation with garbage.
fn handle_connection(stream: &mut TcpStream, pubkey: &str) -> Option<String> {
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf).ok()?;
    let req = String::from_utf8_lossy(&buf[..n]);
    let first_line = req.lines().next().unwrap_or("");
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("");

    if method == "OPTIONS" {
        write_preflight_response(stream);
        return None;
    }
    if !path.starts_with("/callback") {
        write_response(stream, "404 Not Found", &page("Not found."));
        return None;
    }

    let parsed = url::Url::parse(&format!("http://127.0.0.1{path}")).ok()?;
    let token = parsed
        .query_pairs()
        .find(|(k, _)| k == "token")
        .map(|(_, v)| v.into_owned());

    match token {
        Some(token) if license::verify_license_token(&token, pubkey).is_some() => {
            write_response(
                stream,
                "200 OK",
                &success_page("Purchase verified! Sending you back to Nod…"),
            );
            Some(token)
        }
        Some(_) => {
            write_response(
                stream,
                "400 Bad Request",
                &page("That activation link didn't verify. Try Open Nod again."),
            );
            None
        }
        None => {
            write_response(stream, "400 Bad Request", &page("Missing activation token."));
            None
        }
    }
}

fn write_preflight_response(stream: &mut TcpStream) {
    use std::io::Write;
    let _ = write!(
        stream,
        "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET\r\nAccess-Control-Allow-Private-Network: true\r\nConnection: close\r\n\r\n"
    );
    let _ = stream.flush();
}

/// Wires the prflow:// scheme: drains any URL the app was launched with
/// (cold start via the activation page's Open Nod button), subscribes to
/// URLs arriving while running, and best-effort registers the scheme at
/// runtime for installs the bundler's metadata doesn't cover (dev builds,
/// portable copies). Only `prflow://purchase?token=…` is understood today;
/// other paths are reserved for the §11a "Open in Nod" extension and are
/// ignored, never errors — a stray link must not pop dialogs.
pub fn watch_deep_links(app: &AppHandle) {
    let _ = app.deep_link().register_all();
    if let Ok(Some(urls)) = app.deep_link().get_current() {
        handle_deep_link_urls(app, &urls);
    }
    let handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        handle_deep_link_urls(&handle, &event.urls());
    });
}

fn handle_deep_link_urls(app: &AppHandle, urls: &[url::Url]) {
    let Some(pubkey) = license::configured_pubkey() else {
        return;
    };
    for url in urls {
        let Some(token) = purchase_token(url) else {
            continue;
        };
        if license::verify_license_token(&token, pubkey).is_some() {
            let _ = license::store_license_token(app, &token);
            focus_main(app);
        }
    }
}

fn purchase_token(url: &url::Url) -> Option<String> {
    if url.scheme() != "prflow" || url.host_str() != Some("purchase") {
        return None;
    }
    url.query_pairs()
        .find(|(key, _)| key == "token")
        .map(|(_, value)| value.into_owned())
}

#[cfg(test)]
#[path = "activation_tests.rs"]
mod tests;
