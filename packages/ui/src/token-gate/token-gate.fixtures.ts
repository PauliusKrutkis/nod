/**
 * The gate is the screen nobody sees twice, so every state here is one a user
 * hits exactly once and reports badly: OAuth not configured on this build, an
 * instance that answers but rejects the token, a provider error echoed
 * verbatim from an API that owes us no line breaks. Hosts and error strings
 * are the hostile axis — both arrive from outside and both land in a 400px
 * card — so they appear empty, long, unbreakable, and in CJK/RTL.
 *
 * `busy` and `disabled` travel together in the app (disabled is busy !==
 * "idle"), and the fixtures keep that pairing rather than inventing states the
 * flow cannot produce.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { TokenGate } from "./token-gate.tsx";

const noop = () => {
  return;
};

const idle = {
  accountCount: 0,
  appId: "",
  busy: "idle",
  busyLabel: "",
  disabled: false,
  error: null,
  ghOauthReady: true,
  glOauthReady: true,
  hostInput: "",
  instances: [],
  oauthId: undefined,
  onAppIdChange: noop,
  onBackToIdentity: noop,
  onConnectGitlabToken: noop,
  onConnectToken: noop,
  onCreateSelfHostedToken: noop,
  onCreateToken: noop,
  onGoInbox: noop,
  onHostInputChange: noop,
  onHostKeyDown: noop,
  onOpenInstance: noop,
  onProbe: noop,
  onProviderChange: noop,
  onSelfHosted: noop,
  onSelfHostedSignInGitlab: noop,
  onSelfHostedTokenChange: noop,
  onSelfHostedTokenKeyDown: noop,
  onSignInGithub: noop,
  onSignInGitlab: noop,
  onTokenChange: noop,
  onTokenHostChange: noop,
  onTokenKeyDown: noop,
  onUseToken: noop,
  probedHost: null,
  token: "",
  tokenHost: "",
  tokenProvider: "github",
  view: "identity",
} as const;

const LONG_HOST = `gitlab.${"internal-platform-engineering-".repeat(12)}corp`;

export const tokenGateEntry = defineEntry(TokenGate, {
  "add-account": { props: { ...idle, accountCount: 3 } },
  "auth-error": {
    props: {
      ...idle,
      error:
        "The GitHub sign-in was cancelled before it finished. Nothing was saved — try again, or paste a personal access token instead.",
    },
  },
  "error-overflow": {
    props: {
      ...idle,
      error: `Error: ${"unrecoverable-".repeat(10)}state`,
      view: "token",
    },
  },
  "markup-as-text": {
    props: {
      ...idle,
      error: "<img src=x onerror=alert(1)> stays text",
      instances: [{ host: "https://<script>alert(1)</script>" }],
    },
  },
  instances: {
    props: {
      ...idle,
      instances: [
        { clientId: "b1f6…", host: "https://gitlab.acme.dev" },
        { host: "https://gitlab.internal.example.com" },
        { host: `https://${LONG_HOST}` },
      ],
    },
  },
  "needs-setup": {
    props: { ...idle, ghOauthReady: false, glOauthReady: false },
  },
  "self-hosted": {
    props: { ...idle, hostInput: "gitlab.acme.dev", view: "selfhosted" },
  },
  "self-hosted-probed": {
    props: {
      ...idle,
      appId: "b1f6c0d2e3a4",
      hostInput: "gitlab.acme.dev",
      oauthId: "b1f6c0d2e3a4",
      probedHost: "https://gitlab.acme.dev",
      view: "selfhosted",
    },
  },
  "self-hosted-probing": {
    props: {
      ...idle,
      busy: "probe",
      disabled: true,
      hostInput: "gitlab.acme.dev",
      view: "selfhosted",
    },
  },
  "signed-out": { props: idle },
  "signing-in": {
    props: {
      ...idle,
      busy: "oauth",
      busyLabel: "Waiting for github.com in your browser…",
      disabled: true,
    },
  },
  "token-gitlab": {
    props: {
      ...idle,
      token: "glpat-xxxxxxxxxxxxxxxxxxxx",
      tokenHost: "gitlab.acme.dev",
      tokenProvider: "gitlab",
      view: "token",
    },
  },
  "token-rejected": {
    props: {
      ...idle,
      error: "401 Bad credentials — that token is expired or lacks repo.",
      token: "ghp_xxxxxxxxxxxxxxxxxxxx",
      view: "token",
    },
  },
  unicode: {
    props: {
      ...idle,
      error: "تعذر الاتصال بالخادم · 認証に失敗しました 🔐",
      instances: [
        { host: "https://gitlab.例え.jp" },
        { clientId: "c9…", host: "https://مستودع.شركة.السعودية" },
      ],
    },
  },
  "verifying-token": {
    props: {
      ...idle,
      busy: "pat",
      disabled: true,
      token: "ghp_xxxxxxxxxxxxxxxxxxxx",
      view: "token",
    },
  },
});
