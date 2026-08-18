/**
 * The gate — identity, never configuration. One stack of continue-as rows;
 * the sub-steps (self-hosted GitLab, paste a token) ask a single question and
 * collapse back into the rows. The iris rail on hover is the same selection
 * language as the palette and the search rows.
 *
 * Every value it draws and every action it offers arrives as a prop: the OAuth
 * calls, the instance probe, the keychain write and the remembered-instance
 * list all live in the host's flow hook, which keeps this a props-pure view
 * the gallery can mount from a fixture. That matters more here than anywhere
 * else in the app — the gate is the one screen a signed-in developer never
 * sees again, so its error, busy and rejected states are otherwise impossible
 * to look at.
 *
 * `shortHost` ships with the view because trimming the scheme is presentation,
 * not storage: hosts are stored with their scheme and only ever shown without
 * it, so the host and the view agree by importing the same function.
 *
 * The brand marks are inline SVG rather than icon-set imports: lucide dropped
 * its brand icons, and these two are the only marks the app draws.
 */
import { ArrowLeft, KeyRound, Server } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useEffect, useRef } from "react";
import { Button } from "../button/button.tsx";
import { cn } from "../cn/cn.ts";
import { Spinner } from "../spinner/spinner.tsx";
import { shortHost } from "./short-host.ts";
import "./token-gate.css";

export type TokenGateBusy = "idle" | "oauth" | "probe" | "pat";
export type TokenGateProvider = "github" | "gitlab";
export type TokenGateView = "identity" | "selfhosted" | "token";

export interface GitlabInstance {
  clientId?: string;
  host: string;
}

