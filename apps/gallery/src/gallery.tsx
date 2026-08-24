/**
 * The component gallery — its own dev-only app, never deployed or shipped.
 * It runs on the browser for iteration and in the desktop's Tauri shell for
 * the engine of record (the desktop's gallery:desktop script points the
 * WebKitGTK webview at this app's port).
 *
 * It renders the REAL components from @nod/ui under their catalogued
 * fixtures; there is no parallel mock to drift the way the deleted
 * design-lab did. The chrome stays quieter than the specimens on purpose:
 * dim mono metadata, iris only on selection, and a capture frame whose
 * printed filename is exactly what the webkit screenshot suite snapshots —
 * the gallery is a screenshot target first and a showroom second. Inside
 * each frame the specimen sits on a solid mat (.qg-mat) whose background is
 * exactly the surface that stood behind specimens before, while the frame
 * itself wears a faint dot grid: patterned ring = gallery territory, solid
 * mat = the component's canvas, so a specimen whose own surface matches the
 * frame still reads at rest, without reaching for the x-ray. The screenshot
 * suite must see exactly the pre-mat pixels, so it loads the app with a
 * ?capture query flag (read once at mount, worn as qg-capture on the root)
 * that suppresses the dot grid; the mat itself stays in both modes — its
 * background matches the frame's, which is the layout-neutrality guarantee.
 *
 * Interaction is keyboard-first like the rest of the app: j/k, Tab, or the
 * arrows switch component, f fixture, t theme, w width, m view (shift
 * reverses the cycling keys), x the component-boundary outline, c the notes
 * margin (mod+S scope, mod+Enter leave, Escape close), / find (arrows walk
 * matches, Enter jumps), mod +/-/0 zoom, ? the shortcut sheet.
 * Specimens only keep focus when clicked into: stray autofocus is blurred
 * back to the gallery
 * so the keys keep working, and Escape hands focus back from a specimen
 * (a top-layer modal keeps its own). Zoom is a transform
 * scale on #root with compensated dimensions — CSS `zoom` skips form
 * controls in webkit, and the Tauri shell has no native browser zoom. The
 * effects synchronize with things outside React (the URL hash, the window
 * keydown listener, the zoom transform).
 *
 * The "day" theme is a placeholder token set proving the switch mechanism —
 * a real second theme needs the diff and syntax palettes too, and lives in
 * @nod/tokens when it exists. The "not catalogued yet" rail section derives
 * from coverage.ts, whose test gates new components — the list on screen is
 * the list that gates. Dialog entries render INLINE in the frame (so width
 * presets apply), with the real top-layer modal behind "Open as modal";
 * keys pressed inside any specimen dialog stay the specimen's.
 *
 * Notes are design feedback captured against a cell and spent in one batch
 * later (pnpm gallery:notes, then the gallery-notes skill). They live beside
 * the component's fixtures on disk and are written by the dev server, so the
 * margin and its toggle exist only while that server does — and never under
 * ?capture, which keeps every baseline out of reach of this feature. They are
 * read twice for two reasons: once at mount so the rail can mark which
 * components carry notes without anything being opened, and again whenever
 * the margin opens, because the other writer is an agent clearing what it
 * just fixed and the tab is usually still open behind it.
 *
 * Every key is written down once, in the same ? sheet the desktop app opens
 * (help-overlay from @nod/ui, handed a static section list because the
 * gallery has no keyboard registry to flatten). The bar under the stage is
 * left with the route readout alone: a tall cell's stitched webkit capture
 * bakes that band in, so a hint parked there rewrites every tall baseline on
 * both platforms the day it changes. The `c` hint stays on the topbar
 * toggle for the same reason — anything only the chrome needs to say belongs
 * above the stage, where ?capture can suppress it. The sheet itself is a
 * modal, so it never renders under ?capture at all.
 *
 * `c` opens and focuses the composer rather than toggling, because the key
 * you press to write a note should leave you writing; it preventDefaults for
 * the same reason `/` does, or the letter lands in the field it just focused.
 * Escape is what closes the margin. Since opening always puts the caret in
 * the composer, the composer's own chords are the scope and submit keys —
 * a bare letter would only ever reach the gallery after a mouse click, which
 * is not worth spending one on.
 *
 * The draft and scope live here rather than in the margin so that closing
 * cannot destroy half a sentence, and drafts are held per component so one
 * can never be filed under whatever a j/k press landed on.
 */
