/**
 * Mounting waits for the webfonts. Specimens that measure themselves at mount
 * — an input that scrolls a long value into view, anything sized from text —
 * otherwise settle against fallback metrics and reflow when Inter arrives,
 * which reads as a flaky screenshot on whichever platform loses the race.
 * Awaiting fonts here fixes it for every specimen at once, rather than each
 * capture waiting after the fact, by which point the mount has happened.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { Gallery } from "./gallery.tsx";

import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource-variable/geist-mono";
import "@nod/tokens/tokens.css";
import "@nod/ui/styles.css";
import "./base.css";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

document.fonts.ready.then(() => {
  root.render(
    <React.StrictMode>
      <Gallery />
    </React.StrictMode>
  );
});