function GitHubMark() {
  return (
    <svg
      aria-hidden
      fill="currentColor"
      height="17"
      viewBox="0 0 16 16"
      width="17"
    >
      <title>GitHub</title>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function GitLabMark() {
  return (
    <svg
      aria-hidden
      fill="currentColor"
      height="17"
      viewBox="0 0 16 16"
      width="17"
    >
      <title>GitLab</title>
      <path d="M15.73 6.44l-.02-.06-2.13-5.55a.55.55 0 00-.22-.26.57.57 0 00-.65.03.57.57 0 00-.19.29l-1.44 4.4H4.92L3.48.89a.56.56 0 00-.19-.29.57.57 0 00-.65-.03.55.55 0 00-.22.26L.29 6.38l-.02.06a3.95 3.95 0 001.31 4.56l.01.01.02.02 3.24 2.43 1.61 1.21 .98.74a.66.66 0 00.79 0l.98-.74 1.61-1.21 3.26-2.44.01-.01a3.95 3.95 0 001.31-4.57z" />
    </svg>
  );
}

interface InstanceRowProps {
  disabled: boolean;
  inst: GitlabInstance;
  onOpen: (inst: GitlabInstance) => void;
}

function InstanceRow({ inst, disabled, onOpen }: InstanceRowProps) {
  const onClick = () => {
    onOpen(inst);
  };

  return (
    <button
      className="qg-row q-focus"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Server aria-hidden size={16} />
      <span className="qg-row-host q-mono">{shortHost(inst.host)}</span>
      {inst.clientId ? null : <span className="qg-row-hint">token</span>}
    </button>
  );
}

interface IdentityPanelProps {
  disabled: boolean;
  ghOauthReady: boolean;
  glOauthReady: boolean;
  instances: readonly GitlabInstance[];
  onOpenInstance: (inst: GitlabInstance) => void;
  onSelfHosted: () => void;
  onSignInGithub: () => void;
  onSignInGitlab: () => void;
  onUseToken: () => void;
}

function IdentityPanel({
  disabled,
  ghOauthReady,
  glOauthReady,
  instances,
  onOpenInstance,
  onSelfHosted,
  onSignInGithub,
  onSignInGitlab,
  onUseToken,
}: IdentityPanelProps) {
  return (
    <>
      <fieldset className="qg-stack">
        <legend className="qg-sr">Sign in</legend>
        <button
          className="qg-row q-focus"
          disabled={disabled}
          onClick={onSignInGithub}
          type="button"
        >
          <GitHubMark />
          <span className="qg-row-label">Continue with GitHub</span>
          {ghOauthReady ? null : (
            <span className="qg-row-hint">needs setup</span>
          )}
        </button>
        <button
          className="qg-row q-focus"
          disabled={disabled}
          onClick={onSignInGitlab}
          type="button"
        >
          <GitLabMark />
          <span className="qg-row-label">Continue with GitLab</span>
          {glOauthReady ? null : (
            <span className="qg-row-hint">needs setup</span>
          )}
        </button>
        {instances.map((inst) => (
          <InstanceRow
            disabled={disabled}
            inst={inst}
            key={inst.host}
            onOpen={onOpenInstance}
          />
        ))}
      </fieldset>

      <div className="qg-links">
        <button
          className="qg-link q-focus"
          onClick={onSelfHosted}
          type="button"
        >
          <Server aria-hidden size={12} /> Self-hosted GitLab
        </button>
        <span className="q-dot">·</span>
        <button className="qg-link q-focus" onClick={onUseToken} type="button">
          <KeyRound aria-hidden size={12} /> Use a token
        </button>
      </div>
    </>
  );
}

interface SelfHostedPanelProps {
  appId: string;
  busy: TokenGateBusy;
  disabled: boolean;
  hostInput: string;
  oauthId: string | undefined;
  onAppIdChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onConnectGitlabToken: () => void;
  onCreateToken: () => void;
  onHostInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onHostKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onProbe: () => void;
  onSignInGitlab: () => void;
  onTokenChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTokenKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  probedHost: string | null;
  token: string;
}

function SelfHostedPanel({
  appId,
  busy,
  disabled,
  hostInput,
  oauthId,
  onAppIdChange,
  onConnectGitlabToken,
  onCreateToken,
  onHostInputChange,
  onHostKeyDown,
  onProbe,
  onSignInGitlab,
  onTokenChange,
  onTokenKeyDown,
  probedHost,
  token,
}: SelfHostedPanelProps) {
  const hostInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => hostInputRef.current?.focus());
  }, []);

  return (
    <>
      <label className="qg-label" htmlFor="qg-host">
        GitLab host
      </label>
      <div className="qg-host-row">
        <input
          autoComplete="off"
          className="qg-input q-mono"
          disabled={disabled}
          id="qg-host"
          onChange={onHostInputChange}
          onKeyDown={onHostKeyDown}
          placeholder="gitlab.yourcompany.com"
          ref={hostInputRef}
          spellCheck={false}
          type="text"
          value={hostInput}
        />
        {probedHost ? null : (
          <Button
            className="qg-probe"
            disabled={disabled || !hostInput.trim()}
            onClick={onProbe}
          >
            {busy === "probe" ? <Spinner /> : "Continue"}
          </Button>
        )}
      </div>

      {probedHost ? (
        <div className="qg-reveal">
          <p className="qg-ok">✓ {shortHost(probedHost)} is reachable</p>

          {oauthId ? (
            <Button
              className="qg-signin"
              disabled={disabled}
              onClick={onSignInGitlab}
              variant="primary"
            >
              <GitLabMark />
              <span className="qg-signin-host">
                Sign in to {shortHost(probedHost)}
              </span>
            </Button>
          ) : null}

          <label className="qg-label" htmlFor="qg-appid">
            Application ID{" "}
            <span className="qg-label-soft">
              · optional. A group owner creates it once, then sign-in is one
              click for everyone
            </span>
          </label>
          <input
            autoComplete="off"
            className="qg-input q-mono"
            disabled={disabled}
            id="qg-appid"
            onChange={onAppIdChange}
            placeholder="from Group → Settings → Applications"
            spellCheck={false}
            type="text"
            value={appId}
          />

          <div className="qg-divider">or connect with a token</div>

          <input
            aria-label="Personal access token"
            autoComplete="off"
            className="qg-input q-mono"
            disabled={disabled}
            onChange={onTokenChange}
            onKeyDown={onTokenKeyDown}
            placeholder="glpat-…  (api scope)"
            spellCheck={false}
            type="password"
            value={token}
          />
          <div className="qg-actions">
            <Button
              className="qg-connect"
              disabled={disabled || !token.trim()}
              onClick={onConnectGitlabToken}
            >
              {busy === "pat" ? <Spinner /> : "Connect"}
            </Button>
            <button
              className="qg-create q-focus"
              onClick={onCreateToken}
              type="button"
            >
              Create a token →
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

interface TokenPanelProps {
  busy: TokenGateBusy;
  disabled: boolean;
  onConnect: () => void;
  onCreateToken: () => void;
  onProviderChange: (provider: TokenGateProvider) => void;
  onTokenChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTokenHostChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTokenKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  token: string;
  tokenHost: string;
  tokenProvider: TokenGateProvider;
}

function TokenPanel({
  busy,
  disabled,
  onConnect,
  onCreateToken,
  onProviderChange,
  onTokenChange,
  onTokenHostChange,
  onTokenKeyDown,
  token,
  tokenHost,
  tokenProvider,
}: TokenPanelProps) {
  const onSelectGithub = () => {
    onProviderChange("github");
  };
  const onSelectGitlab = () => {
    onProviderChange("gitlab");
  };
  const scopeLabel = tokenProvider === "github" ? "repo" : "api";
  const tokenPlaceholder = tokenProvider === "github" ? "ghp_…" : "glpat-…";
  const tokenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => tokenInputRef.current?.focus());
  }, []);

  return (
    <>
      <fieldset className="qg-provider">
        <legend className="qg-sr">Provider</legend>
        <label
          className={cn(
            "qg-provider-btn",
            tokenProvider === "github" && "qg-provider-on"
          )}
        >
          <input
            checked={tokenProvider === "github"}
            className="qg-sr"
            name="token-provider"
            onChange={onSelectGithub}
            type="radio"
            value="github"
          />
          <GitHubMark /> GitHub
        </label>
        <label
          className={cn(
            "qg-provider-btn",
            tokenProvider === "gitlab" && "qg-provider-on"
          )}
        >
          <input
            checked={tokenProvider === "gitlab"}
            className="qg-sr"
            name="token-provider"
            onChange={onSelectGitlab}
            type="radio"
            value="gitlab"
          />
          <GitLabMark /> GitLab
        </label>
      </fieldset>

      {tokenProvider === "gitlab" ? (
        <>
          <label className="qg-label" htmlFor="qg-token-host">
            Host <span className="qg-label-soft">· empty for gitlab.com</span>
          </label>
          <input
            autoComplete="off"
            className="qg-input qg-input-gap q-mono"
            disabled={disabled}
            id="qg-token-host"
            onChange={onTokenHostChange}
            placeholder="gitlab.com"
            spellCheck={false}
            type="text"
            value={tokenHost}
          />
        </>
      ) : null}

      <label className="qg-label" htmlFor="qg-token">
        Personal access token{" "}
        <span className="qg-label-soft">· {scopeLabel} scope</span>
      </label>
      <input
        autoComplete="off"
        className="qg-input q-mono"
        disabled={disabled}
        id="qg-token"
        onChange={onTokenChange}
        onKeyDown={onTokenKeyDown}
        placeholder={tokenPlaceholder}
        ref={tokenInputRef}
        spellCheck={false}
        type="password"
        value={token}
      />
      <div className="qg-actions">
        <Button
          className="qg-connect"
          disabled={disabled || !token.trim()}
          onClick={onConnect}
        >
          {busy === "pat" ? <Spinner /> : "Connect"}
        </Button>
        <button
          className="qg-create q-focus"
          onClick={onCreateToken}
          type="button"
        >
          Create a token →
        </button>
      </div>
    </>
  );
}

