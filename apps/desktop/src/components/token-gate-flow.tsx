import { TokenGate } from "@nod/ui/token-gate";
import { useTokenGate } from "../hooks/use-token-gate.ts";

/**
 * Sign-in wiring for the gate; the view is token-gate, catalogued in @nod/ui.
 * Everything the flow owns — the OAuth round trips, the instance probe, the
 * keychain write, the remembered instances in localStorage and the Esc
 * binding — lives in useTokenGate, so the screen below stays renderable from
 * a fixture. Only the account list is reshaped here: the view needs to know
 * whether this is a first sign-in or an extra account, not who is signed in.
 */
export function TokenGateFlow() {
  const gate = useTokenGate();

  return (
    <TokenGate
      accountCount={gate.accounts.length}
      appId={gate.appId}
      busy={gate.busy}
      busyLabel={gate.busyLabel}
      disabled={gate.disabled}
      error={gate.error}
      ghOauthReady={gate.ghOauthReady}
      glOauthReady={gate.glOauthReady}
      hostInput={gate.hostInput}
      instances={gate.instances}
      oauthId={gate.oauthId}
      onAppIdChange={gate.onAppIdChange}
      onBackToIdentity={gate.onBackToIdentity}
      onConnectGitlabToken={gate.onConnectGitlabToken}
      onConnectToken={gate.onConnectToken}
      onCreateSelfHostedToken={gate.onCreateSelfHostedToken}
      onCreateToken={gate.onCreateToken}
      onGoInbox={gate.onGoInbox}
      onHostInputChange={gate.onHostInputChange}
      onHostKeyDown={gate.onHostKeyDown}
      onOpenInstance={gate.onOpenInstance}
      onProbe={gate.onProbe}
      onProviderChange={gate.onProviderChange}
      onSelfHosted={gate.onSelfHosted}
      onSelfHostedSignInGitlab={gate.onSelfHostedSignInGitlab}
      onSelfHostedTokenChange={gate.onSelfHostedTokenChange}
      onSelfHostedTokenKeyDown={gate.onSelfHostedTokenKeyDown}
      onSignInGithub={gate.onSignInGithub}
      onSignInGitlab={gate.onSignInGitlab}
      onTokenChange={gate.onTokenChange}
      onTokenHostChange={gate.onTokenHostChange}
      onTokenKeyDown={gate.onTokenKeyDown}
      onUseToken={gate.onUseToken}
      probedHost={gate.probedHost}
      token={gate.token}
      tokenHost={gate.tokenHost}
      tokenProvider={gate.tokenProvider}
      view={gate.view}
    />
  );
}