import { Button } from "@nod/ui/button";
import { catalog } from "@nod/ui/catalog";
import { isSequence, sequenceElement } from "@nod/ui/fixtures";
import { HelpOverlay, type HelpSection } from "@nod/ui/help-overlay";
import { Kbd } from "@nod/ui/kbd";
import { isView } from "@nod/ui/manifest";
import { useLatest } from "@nod/ui/use-latest";
import { Fragment, useEffect, useState } from "react";
import { PENDING } from "./coverage.ts";
import {
  cellAnchor,
  emptyNotes,
  isHidden,
  type NoteScope,
  type NotesFile,
} from "./notes.ts";
import {
  fetchAllNotes,
  type NotesByComponent,
  postNote,
  removeNote,
  setHidden,
} from "./notes-client.ts";
import { NotesMargin } from "./notes-margin.tsx";
import {
  captureName,
  cycle,
  formatGalleryHash,
  GALLERY_MODES,
  GALLERY_THEMES,
  GALLERY_WIDTHS,
  type GalleryRoute,
  parseGalleryHash,
} from "./route.ts";
import "./gallery.css";

const THEME_LABELS = { day: "Daylight", quiet: "Quiet" } as const;
const MODE_LABELS = { matrix: "Matrix", specimen: "Specimen" } as const;

const catalogNames = Object.keys(catalog);
const viewNames = catalogNames.filter((name) => isView(catalog[name]));
const partNames = catalogNames.filter((name) => !isView(catalog[name]));
const componentNames = [...viewNames, ...partNames];
const cataloguedNames = new Set(componentNames);

/**
 * Rail order, and therefore the order every key walk follows: surfaces
 * first, then the parts they are built from, then names with no fixtures
 * yet. Exported because the tests that assert walking order must not
 * re-derive it — two definitions of "next" is how a rail and its keyboard
 * drift apart.
 */
export const allNames = [...componentNames, ...PENDING];

type RailTier = "components" | "hidden" | "views";

/** "Parts", not "Components": it is the word the tier system already uses
 *  everywhere else (fixtures.ts, TESTING.md, the capture rule), it is the
 *  actual opposite of a view, and it is short enough that three tabs and
 *  their counts fit the rail — "Components" alone overran it by 16px. */
const TIER_LABELS: Record<RailTier, string> = {
  components: "Parts",
  hidden: "Hidden",
  views: "Views",
};

/** The rail's standing partition, before anything is hidden. Names with no
 *  fixtures yet are components that have not been built, so they sit under
 *  Components rather than earning a tab for a state that is temporary by
 *  definition. Exported so the tests do not re-derive rail order. */
export const tierNames: Record<"components" | "views", readonly string[]> = {
  components: [...partNames, ...PENDING],
  views: viewNames,
};

/**
 * The tiers as the rail shows them for one set of hidden names. A hidden
 * entry leaves its own tab for Hidden, which is the only place it can be
 * brought back from.
 *
 * Hiding is a listing choice and nothing else: the catalog still holds the
 * entry, the capture suite still shoots its cells, and the coverage ratchet
 * still counts it. That is what keeps the flag safe to use on anything
 * merely noisy — you are tidying a rail, not dropping coverage.
 */
function railTiers(
  hidden: ReadonlySet<string>
): Record<RailTier, readonly string[]> {
  const shown = (names: readonly string[]) =>
    names.filter((name) => !hidden.has(name));
  return {
    components: shown(tierNames.components),
    hidden: allNames.filter((name) => hidden.has(name)),
    views: shown(tierNames.views),
  };
}

/**
 * Which tab a name belongs to — and therefore which tab is open, because the
 * active tab is derived from the selection rather than stored beside it. One
 * source of truth means a deep link to a view opens the Views tab for free,
 * and no gesture can leave the tab disagreeing with the stage.
 */
function tierOf(name: string, hidden: ReadonlySet<string>): RailTier {
  if (hidden.has(name)) {
    return "hidden";
  }
  return cataloguedNames.has(name) && isView(catalog[name])
    ? "views"
    : "components";
}

const fixturesOf = (component: string): readonly string[] =>
  Object.keys(catalog[component]?.fixtures ?? {});

