import { describe, expect, it } from "vitest";
import { analyticsBeaconToken } from "./site.ts";

describe("analyticsBeaconToken", () => {
  it("returns the token when the build provides one", () => {
    expect(analyticsBeaconToken("92b8fbe9e1ea409484577a3fbc472727")).toBe(
      "92b8fbe9e1ea409484577a3fbc472727"
    );
  });

  it("returns null when the variable is absent", () => {
    expect(analyticsBeaconToken(undefined)).toBeNull();
  });

  it("returns null for a declared-but-blank variable", () => {
    expect(analyticsBeaconToken("")).toBeNull();
    expect(analyticsBeaconToken("   ")).toBeNull();
  });

  it("returns null for a non-string, which import.meta.env allows through", () => {
    expect(analyticsBeaconToken(null)).toBeNull();
    expect(analyticsBeaconToken(0)).toBeNull();
    expect(analyticsBeaconToken(false)).toBeNull();
  });

  it("trims surrounding whitespace a copy-pasted value carries in", () => {
    expect(analyticsBeaconToken("  abc123  ")).toBe("abc123");
  });
});
