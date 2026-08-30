use super::is_hex_sha;

#[test]
fn hex_shas_are_seven_to_forty_hex_chars() {
    assert!(!is_hex_sha("cafe12"));
    assert!(is_hex_sha("cafe123"));
    assert!(is_hex_sha(&"a".repeat(40)));
    assert!(!is_hex_sha(&"a".repeat(41)));
    assert!(!is_hex_sha("cafe12g"));
    assert!(!is_hex_sha(""));
}
