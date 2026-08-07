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
 */

const DEEP_LINK_BASE = "nod://purchase";
const PURCHASE_LISTENER_BASE = "http://127.0.0.1:8766/callback";

/**
 * The site's tokens, inlined. These pages are Worker-rendered strings, so
 * they cannot import src/styles/global.css (its filename is content-hashed
 * at build time) — but they are the last screens of a purchase, and a buyer
 * arriving from checkout should not feel handed to a different product.
 * Values copy :root in global.css; the font stack degrades to system-ui
 * because no @font-face travels with this page.
 */
export const PAGE_STYLE = `
  :root { color-scheme: dark; }
  body { margin: 0; display: grid; place-items: center; min-height: 100vh;
    background: #0f0f17; color: #e8e8f3;
    font-family: "Inter Variable", Inter, system-ui, sans-serif;
    font-size: 16px; line-height: 1.6; letter-spacing: -0.006em;
    -webkit-font-smoothing: antialiased;
    background-image: radial-gradient(1100px 560px at 50% -8%,
      rgba(139, 128, 255, 0.08), transparent 62%); }
  main { max-width: 26rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.35rem; font-weight: 640; letter-spacing: -0.02em;
    margin: 0 0 0.5rem; }
  p { margin: 0.5rem 0 1.5rem; color: #9a9ab2; }
  a.open { display: inline-block; padding: 11px 18px; border-radius: 10px;
    background: #8b80ff; color: #14111f; text-decoration: none;
    font-weight: 500; font-size: 0.90625rem; }
  a.open:focus-visible { outline: 2px solid #8b80ff; outline-offset: 3px; }
  p.alt { margin-top: 1.5rem; margin-bottom: 0; font-size: 0.8125rem;
    color: #5f5f78; }
  p.alt a { color: #9a9ab2; text-underline-offset: 3px; }
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

/** Both end-screens are token-bearing HTML, so neither may be cached. */
export function activationHtmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}
