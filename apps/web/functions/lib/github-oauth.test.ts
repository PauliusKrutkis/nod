/**
 * The cookie helpers are pinned by round-trip (what stateCookie writes,
 * readStateCookie finds), and fetchGitHubUserId by its two-request
 * conversation: code → token → numeric id, with every degenerate GitHub
 * answer (non-JSON success shapes, missing token, missing id) becoming a
 * throw rather than a checkout keyed to "undefined".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authorizeUrl,
  clearedStateCookie,
  fetchGitHubUserId,
  readStateCookie,
  stateCookie,
} from "./github-oauth";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authorizeUrl", () => {
  it("carries the client id, callback, read:user scope, and state", () => {
    const url = new URL(
      authorizeUrl(
        "Ov23liTEST",
        "https://nodreview.com/auth/github/callback",
        "state-1"
      )
    );

    expect(url.origin + url.pathname).toBe(
      "https://github.com/login/oauth/authorize"
    );
    expect(url.searchParams.get("client_id")).toBe("Ov23liTEST");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://nodreview.com/auth/github/callback"
    );
    expect(url.searchParams.get("scope")).toBe("read:user");
    expect(url.searchParams.get("state")).toBe("state-1");
  });
});

describe("state cookie round-trip", () => {
  it("reads back the state it wrote", () => {
    const header = stateCookie("abc-123").split(";")[0] ?? "";
    expect(readStateCookie(`other=1; ${header}; theme=dark`)).toBe("abc-123");
  });

  it("scopes the cookie to /auth and keeps it from scripts", () => {
    expect(stateCookie("abc")).toContain("Path=/auth");
    expect(stateCookie("abc")).toContain("HttpOnly");
    expect(stateCookie("abc")).toContain("SameSite=Lax");
  });

  it("returns null for absent or cleared cookies", () => {
    expect(readStateCookie(null)).toBeNull();
    expect(readStateCookie("theme=dark")).toBeNull();
    expect(
      readStateCookie(clearedStateCookie().split(";")[0] ?? "")
    ).toBeNull();
  });
});

function githubAnswering(
  tokenBody: unknown,
  userBody: unknown
): ReturnType<typeof vi.fn> {
  return vi.fn((input: string) =>
    Promise.resolve(
      Response.json(
        String(input).includes("login/oauth/access_token")
          ? tokenBody
          : userBody
      )
    )
  );
}

describe("fetchGitHubUserId", () => {
  it("exchanges the code and returns the numeric user id", async () => {
    const fetchSpy = githubAnswering(
      { access_token: "gho_test" },
      { id: 583_231, login: "octocat" }
    );
    vi.stubGlobal("fetch", fetchSpy);

    const id = await fetchGitHubUserId(
      "client-id",
      "client-secret",
      "code-1",
      "https://nodreview.com/auth/github/callback"
    );

    expect(id).toBe(583_231);
    const [, tokenInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(tokenInit.body as string)).toMatchObject({
      client_id: "client-id",
      code: "code-1",
      redirect_uri: "https://nodreview.com/auth/github/callback",
    });
    const [, userInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(userInit.headers).toMatchObject({
      authorization: "Bearer gho_test",
      "user-agent": "nod-checkout",
    });
  });

  it("throws when GitHub answers without a token (expired or reused code)", async () => {
    vi.stubGlobal(
      "fetch",
      githubAnswering({ error: "bad_verification_code" }, { id: 1 })
    );

    await expect(
      fetchGitHubUserId("id", "secret", "code", "https://x.test/cb")
    ).rejects.toThrow("no access token");
  });

  it("throws when the user payload has no numeric id", async () => {
    vi.stubGlobal(
      "fetch",
      githubAnswering({ access_token: "gho_test" }, { login: "octocat" })
    );

    await expect(
      fetchGitHubUserId("id", "secret", "code", "https://x.test/cb")
    ).rejects.toThrow("no numeric id");
  });
});
