//! Exercises the activation listener's connection handler over real loopback
//! sockets — the fixture token is the same web-signed one license_tests.rs
//! uses, so a verified activation here proves the whole receive path.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

use super::handle_connection;

const PUBKEY: &str = "248acbdbaf9e050196de704bea2d68770e519150d103b587dae2d9cad53dd930";
const TOKEN: &str = "eyJvcmRlcklkIjoib3JkZXJfMSIsInN1YmplY3QiOiJnaXRodWI6Z2l0aHViLmNvbTo1ODMyMzEiLCJ1cGRhdGVzVW50aWwiOiIyMDI3LTA3LTE4Iiwic2lnbmF0dXJlIjoiMjcyMjI4ZDk0NGI2M2M1OWQ5NjNmZjRjNmM5YzU3N2NiNzAxZWE3ZjYyY2Q4YzUwNTI4OTU0ZWIyOTI3ZDUyNjVlZDEzZjBkYjE1YjBhMTc0OWQyN2FjMDkwZTgxMjkwZmM3NGZlNmRjNmJmZDBiMzkxOTBhNmIxODcxMjYyMDIifQ";

fn roundtrip(request: &str) -> (Option<String>, String) {
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();

    let mut client = TcpStream::connect(("127.0.0.1", port)).unwrap();
    client.write_all(request.as_bytes()).unwrap();
    client.flush().unwrap();

    let (mut server_side, _) = listener.accept().unwrap();
    let token = handle_connection(&mut server_side, PUBKEY);
    drop(server_side);

    let mut response = String::new();
    client.read_to_string(&mut response).unwrap();
    (token, response)
}

#[test]
fn a_verified_token_completes_activation() {
    let (token, response) = roundtrip(&format!(
        "GET /callback?token={TOKEN} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
    ));
    assert_eq!(token.as_deref(), Some(TOKEN));
    assert!(response.starts_with("HTTP/1.1 200"));
}

#[test]
fn an_unverifiable_token_keeps_waiting() {
    let (token, response) =
        roundtrip("GET /callback?token=garbage HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
    assert_eq!(token, None);
    assert!(response.starts_with("HTTP/1.1 400"));
}

#[test]
fn a_missing_token_keeps_waiting() {
    let (token, response) = roundtrip("GET /callback HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
    assert_eq!(token, None);
    assert!(response.starts_with("HTTP/1.1 400"));
}

#[test]
fn preflight_gets_the_private_network_opt_in() {
    let (token, response) = roundtrip("OPTIONS /callback HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
    assert_eq!(token, None);
    assert!(response.starts_with("HTTP/1.1 204"));
    assert!(response.contains("Access-Control-Allow-Private-Network: true"));
}

#[test]
fn purchase_token_reads_only_the_purchase_deep_link() {
    let parse = |s: &str| url::Url::parse(s).unwrap();
    assert_eq!(
        super::purchase_token(&parse("nod://purchase?token=abc")),
        Some("abc".to_string())
    );
    assert_eq!(super::purchase_token(&parse("nod://purchase")), None);
    assert_eq!(
        super::purchase_token(&parse("nod://pr/acme/rocket/1?token=abc")),
        None
    );
    assert_eq!(
        super::purchase_token(&parse("https://purchase?token=abc")),
        None
    );
}

#[test]
fn pr_link_reads_only_a_complete_pr_deep_link() {
    let parse = |s: &str| url::Url::parse(s).unwrap();
    assert_eq!(
        super::pr_link(&parse("nod://pr/acme/rocket/1")),
        Some(super::PrLink {
            owner: "acme".to_string(),
            repo: "rocket".to_string(),
            number: 1,
        })
    );
    assert_eq!(super::pr_link(&parse("nod://pr/acme/rocket")), None);
    assert_eq!(
        super::pr_link(&parse("nod://pr/acme/rocket/notanumber")),
        None
    );
    assert_eq!(super::pr_link(&parse("nod://pr/acme/rocket/1/extra")), None);
    assert_eq!(super::pr_link(&parse("nod://purchase?token=abc")), None);
    assert_eq!(super::pr_link(&parse("https://pr/acme/rocket/1")), None);
}

#[test]
fn ledger_link_reads_a_topic_and_decodes_its_name() {
    let parse = |s: &str| url::Url::parse(s).unwrap();
    assert_eq!(
        super::ledger_link(&parse("nod://ledger/acme/rocket/repo-store")),
        Some(super::LedgerLink {
            owner: "acme".to_string(),
            repo: "rocket".to_string(),
            topic: "repo-store".to_string(),
        })
    );
    // The queue percent-encodes the topic segment; any label survives.
    assert_eq!(
        super::ledger_link(&parse("nod://ledger/acme/rocket/chat%20panel"))
            .map(|l| l.topic),
        Some("chat panel".to_string())
    );
    assert_eq!(super::ledger_link(&parse("nod://ledger/acme/rocket")), None);
    assert_eq!(
        super::ledger_link(&parse("nod://ledger/acme/rocket/topic/extra")),
        None
    );
    assert_eq!(super::ledger_link(&parse("nod://pr/acme/rocket/1")), None);
}

#[test]
fn an_unknown_path_is_a_404() {
    let (token, response) = roundtrip("GET /favicon.ico HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
    assert_eq!(token, None);
    assert!(response.starts_with("HTTP/1.1 404"));
}
