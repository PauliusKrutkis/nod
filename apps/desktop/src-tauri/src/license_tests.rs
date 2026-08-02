//! The valid-token fixture below was produced by the web signer
//! (apps/web/functions/lib/license-token.ts, seed `ab`×32) — the assertion
//! that it verifies here is the cross-stack proof that the Rust canonical
//! bytes match the web's `JSON.stringify` byte-for-byte. Regenerate with a
//! throwaway vitest calling `signLicenseToken` if the payload shape changes.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;

use super::{trial_days_left, verify_license_token, LicensePayload};

const PUBKEY: &str = "248acbdbaf9e050196de704bea2d68770e519150d103b587dae2d9cad53dd930";
const TOKEN: &str = "eyJvcmRlcklkIjoib3JkZXJfMSIsInN1YmplY3QiOiJnaXRodWI6Z2l0aHViLmNvbTo1ODMyMzEiLCJ1cGRhdGVzVW50aWwiOiIyMDI3LTA3LTE4Iiwic2lnbmF0dXJlIjoiMjcyMjI4ZDk0NGI2M2M1OWQ5NjNmZjRjNmM5YzU3N2NiNzAxZWE3ZjYyY2Q4YzUwNTI4OTU0ZWIyOTI3ZDUyNjVlZDEzZjBkYjE1YjBhMTc0OWQyN2FjMDkwZTgxMjkwZmM3NGZlNmRjNmJmZDBiMzkxOTBhNmIxODcxMjYyMDIifQ";

const DAY: u64 = 24 * 60 * 60;

fn rewrap(json: &str) -> String {
    URL_SAFE_NO_PAD.encode(json.as_bytes())
}

fn token_json() -> String {
    String::from_utf8(URL_SAFE_NO_PAD.decode(TOKEN).unwrap()).unwrap()
}

#[test]
fn verifies_a_token_signed_by_the_web_stack() {
    let payload = verify_license_token(TOKEN, PUBKEY).expect("fixture token must verify");
    assert_eq!(
        payload,
        LicensePayload {
            order_id: "order_1".into(),
            subject: "github:github.com:583231".into(),
            updates_until: "2027-07-18".into(),
        }
    );
}

#[test]
fn rejects_a_tampered_payload() {
    let tampered = rewrap(&token_json().replace("2027-07-18", "2099-07-18"));
    assert_eq!(verify_license_token(&tampered, PUBKEY), None);
}

#[test]
fn rejects_the_wrong_public_key() {
    let other_key = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
    assert_eq!(verify_license_token(TOKEN, other_key), None);
}

#[test]
fn ignores_extra_keys_without_trusting_them() {
    let with_extra = rewrap(&token_json().replace("{", "{\"role\":\"admin\",", ));
    let payload = verify_license_token(&with_extra, PUBKEY).expect("extra keys must not break");
    assert_eq!(payload.updates_until, "2027-07-18");
}

#[test]
fn malformed_input_is_none_not_a_panic() {
    for garbage in [
        "",
        "not base64url!!",
        &rewrap("[]"),
        &rewrap("{\"orderId\":\"x\"}"),
        &rewrap("{\"orderId\":\"x\",\"subject\":\"y\",\"updatesUntil\":\"z\",\"signature\":\"nothex\"}"),
        &rewrap("{\"orderId\":\"x\",\"subject\":\"y\",\"updatesUntil\":\"z\",\"signature\":\"abcd\"}"),
    ] {
        assert_eq!(verify_license_token(garbage, PUBKEY), None);
    }
}

#[test]
fn rejects_a_bad_public_key() {
    assert_eq!(verify_license_token(TOKEN, "abc"), None);
    assert_eq!(verify_license_token(TOKEN, &"00".repeat(31)), None);
}

#[test]
fn trial_counts_whole_days_down_from_fourteen() {
    assert_eq!(trial_days_left(1000, 1000), 14);
    assert_eq!(trial_days_left(1000, 1000 + DAY - 1), 14);
    assert_eq!(trial_days_left(1000, 1000 + DAY), 13);
    assert_eq!(trial_days_left(1000, 1000 + 13 * DAY), 1);
    assert_eq!(trial_days_left(1000, 1000 + 14 * DAY), 0);
    assert_eq!(trial_days_left(1000, 1000 + 400 * DAY), 0);
}

#[test]
fn future_first_launch_clamps_to_a_full_trial() {
    assert_eq!(trial_days_left(5000, 1000), 14);
}
