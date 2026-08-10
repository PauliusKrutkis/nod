/**
 * Props-pure Quiet primitives shared across Nod's apps. Two rules keep this
 * package honest, both enforced by catalog.test.tsx:
 *
 * 1. Everything renders from props alone — no store, no api, no Tauri. A
 *    component that needs the host goes back to the app with a container.
 * 2. Every exported component is catalogued with fixtures (catalog.ts), so
 *    the derived tests, the gallery, and the capture harness see it without
 *    any further registration.
 *
 * Styling is a host contract: components wear Quiet classes (q-*) and
 * Tailwind utilities whose tokens/styles the consuming app provides — the
 * desktop app's index.css declares this package as a Tailwind @source.
 */
// biome-ignore-all lint/performance/noBarrelFile: the package entry is its public API
export { Avatar } from "./avatar.tsx";
export { Badge } from "./badge.tsx";
export { catalog } from "./catalog.ts";
export type { CatalogEntry, Fixture } from "./fixtures.ts";
export { Kbd } from "./kbd.tsx";
export { Spinner } from "./spinner.tsx";
