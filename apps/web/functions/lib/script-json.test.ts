import { describe, expect, it } from "vitest";
import { scriptJson } from "./script-json";

describe("scriptJson", () => {
  it("is JSON for anything a script block can hold safely", () => {
    expect(scriptJson("/activate?checkout_id=abc")).toBe(
      '"/activate?checkout_id=abc"'
    );
    expect(scriptJson(42)).toBe("42");
    expect(scriptJson(null)).toBe("null");
  });

  it("neuters a closing script tag", () => {
    const html = `<script>var u = ${scriptJson("</script><img onerror=x>")};</script>`;
    expect(html).not.toContain("</script><img");
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(JSON.parse(scriptJson("</script>"))).toBe("</script>");
  });

  it("escapes the separators that are legal in JSON and not in JS", () => {
    expect(scriptJson("a b c")).toBe('"a\\u2028b\\u2029c"');
  });
});
