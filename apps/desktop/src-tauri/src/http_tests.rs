use super::*;

#[test]
fn conditional_304_serves_cached_body() {
    let cached = CachedResponse {
        etag: "\"abc\"".to_string(),
        body: serde_json::json!({ "cached": true }),
    };
    let out = resolve_conditional(304, Some("\"abc\""), Some(&cached), Value::Null);
    assert_eq!(
        out,
        Conditional::Cached(serde_json::json!({ "cached": true }))
    );
}

#[test]
fn conditional_200_stores_new_etag_and_body() {
    let out = resolve_conditional(
        200,
        Some("\"new\""),
        None,
        serde_json::json!({ "fresh": 1 }),
    );
    assert_eq!(
        out,
        Conditional::Fresh {
            body: serde_json::json!({ "fresh": 1 }),
            etag: Some("\"new\"".to_string()),
        }
    );
}

#[test]
fn conditional_304_without_cache_falls_back_to_fresh() {
    let out = resolve_conditional(304, None, None, Value::Null);
    assert_eq!(
        out,
        Conditional::Fresh {
            body: Value::Null,
            etag: None,
        }
    );
}

#[test]
fn conditional_200_without_etag_stores_nothing() {
    let out = resolve_conditional(200, None, None, serde_json::json!({ "x": 1 }));
    assert_eq!(
        out,
        Conditional::Fresh {
            body: serde_json::json!({ "x": 1 }),
            etag: None,
        }
    );
}

#[test]
fn org_restriction_names_the_org() {
    let msg = "Although you appear to have the correct authorization credentials, the `acme` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited. For more information on these restrictions, including how to enable this app, visit https://docs.github.com/articles/restricting-access-to-your-organization-s-data/";
    let out = org_restriction_error(msg).expect("should classify");
    assert!(out.starts_with("acme has not approved Nod yet."));
    assert!(out.contains("third-party access settings"));
    assert!(out.contains(ORG_APPROVAL_DOCS));
}

#[test]
fn org_restriction_reword_degrades_to_generic() {
    let msg = "Access to this resource is blocked by an OAuth App access restriction policy on one of your organizations.";
    let out = org_restriction_error(msg).expect("should classify");
    assert!(out.starts_with("An organization has not approved Nod yet."));
    assert!(out.contains(ORG_APPROVAL_DOCS));
}

#[test]
fn org_restriction_ignores_a_mangled_quote() {
    let msg = "The `two words` organization has enabled OAuth App access restrictions.";
    let out = org_restriction_error(msg).expect("should classify");
    assert!(out.starts_with("An organization has not approved Nod yet."));
}

#[test]
fn ordinary_403s_pass_through_untouched() {
    assert_eq!(
        org_restriction_error("Resource not accessible by personal access token"),
        None
    );
    assert_eq!(
        org_restriction_error("API rate limit exceeded for user ID 1."),
        None
    );
}
