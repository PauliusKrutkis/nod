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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Gallery />
  </React.StrictMode>
);
