/**
 * The web half of GitHub OAuth for checkout (the desktop loopback flow in
 * src-tauri/src/auth.rs is a different app with a different secret — see
 * docs/LAUNCH.md step 5 for why they must not be shared). Scope is
 * `read:user` only: checkout needs the numeric user id and nothing else,
 * and this consent screen sits in front of a payment.
 *
 * The state round-trip rides a cookie scoped to Path=/auth so it only ever
 * travels on the callback: HttpOnly keeps it from page scripts, Lax still
 * sends it on the top-level redirect back from github.com, and ten minutes
 * outlives any real sign-in. The token exchange asks GitHub for JSON
 * (without the Accept header it answers form-encoded), and the user fetch
 * sends a User-Agent because api.github.com rejects requests without one.
 */

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const USER_AGENT = "nod-checkout";
const STATE_COOKIE = "nod_oauth_state";
const STATE_TTL_SECONDS = 600;
const COOKIE_ATTRIBUTES = "Path=/auth; HttpOnly; Secure; SameSite=Lax";

export function authorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  return url.toString();
}

export function stateCookie(state: string): string {
  return `${STATE_COOKIE}=${state}; Max-Age=${STATE_TTL_SECONDS}; ${COOKIE_ATTRIBUTES}`;
}

export function clearedStateCookie(): string {
  return `${STATE_COOKIE}=; Max-Age=0; ${COOKIE_ATTRIBUTES}`;
}

export function readStateCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const pair of cookieHeader.split(";")) {
    const [name, ...rest] = pair.trim().split("=");
    if (name === STATE_COOKIE) {
      const value = rest.join("=");
      return value === "" ? null : value;
    }
  }
  return null;
}

export async function fetchGitHubUserId(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<number> {
  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`GitHub token exchange failed: ${tokenResponse.status}`);
  }
  const token = (await tokenResponse.json()) as { access_token?: unknown };
  if (typeof token.access_token !== "string") {
    throw new Error("GitHub token exchange returned no access token");
  }

  const userResponse = await fetch(USER_URL, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token.access_token}`,
      "user-agent": USER_AGENT,
    },
  });
  if (!userResponse.ok) {
    throw new Error(`GitHub user fetch failed: ${userResponse.status}`);
  }
  const user = (await userResponse.json()) as { id?: unknown };
  if (typeof user.id !== "number") {
    throw new Error("GitHub user response carried no numeric id");
  }
  return user.id;
}