function widthLabel(width: number): string {
  return width === 0 ? "Fluid" : String(width);
}

function noteToggleLabel(open: number): string {
  if (open === 0) {
    return "Notes";
  }
  return open === 1 ? "1 note" : `${open} notes`;
}

const noopOpenChange = () => {
  return;
};

/** Attached only to the rail item the keys land on (the selection, or the
 *  find candidate while filtering), so a j/k or arrow walk scrolls the rail
 *  along with it. Attach-on-change is the whole mechanism — a mouse click
 *  selects an item that is already in view, so `nearest` moves nothing.
 *  The candidate wears its own wrapper identity because React only
 *  re-attaches a ref whose function changed: find's Enter turns the
 *  candidate into the selection on the same element while the cleared
 *  filter pours the full list back around it, and one shared callback
 *  would leave that handoff unannounced with the selection off-screen. */
function revealRailItem(el: HTMLButtonElement | null) {
  el?.scrollIntoView({ block: "nearest" });
}

const revealFindCandidate = (el: HTMLButtonElement | null) =>
  revealRailItem(el);

function railRevealRef(isFindCandidate: boolean, isSelected: boolean) {
  if (isFindCandidate) {
    return revealFindCandidate;
  }
  return isSelected ? revealRailItem : undefined;
}

function ModalLauncher({ route }: { route: GalleryRoute }) {
  const entry = catalog[route.component];
  const [open, setOpen] = useState(false);
  if (!entry) {
    return null;
  }
  const fixture = entry.fixtures[route.fixture];
  if (isSequence(fixture)) {
    return null;
  }
  const Specimen = entry.component;
  return (
    <div className={`qg-modal-launch qg-stage-${route.theme}`}>
      <Button
        onClick={() => {
          setOpen(true);
        }}
        variant="quiet"
      >
        Open as modal
      </Button>
      {open ? (
        <Specimen {...fixture.props} onOpenChange={setOpen} open />
      ) : null}
    </div>
  );
}

function Frame({ route, small }: { route: GalleryRoute; small?: boolean }) {
  const entry = catalog[route.component];
  if (!entry) {
    return null;
  }
  const fixture = entry.fixtures[route.fixture];
  const Specimen = entry.component;
  const specimen = isSequence(fixture) ? (
    sequenceElement(fixture)
  ) : (
    <Specimen
      {...(entry.dialog
        ? { ...fixture.props, inline: true, onOpenChange: noopOpenChange }
        : fixture.props)}
    />
  );
  return (
    <div className="qg-frame-wrap">
      <div
        className={`qg-frame qg-stage-${route.theme} ${route.width ? "qg-frame-fit" : ""}`}
        data-frame
      >
        <i className="qg-tick qg-tl" />
        <i className="qg-tick qg-tr" />
        <i className="qg-tick qg-bl" />
        <i className="qg-tick qg-br" />
        <i className="qg-slot-tick qg-tl" />
        <i className="qg-slot-tick qg-tr" />
        <i className="qg-slot-tick qg-bl" />
        <i className="qg-slot-tick qg-br" />
        <div className="qg-mat">
          <div
            className="qg-viewport"
            style={route.width ? { width: route.width } : { flex: 1 }}
          >
            {specimen}
          </div>
        </div>
      </div>
      <div className="qg-meta">
        <span>{captureName(route)}</span>
        {fixture.provenance && !small ? (
          <span className="qg-prov">{fixture.provenance}</span>
        ) : null}
      </div>
      {entry.dialog && !small ? <ModalLauncher route={route} /> : null}
    </div>
  );
}

function EmptyCatalogNotice({ name }: { name: string }) {
  return (
    <div className="qg-empty">
      <h2>Not catalogued yet</h2>
      <p>
        {name} still renders from app state, so no fixture can express it. Lift
        the store and Tauri reads into its call site, move the pure component
        into packages/ui, and add a fixtures file next to it. The
        quiet-component skill walks every step, hostile checklist included.
      </p>
    </div>
  );
}

