/**
 * The "Open Nod" screen and the styling both purchase end-screens share.
 *
 * Lives here rather than in activate.ts because /activate is no longer the
 * only route that ends in activation: a buyer who already owns a license can
 * reach the same screen by signing in, without a checkout in between.
 *
 * The page does two things at once. Its button carries the token as a nod://
 * deep link, and an inline script pushes the same token to the app's
 * dedicated purchase listener (127.0.0.1:8766, src-tauri/src/activation.rs —
 * deliberately not the OAuth port, whose code catcher a token fetch would
 * abort mid-sign-in), so activation needs zero clicks where the browser
 * allows it: Firefox fires plainly, Chromium preflights (answered by the
 * listener) or prompts under Local Network Access, Safari blocks
 * https→loopback mixed content and always needs the button. The page never
 * claims success from the fetch — a no-cors response is opaque and anything
 * on the port could have answered — so the copy stays non-committal and the
 * app's own window is the confirmation.
 *
 * Callers must serve it no-store: the token is baked into the markup.
 *
 * PAGE_STYLE inlines the site's tokens. These pages are Worker-rendered
 * strings, so they cannot import src/styles/global.css (its filename is
 * content-hashed at build time) — but they are the last screens of a
 * purchase, and a buyer arriving from checkout should not feel handed to a
 * different product. The colours interpolate from @nod/tokens — the string
 * shape exists for exactly this consumer; the font stack degrades to
 * system-ui because no @font-face travels with this page.
 */

import { palette as p } from "@nod/tokens";

const DEEP_LINK_BASE = "nod://purchase";
const PURCHASE_LISTENER_BASE = "http://127.0.0.1:8766/callback";

export const PAGE_STYLE = `
  :root { color-scheme: dark; }
  body { margin: 0; display: grid; place-items: center; min-height: 100vh;
    background: ${p.bg}; color: ${p.fg};
    font-family: "Inter Variable", Inter, system-ui, sans-serif;
    font-size: 16px; line-height: 1.6; letter-spacing: -0.006em;
    -webkit-font-smoothing: antialiased;
    background-image: radial-gradient(1100px 560px at 50% -8%,
      color-mix(in srgb, ${p.accent} 8%, transparent), transparent 62%); }
  main { max-width: 26rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.35rem; font-weight: 640; letter-spacing: -0.02em;
    margin: 0 0 0.5rem; }
  p { margin: 0.5rem 0 1.5rem; color: ${p.muted}; }
  a.open { display: inline-block; padding: 11px 18px; border-radius: 10px;
    background: ${p.accent}; color: ${p.accentInk}; text-decoration: none;
    font-weight: 500; font-size: 0.90625rem; }
  a.open:focus-visible { outline: 2px solid ${p.accent}; outline-offset: 3px; }
  p.alt { margin-top: 1.5rem; margin-bottom: 0; font-size: 0.8125rem;
    color: ${p.faint}; }
  p.alt a { color: ${p.muted}; text-underline-offset: 3px; }
  .spin { width: 18px; height: 18px; margin: 0 auto 1.25rem;
    border-radius: 999px; border: 2px solid ${p.lineStrong};
    border-top-color: ${p.accent};
    animation: spin 700ms linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .spin { animation-duration: 2400ms; }
  }
`;

export function activationPage(token: string): string {
  const deepLink = `${DEEP_LINK_BASE}?token=${encodeURIComponent(token)}`;
  const listenerUrl = `${PURCHASE_LISTENER_BASE}?token=${encodeURIComponent(token)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Nod · payment received</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
  <h1>Payment received</h1>
  <p>Thanks for buying Nod. Press the button to finish activation.</p>
  <a class="open" href="${deepLink}">Open Nod</a>
  <p class="alt">Don't have it installed yet? <a href="/downloads">Download
  Nod</a>, then press Open Nod. This link works for 48 hours.</p>
</main>
<script>
  fetch(${JSON.stringify(listenerUrl)}, { mode: "no-cors" }).catch(() => {});
</script>
</body>
</html>`;
}

/**
 * Both end-screens are token-bearing HTML, so neither may be cached. `extra`
 * carries whatever the route owes on top of that — the OAuth callback clears
 * its state cookie here, because reaching this screen ends that flow just as
 * a redirect into checkout does. It is spread first so no caller can talk
 * this response out of no-store: the token is in the body.
 */
export function activationHtmlResponse(
  body: string,
  extra: Record<string, string> = {}
): Response {
  return new Response(body, {
    headers: {
      ...extra,
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}
