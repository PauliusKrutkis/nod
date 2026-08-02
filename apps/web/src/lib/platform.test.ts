import { describe, expect, it } from "vitest";
import { detectPlatform } from "./platform";

const USER_AGENTS = {
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  macDarwinWebview: "Mozilla/5.0 (Darwin; arm64) AppleWebKit/605.1.15",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  linuxFirefox:
    "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
  android:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

describe("detectPlatform", () => {
  it("reads the userAgentData platform hint verbatim", () => {
    expect(detectPlatform("macOS")).toBe("macOS");
    expect(detectPlatform("Windows")).toBe("Windows");
    expect(detectPlatform("Linux")).toBe("Linux");
  });

  it("falls back to the user agent string", () => {
    expect(detectPlatform(USER_AGENTS.macSafari)).toBe("macOS");
    expect(detectPlatform(USER_AGENTS.windowsChrome)).toBe("Windows");
    expect(detectPlatform(USER_AGENTS.linuxFirefox)).toBe("Linux");
  });

  it("does not mistake Darwin for Windows", () => {
    expect(detectPlatform(USER_AGENTS.macDarwinWebview)).toBe("macOS");
  });

  it("keeps Apple mobile on macOS and Android on Linux", () => {
    expect(detectPlatform(USER_AGENTS.iphone)).toBe("macOS");
    expect(detectPlatform(USER_AGENTS.android)).toBe("Linux");
  });

  it("returns nothing it can't place, so the page keeps its default", () => {
    expect(detectPlatform("")).toBeNull();
    expect(detectPlatform("SomeFutureOS/1.0")).toBeNull();
  });
});