function StageContent({ route }: { route: GalleryRoute }) {
  const entry = catalog[route.component];
  if (!entry) {
    return <EmptyCatalogNotice name={route.component} />;
  }
  if (route.mode === "specimen") {
    return <Frame route={route} />;
  }
  return (
    <div className="qg-matrix">
      {GALLERY_THEMES.map((theme) => (
        <div className="qg-matrix-head" key={theme}>
          {THEME_LABELS[theme]}
        </div>
      ))}
      {fixturesOf(route.component).flatMap((fixture) =>
        GALLERY_THEMES.map((theme) => (
          <Frame
            key={`${fixture}-${theme}`}
            route={{ ...route, fixture, theme }}
            small
          />
        ))
      )}
    </div>
  );
}

const isCaptureRun = () =>
  new URLSearchParams(window.location.search).has("capture");

const ZOOM_KEY = "nod-gallery:zoom";

function applyGalleryZoom(factor: number) {
  try {
    localStorage.setItem(ZOOM_KEY, String(factor));
  } catch {
    /* ignore */
  }
  const root = document.getElementById("root");
  if (!root) {
    return;
  }
  if (factor === 1) {
    root.style.transform = "";
    root.style.transformOrigin = "";
    root.style.width = "";
    root.style.height = "";
    document.documentElement.style.removeProperty("--qg-zoom");
    return;
  }
  root.style.transform = `scale(${factor})`;
  root.style.transformOrigin = "0 0";
  root.style.width = `${100 / factor}vw`;
  root.style.height = `${100 / factor}vh`;
  document.documentElement.style.setProperty("--qg-zoom", String(factor));
}

function loadGalleryZoom(): number {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    return Number.isFinite(v) && v >= 0.5 && v <= 2 ? v : 1;
  } catch {
    return 1;
  }
}

/**
 * What the ? sheet lists. The desktop flattens its live keyboard registry
 * into this shape; the gallery has no registry, so the sections are written
 * out once at module scope — beside the handlers they describe, and never
 * rebuilt per render. Navigate leads because it is the section a stranger
 * needs first, and it is the only one marked active for the same reason.
 */
const HELP_SECTIONS: readonly HelpSection[] = [
  {
    active: true,
    bindings: [
      { combo: "j", description: "Next component" },
      { combo: "k", description: "Previous component" },
      { combo: "down", description: "Next component" },
      { combo: "up", description: "Previous component" },
      { combo: "tab", description: "Next component" },
      { combo: "shift+tab", description: "Previous component" },
      { combo: "v", description: "Switch between Views and Components" },
      { combo: "h", description: "Hide this entry, or bring it back" },
      { combo: "/", description: "Find a component" },
      { combo: "?", description: "Show this sheet" },
    ],
    note: "Walks the open tab only",
    scope: "Navigate",
  },
  {
    bindings: [
      { combo: "f", description: "Next fixture" },
      { combo: "t", description: "Next theme" },
      { combo: "w", description: "Next width" },
      { combo: "m", description: "Switch specimen and matrix view" },
      { combo: "x", description: "Toggle the component outline" },
      { combo: "esc", description: "Hand focus back from a specimen" },
    ],
    note: "Shift reverses any cycling key",
    scope: "Stage",
  },
  {
    bindings: [
      { combo: "mod+=", description: "Zoom in" },
      { combo: "mod+-", description: "Zoom out" },
      { combo: "mod+0", description: "Reset zoom" },
    ],
    scope: "Zoom",
  },
  {
    bindings: [
      { combo: "c", description: "Open the notes margin" },
      { combo: "mod+enter", description: "Leave the note" },
      { combo: "mod+s", description: "Switch the note's scope" },
      { combo: "esc", description: "Close the notes margin" },
    ],
    note: "Dev server only, and hiding is stored beside the notes",
    scope: "Notes",
  },
];

function ignoreGalleryKeys(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return true;
  }
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
  ) {
    return true;
  }
  return (
    event.target instanceof HTMLElement &&
    (event.target.isContentEditable || event.target.closest("dialog") !== null)
  );
}

const FRAME_FOCUS_GRACE_MS = 500;

function inModalDialog(element: Element): boolean {
  return element.closest("dialog")?.matches(":modal") ?? false;
}

function releaseSpecimenFocus(): boolean {
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    active.closest("[data-frame]") &&
    !inModalDialog(active)
  ) {
    active.blur();
    return true;
  }
  return false;
}

