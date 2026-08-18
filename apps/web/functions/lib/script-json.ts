/**
 * JSON for a `<script>` block.
 *
 * `JSON.stringify` escapes for JSON, not for HTML: the string `</script>`
 * survives it intact and closes the block early, which turns any value that
 * reaches a script sink into an injection point. Today's callers pass values
 * that went through `encodeURIComponent` first, so `<` and `/` are already
 * percent-encoded and nothing can escape — but that is a property of the
 * callers, not of the sink, and it disappears the moment someone passes a
 * value straight through.
 *
 * The line and paragraph separators are escaped for a different reason: they
 * are valid in JSON strings and illegal in JavaScript string literals before
 * ES2019, so a runtime that predates it would fail to parse the page.
 */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
