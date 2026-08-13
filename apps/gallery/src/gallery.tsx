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
 * matches, Enter jumps), mod +/-/0 zoom.
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
 * The `c` hint lives on the topbar toggle and deliberately NOT in the
 * helpbar: a tall cell's stitched webkit capture bakes in the fixed helpbar
 * band, so one more key there rewrites every tall baseline on both
 * platforms. Anything that only chrome needs to say belongs above the stage,
 * where ?capture can suppress it.
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
import { Kbd } from "@nod/ui/kbd";
import { useEffect, useState } from "react";
import { PENDING } from "./coverage.ts";
import {
  cellAnchor,
  emptyNotes,
  type NoteScope,
  type NotesFile,
} from "./notes.ts";
import {
  fetchAllNotes,
  type NotesByComponent,
  postNote,
  removeNote,
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

const componentNames = Object.keys(catalog);
const cataloguedNames = new Set(componentNames);
const allNames = [...componentNames, ...PENDING];

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
  route: GalleryRoute
): Partial<GalleryRoute> | null {
  switch (key) {
    case "j":
    case "ArrowDown":
      return { component: cycle(allNames, route.component, 1) };
    case "k":
    case "ArrowUp":
      return { component: cycle(allNames, route.component, -1) };
    case "Tab":
      return { component: cycle(allNames, route.component, dir) };
    case "f": {
      const fixtures = fixturesOf(route.component);
      return fixtures.length > 0
        ? { fixture: cycle(fixtures, route.fixture, dir) }
        : null;
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
  setNotesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notesOpen: boolean;
}

function handleGalleryKey(
  event: KeyboardEvent,
  route: GalleryRoute,
  { setRoute, setXray, setZoom, setNotesOpen, notesOpen }: GalleryKeyActions
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
  const patch = routePatchForKey(key, event.shiftKey ? -1 : 1, route);
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

export function Gallery() {
  const [route, setRoute] = useState<GalleryRoute>(() =>
    parseGalleryHash(window.location.hash, allNames, fixturesOf)
  );
  const [filter, setFilter] = useState("");
  const [findSel, setFindSel] = useState(0);
  const [zoom, setZoom] = useState(loadGalleryZoom);
  const [xray, setXray] = useState(false);
  const [capture] = useState(isCaptureRun);
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleGalleryKey(event, route, {
        notesOpen,
        setNotesOpen,
        setRoute,
        setXray,
        setZoom,
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [route, notesOpen]);

  const visibleNames = allNames.filter((name) =>
    name.includes(filter.trim().toLowerCase())
  );

  const select = (component: string) => {
    setRoute((r) => normalize({ ...r, component }));
  };

  const openNotesOf = (component: string) => notes[component]?.open.length ?? 0;

  const applyNotes = (result: { error: string; file: NotesFile }) => {
    setNotesError(result.error);
    if (!result.error) {
      setNotes((all) => ({ ...all, [route.component]: result.file }));
    }
  };

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
        <nav aria-label="Components" className="qg-rail-list">
          {visibleNames.map((name, index) => {
            const catalogued = cataloguedNames.has(name);
            return (
              <button
                className={[
                  "qg-rail-item",
                  catalogued ? "" : "qg-bare",
                  name === route.component ? "qg-sel" : "",
                  filter && index === findSel ? "qg-cand" : "",
                ].join(" ")}
                key={name}
                onClick={() => select(name)}
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
            );
          })}
        </nav>
        <div className="qg-rail-foot">
          {componentNames.length} of {allNames.length} catalogued
        </div>
      </aside>

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
            <div className="qg-controls">
              <div className="qg-ctl qg-ctl-fixtures">
                <span className="qg-ctl-label">
                  fixture · {fixtureNames.length}
                </span>
                {fixtureNames.map((name) => (
                  <button
                    className={`qg-chip ${name === route.fixture ? "qg-on" : ""}`}
                    key={name}
                    onClick={() => {
                      setRoute((r) => normalize({ ...r, fixture: name }));
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
                        setRoute((r) => normalize({ ...r, theme }));
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
                        setRoute((r) => normalize({ ...r, width }));
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
                        setRoute((r) => normalize({ ...r, mode }));
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
          ) : null}
        </header>

        <main className={xray ? "qg-stage qg-xray" : "qg-stage"}>
          <StageContent route={route} />
        </main>

        <footer className="qg-helpbar">
          <span>j/k · tab · arrows component</span>
          <span>f fixture</span>
          <span>t theme</span>
          <span>w width</span>
          <span>m view</span>
          <span>x outline</span>
          <span>/ find</span>
          <span>mod ± zoom</span>
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