function routePatchForKey(
  key: string,
  dir: 1 | -1,
  route: GalleryRoute,
  tiers: Record<RailTier, readonly string[]>,
  activeTier: RailTier
): Partial<GalleryRoute> | null {
  const openTier = tiers[activeTier];
  switch (key) {
    // Walking stays inside the open tab: j/k is how you read a tier, and
    // silently crossing into the other one is how you lose your place.
    case "j":
    case "ArrowDown":
      return {
        component: cycle(openTier, route.component, 1),
      };
    case "k":
    case "ArrowUp":
      return {
        component: cycle(openTier, route.component, -1),
      };
    case "Tab":
      return {
        component: cycle(openTier, route.component, dir),
      };
    case "f": {
      const fixtures = fixturesOf(route.component);
      return fixtures.length > 0
        ? { fixture: cycle(fixtures, route.fixture, dir) }
        : null;
    }
    // Flips the rail's tab. It lands on the other tier's first name because
    // the tab is the selection's tier read back — there is no tab state of
    // its own to move.
    case "v": {
      // Flips between the two standing tabs; from Hidden it lands on Views,
      // since Hidden is somewhere you go back from, not a third stop in a
      // cycle.
      const other = activeTier === "views" ? "components" : "views";
      return { component: tiers[other][0] ?? route.component };
    }
    case "t":
      return { theme: cycle(GALLERY_THEMES, route.theme, dir) };
    case "w":
      return { width: cycle(GALLERY_WIDTHS, route.width, dir) };
    case "m":
      return { mode: cycle(GALLERY_MODES, route.mode, dir) };
    default:
      return null;
  }
}

interface GalleryKeyActions {
  setRoute: React.Dispatch<React.SetStateAction<GalleryRoute>>;
  setXray: React.Dispatch<React.SetStateAction<boolean>>;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  setHelpOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setNotesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notesOpen: boolean;
  tiers: Record<RailTier, readonly string[]>;
  activeTier: RailTier;
  onToggleHidden: () => void;
}

function handleGalleryKey(
  event: KeyboardEvent,
  route: GalleryRoute,
  {
    setRoute,
    setXray,
    setZoom,
    setHelpOpen,
    setNotesOpen,
    notesOpen,
    tiers,
    activeTier,
    onToggleHidden,
  }: GalleryKeyActions
): void {
  if (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    handleZoomKey(event.key, setZoom)
  ) {
    event.preventDefault();
    return;
  }
  if (event.key === "Escape" && releaseSpecimenFocus()) {
    return;
  }
  if (ignoreGalleryKeys(event)) {
    return;
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === "x") {
    setXray((on) => !on);
    return;
  }
  if (key === "Escape" && notesOpen) {
    setNotesOpen(false);
    return;
  }
  if (key === "c") {
    event.preventDefault();
    setNotesOpen(true);
    return;
  }
  if (key === "/") {
    event.preventDefault();
    document.querySelector<HTMLInputElement>(".qg-find input")?.focus();
    return;
  }
  // Same key the desktop app answers to. Closing is the sheet's own business:
  // it is a modal, so Escape reaches its cancel handler and never this one.
  if (key === "?") {
    event.preventDefault();
    setHelpOpen(true);
    return;
  }
  if (key === "h") {
    event.preventDefault();
    onToggleHidden();
    return;
  }
  const patch = routePatchForKey(
    key,
    event.shiftKey ? -1 : 1,
    route,
    tiers,
    activeTier
  );
  if (patch) {
    if (key === "Tab") {
      event.preventDefault();
    }
    setRoute((r) => normalize({ ...r, ...patch }));
  }
}

function handleZoomKey(
  key: string,
  setZoom: React.Dispatch<React.SetStateAction<number>>
): boolean {
  if (key === "=" || key === "+") {
    setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10));
    return true;
  }
  if (key === "-") {
    setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10));
    return true;
  }
  if (key === "0") {
    setZoom(1);
    return true;
  }
  return false;
}

/** The rail: find field, two tabs — views (whole surfaces) and the
 *  components they are built from — and the open tab's catalogue, each item
 *  carrying its open-note count. */