export function TokenGate({
  accountCount,
  appId,
  busy,
  busyLabel,
  disabled,
  error,
  ghOauthReady,
  glOauthReady,
  hostInput,
  instances,
  oauthId,
  onAppIdChange,
  onBackToIdentity,
  onConnectGitlabToken,
  onConnectToken,
  onCreateSelfHostedToken,
  onCreateToken,
  onGoInbox,
  onHostInputChange,
  onHostKeyDown,
  onOpenInstance,
  onProbe,
  onProviderChange,
  onSelfHosted,
  onSelfHostedSignInGitlab,
  onSelfHostedTokenChange,
  onSelfHostedTokenKeyDown,
  onSignInGithub,
  onSignInGitlab,
  onTokenChange,
  onTokenHostChange,
  onTokenKeyDown,
  onUseToken,
  probedHost,
  token,
  tokenHost,
  tokenProvider,
  view,
}: {
  accountCount: number;
  appId: string;
  busy: TokenGateBusy;
  busyLabel: string;
  disabled: boolean;
  error: string | null;
  ghOauthReady: boolean;
  glOauthReady: boolean;
  hostInput: string;
  instances: readonly GitlabInstance[];
  oauthId: string | undefined;
  onAppIdChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBackToIdentity: () => void;
  onConnectGitlabToken: () => void;
  onConnectToken: () => void;
  onCreateSelfHostedToken: () => void;
  onCreateToken: () => void;
  onGoInbox: () => void;
  onHostInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onHostKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onOpenInstance: (inst: GitlabInstance) => void;
  onProbe: () => void;
  onProviderChange: (provider: TokenGateProvider) => void;
  onSelfHosted: () => void;
  onSelfHostedSignInGitlab: () => void;
  onSelfHostedTokenChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelfHostedTokenKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSignInGithub: () => void;
  onSignInGitlab: () => void;
  onTokenChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTokenHostChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTokenKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onUseToken: () => void;
  probedHost: string | null;
  token: string;
  tokenHost: string;
  tokenProvider: TokenGateProvider;
  view: TokenGateView;
}) {
  return (
    <div className="qg-screen">
      <div className="qg-card">
        <div className="qg-head">
          <span aria-hidden className="qg-logo" />
          <h1 className="qg-wordmark">Nod</h1>
          {view === "identity" && accountCount > 0 ? (
            <Button className="qg-back" onClick={onGoInbox} variant="ghost">
              <span className="qg-back-inner">
                <ArrowLeft aria-hidden size={13} /> Back
              </span>
            </Button>
          ) : null}
        </div>
        <p className="qg-tagline">
          {accountCount > 0 ? "Add an account" : "Keyboard-first code review"}
        </p>

        {view === "identity" ? (
          <IdentityPanel
            disabled={disabled}
            ghOauthReady={ghOauthReady}
            glOauthReady={glOauthReady}
            instances={instances}
            onOpenInstance={onOpenInstance}
            onSelfHosted={onSelfHosted}
            onSignInGithub={onSignInGithub}
            onSignInGitlab={onSignInGitlab}
            onUseToken={onUseToken}
          />
        ) : null}

        {view === "selfhosted" ? (
          <SelfHostedPanel
            appId={appId}
            busy={busy}
            disabled={disabled}
            hostInput={hostInput}
            oauthId={oauthId}
            onAppIdChange={onAppIdChange}
            onConnectGitlabToken={onConnectGitlabToken}
            onCreateToken={onCreateSelfHostedToken}
            onHostInputChange={onHostInputChange}
            onHostKeyDown={onHostKeyDown}
            onProbe={onProbe}
            onSignInGitlab={onSelfHostedSignInGitlab}
            onTokenChange={onSelfHostedTokenChange}
            onTokenKeyDown={onSelfHostedTokenKeyDown}
            probedHost={probedHost}
            token={token}
          />
        ) : null}

        {view === "token" ? (
          <TokenPanel
            busy={busy}
            disabled={disabled}
            onConnect={onConnectToken}
            onCreateToken={onCreateToken}
            onProviderChange={onProviderChange}
            onTokenChange={onTokenChange}
            onTokenHostChange={onTokenHostChange}
            onTokenKeyDown={onTokenKeyDown}
            token={token}
            tokenHost={tokenHost}
            tokenProvider={tokenProvider}
          />
        ) : null}

        {busy === "oauth" ? <p className="qg-status">{busyLabel}</p> : null}
        {error ? <p className="qg-error">{error}</p> : null}

        {view === "identity" ? null : (
          <button
            className="qg-link qg-link-back q-focus"
            onClick={onBackToIdentity}
            type="button"
          >
            <ArrowLeft aria-hidden size={12} /> All sign-in options
          </button>
        )}
        <p className="qg-fine">
          Tokens stay on this device; sign-ins open your browser.
        </p>
      </div>
    </div>
  );
}
