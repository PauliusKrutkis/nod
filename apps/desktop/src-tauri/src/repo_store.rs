//! Repo stores: one bare, blob-filtered git clone per watched repository,
//! owned and fetched by the app. This is the clone tier from docs/LEDGER.md
//! ("the clone is the pivot") built without the manual step the dogfood phase
//! required — the user never supplies a path, the app clones with the token
//! it already holds.
//!
//! The store supersedes the snapshot tarball (BACKLOG §9 layer 1): a push
//! costs a delta fetch instead of a re-download, history is available for
//! blame and the ledger, and there is no repo-size refusal — blobs over
//! `service::CLONE_BLOB_FILTER` are simply left on the server until a read
//! wants them. Reads stay SHA-addressed (`cat-file` at a commit, never a
//! working tree), so consumers keep the exact semantics snapshot reads had.
//!
//! Requires system `git` on PATH. Every spawn goes through `git::run`, which
//! injects credentials from the active account via environment variables —
//! the token never appears in an argument list or on disk.

pub(crate) mod git;
pub(crate) mod service;
pub(crate) mod store;