function GalleryRail({
  activeTier,
  tiers,
  cataloguedNames,
  filter,
  findSel,
  onFindChange,
  onFindKeyDown,
  onSelect,
  openNotesOf,
  selected,
  visibleNames,
}: {
  activeTier: RailTier;
  tiers: Record<RailTier, readonly string[]>;
  cataloguedNames: ReadonlySet<string>;
  filter: string;
  findSel: number;
  onFindChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFindKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelect: (name: string) => void;
  openNotesOf: (name: string) => number;
  selected: string;
  visibleNames: readonly string[];
}) {
  return (
    <aside className="qg-rail">
      <div className="qg-rail-head">
        <span className="qg-brand">Nod</span>
        <span className="qg-env">gallery · dev</span>
      </div>
      <div className="qg-find">
        <input
          aria-label="Find a component"
          onChange={onFindChange}
          onKeyDown={onFindKeyDown}
          placeholder="Find a component  /"
          type="text"
          value={filter}
        />
      </div>
      <div className="qg-rail-tabs" role="tablist">
        {(Object.keys(TIER_LABELS) as RailTier[])
          // Hidden appears only once something is in it: an empty tab for a
          // feature nobody used is chrome that never pays for itself.
          .filter((tier) => tier !== "hidden" || tiers.hidden.length > 0)
          .map((tier) => (
            <button
              aria-selected={tier === activeTier}
              className={[
                "qg-rail-tab",
                tier === activeTier ? "qg-on" : "",
              ].join(" ")}
              key={tier}
              // Selecting the tier's first name is what opens the tab, since
              // the tab is that selection's tier read back.
              onClick={() => onSelect(tiers[tier][0] ?? "")}
              role="tab"
              type="button"
            >
              {TIER_LABELS[tier]}
              <span className="qg-rail-tab-n">{tiers[tier].length}</span>
            </button>
          ))}
      </div>
      <nav aria-label={TIER_LABELS[activeTier]} className="qg-rail-list">
        {visibleNames.map((name, index) => {
          const catalogued = cataloguedNames.has(name);
          const isSelected = name === selected;
          const isFindCandidate = filter !== "" && index === findSel;
          return (
            <Fragment key={name}>
              <button
                className={[
                  "qg-rail-item",
                  catalogued ? "" : "qg-bare",
                  isSelected ? "qg-sel" : "",
                  isFindCandidate ? "qg-cand" : "",
                ].join(" ")}
                onClick={() => onSelect(name)}
                ref={railRevealRef(isFindCandidate, isSelected)}
                type="button"
              >
                <i className="qg-dot" />
                <span className="qg-name">{name}</span>
                {openNotesOf(name) > 0 ? (
                  <span className="qg-mark">{openNotesOf(name)}</span>
                ) : null}
                <span className="qg-count">
                  {catalogued ? fixturesOf(name).length : "—"}
                </span>
              </button>
            </Fragment>
          );
        })}
      </nav>
      <div className="qg-rail-foot">
        {componentNames.length} of {allNames.length} catalogued
      </div>
    </aside>
  );
}

/** The stage's controls: fixture, theme, width and view, each a segmented
 *  row that writes straight into the route. */
function StageControls({
  fixtureNames,
  onRouteChange,
  route,
}: {
  fixtureNames: readonly string[];
  onRouteChange: (next: (r: GalleryRoute) => GalleryRoute) => void;
  route: GalleryRoute;
}) {
  return (
    <div className="qg-controls">
      <div className="qg-ctl qg-ctl-fixtures">
        <span className="qg-ctl-label">fixture · {fixtureNames.length}</span>
        {fixtureNames.map((name) => (
          <button
            className={`qg-chip ${name === route.fixture ? "qg-on" : ""}`}
            key={name}
            onClick={() => {
              onRouteChange((r) => normalize({ ...r, fixture: name }));
            }}
            type="button"
          >
            {name}
          </button>
        ))}
        <Kbd combo="f" />
      </div>
      <div className="qg-ctl">
        <span className="qg-ctl-label">theme</span>
        <div className="qg-seg">
          {GALLERY_THEMES.map((theme) => (
            <button
              className={theme === route.theme ? "qg-on" : ""}
              key={theme}
              onClick={() => {
                onRouteChange((r) => normalize({ ...r, theme }));
              }}
              type="button"
            >
              {THEME_LABELS[theme]}
            </button>
          ))}
        </div>
        <Kbd combo="t" />
      </div>
      <div className="qg-ctl">
        <span className="qg-ctl-label">width</span>
        <div className="qg-seg">
          {GALLERY_WIDTHS.map((width) => (
            <button
              className={width === route.width ? "qg-on" : ""}
              key={width}
              onClick={() => {
                onRouteChange((r) => normalize({ ...r, width }));
              }}
              type="button"
            >
              {widthLabel(width)}
            </button>
          ))}
        </div>
        <Kbd combo="w" />
      </div>
      <div className="qg-ctl">
        <span className="qg-ctl-label">view</span>
        <div className="qg-seg">
          {GALLERY_MODES.map((mode) => (
            <button
              className={mode === route.mode ? "qg-on" : ""}
              key={mode}
              onClick={() => {
                onRouteChange((r) => normalize({ ...r, mode }));
              }}
              type="button"
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
        <Kbd combo="m" />
      </div>
    </div>
  );
}

export function Gallery() {
  const [route, setRoute] = useState<GalleryRoute>(() =>
    parseGalleryHash(window.location.hash, allNames, fixturesOf)
  );
  const [filter, setFilter] = useState("");
  const [findSel, setFindSel] = useState(0);
  const [zoom, setZoom] = useState(loadGalleryZoom);
  const [xray, setXray] = useState(false);
  const [capture] = useState(isCaptureRun);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notes, setNotes] = useState<NotesByComponent>({});
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteScope, setNoteScope] = useState<NoteScope>("component");

  useEffect(() => {
    applyGalleryZoom(zoom);
  }, [zoom]);

  useEffect(() => {
    if (capture) {
      return;
    }
    fetchAllNotes().then((all) => {
      setNotes(all);
    });
  }, [capture]);

  useEffect(() => {
    if (capture || !notesOpen) {
      return;
    }
    fetchAllNotes().then((all) => {
      setNotes(all);
    });
    document
      .querySelector<HTMLTextAreaElement>(".qg-compose textarea")
      ?.focus();
  }, [capture, notesOpen]);

  useEffect(() => {
    let framePressAt = Number.NEGATIVE_INFINITY;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-frame]")
      ) {
        framePressAt = performance.now();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (!target.closest("[data-frame]")) {
        return;
      }
      if (performance.now() - framePressAt < FRAME_FOCUS_GRACE_MS) {
        return;
      }
      if (inModalDialog(target)) {
        return;
      }
      target.blur();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  const entry = catalog[route.component];
  const fixtureNames = fixturesOf(route.component);

  useEffect(() => {
    history.replaceState(null, "", formatGalleryHash(route));
  }, [route]);

  // Hidden lives in the notes files, so the tiers are runtime data, not a
  // module constant: what the rail lists depends on what the dev server
  // last read off disk.
  const hiddenNames = new Set(
    Object.entries(notes)
      .filter(([, file]) => isHidden(file))
      .map(([component]) => component)
  );
  const tiers = railTiers(hiddenNames);
  const activeTier = tierOf(route.component, hiddenNames);

  const applyNotes = (result: { error: string; file: NotesFile }) => {
    setNotesError(result.error);
    if (!result.error) {
      setNotes((all) => ({ ...all, [route.component]: result.file }));
    }
  };

  /** Hiding is a write to the component's own notes file, so the rail's
   *  contents survive a reload and travel with the repo. */
  const toggleHidden = () => {
    setHidden(route.component, !hiddenNames.has(route.component)).then(
      applyNotes
    );
  };

  // The listener is bound once per route, so the tier state it reads has to
  // arrive by ref — re-subscribing on every render to keep three derived
  // values fresh would be the more expensive way to be correct.
  const keyState = useLatest({ activeTier, tiers, toggleHidden });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleGalleryKey(event, route, {
        activeTier: keyState.current.activeTier,
        notesOpen,
        onToggleHidden: keyState.current.toggleHidden,
        setHelpOpen,
        setNotesOpen,
        setRoute,
        setXray,
        setZoom,
        tiers: keyState.current.tiers,
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [route, notesOpen, keyState]);

  const needle = filter.trim().toLowerCase();
  const matching = (tier: RailTier) =>
    tiers[tier].filter((name) => name.includes(needle));
  const here = matching(activeTier);
  // A search that matches nothing in the open tab falls through to the other
  // one rather than dead-ending: picking a result selects it, and the tab
  // follows the selection, so the fall-through is also the way across.
  // Hidden is deliberately not in that fall-through — a hidden entry should
  // stay out of the way until you go looking for it.
  const visibleNames =
    here.length > 0
      ? here
      : matching(activeTier === "views" ? "components" : "views");

  const select = (component: string) => {
    setRoute((r) => normalize({ ...r, component }));
  };

  const openNotesOf = (component: string) => notes[component]?.open.length ?? 0;

  const onSubmitNote = () => {
    const note = (noteDrafts[route.component] ?? "").trim();
    if (!note) {
      return;
    }
    postNote(route.component, {
      cell: cellAnchor(route),
      note,
      scope: noteScope,
    }).then((result) => {
      applyNotes(result);
      if (!result.error) {
        setNoteDrafts((drafts) => ({ ...drafts, [route.component]: "" }));
        setNoteScope("component");
      }
    });
  };

  const onRemoveNote = (id: string) => {
    removeNote(route.component, id).then(applyNotes);
  };

  const onFindChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(event.target.value);
    setFindSel(0);
  };

  const onFindKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFindSel((s) => Math.min(s + 1, visibleNames.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setFindSel((s) => Math.max(s - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = visibleNames[findSel] ?? visibleNames[0];
      if (hit) {
        select(hit);
        setFilter("");
        setFindSel(0);
        event.currentTarget.blur();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setFilter("");
      setFindSel(0);
      event.currentTarget.blur();
    }
  };

  return (
    <div
      className={[
        "qg-root",
        `qg-stage-${route.theme}`,
        capture ? "qg-capture" : "",
      ].join(" ")}
    >
      <GalleryRail
        activeTier={activeTier}
        cataloguedNames={cataloguedNames}
        filter={filter}
        findSel={findSel}
        onFindChange={onFindChange}
        onFindKeyDown={onFindKeyDown}
        onSelect={select}
        openNotesOf={openNotesOf}
        selected={route.component}
        tiers={tiers}
        visibleNames={visibleNames}
      />

      <div className="qg-main">
        <header className="qg-topbar">
          <div className="qg-comp-row">
            <span className="qg-comp-name">{route.component}</span>
            {entry ? (
              <span className="qg-comp-path">
                packages/ui/src/{route.component}/{route.component}.tsx
              </span>
            ) : null}
            {capture ? null : (
              <button
                className={`qg-note-toggle q-focus ${notesOpen ? "qg-on" : ""}`}
                onClick={() => {
                  setNotesOpen((open) => !open);
                }}
                type="button"
              >
                {noteToggleLabel(openNotesOf(route.component))}
                <Kbd combo="c" />
              </button>
            )}
          </div>
          {entry ? (
            <StageControls
              fixtureNames={fixtureNames}
              onRouteChange={setRoute}
              route={route}
            />
          ) : null}
        </header>

        <main className={xray ? "qg-stage qg-xray" : "qg-stage"}>
          <StageContent route={route} />
        </main>

        <footer className="qg-helpbar">
          <span className="qg-hash">{formatGalleryHash(route)}</span>
        </footer>
      </div>

      {notesOpen && !capture ? (
        <NotesMargin
          cell={cellAnchor(route)}
          component={route.component}
          draft={noteDrafts[route.component] ?? ""}
          error={notesError}
          file={notes[route.component] ?? emptyNotes()}
          onClose={() => {
            setNotesOpen(false);
          }}
          onDraftChange={(text) => {
            setNoteDrafts((drafts) => ({ ...drafts, [route.component]: text }));
          }}
          onRemove={onRemoveNote}
          onScopeChange={setNoteScope}
          onSubmit={onSubmitNote}
          scope={noteScope}
        />
      ) : null}

      {capture ? null : (
        <HelpOverlay
          onOpenChange={setHelpOpen}
          open={helpOpen}
          sections={HELP_SECTIONS}
        />
      )}
    </div>
  );
}

function normalize(route: GalleryRoute): GalleryRoute {
  const fixtures = fixturesOf(route.component);
  if (fixtures.length === 0) {
    return { ...route, fixture: "" };
  }
  return fixtures.includes(route.fixture)
    ? route
    : { ...route, fixture: fixtures[0] };
}
