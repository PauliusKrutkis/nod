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
 * the gallery is a screenshot target first and a showroom second.
 *
 * Interaction is keyboard-first like the rest of the app: j/k, Tab, or the
 * arrows switch component, f fixture, t theme, w width, m view, / find
 * (arrows walk matches, Enter jumps), mod +/-/0 zoom. Zoom is a transform
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
 */
import { Button } from "@nod/ui/button";
import { catalog } from "@nod/ui/catalog";
import { Kbd } from "@nod/ui/kbd";
import { useEffect, useState } from "react";
import { PENDING } from "./coverage.ts";
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
  const specimenProps = entry.dialog
    ? { ...fixture.props, inline: true, onOpenChange: noopOpenChange }
    : fixture.props;
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
        <div
          className="qg-viewport"
          style={route.width ? { width: route.width } : { flex: 1 }}
        >
          <Specimen {...specimenProps} />
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
  if (event.target instanceof HTMLInputElement) {
    return true;
  }
  return (
    event.target instanceof HTMLElement &&
    event.target.closest("dialog") !== null
  );
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

  useEffect(() => {
    applyGalleryZoom(zoom);
  }, [zoom]);

  const entry = catalog[route.component];
  const fixtureNames = fixturesOf(route.component);

  useEffect(() => {
    history.replaceState(null, "", formatGalleryHash(route));
  }, [route]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        handleZoomKey(event.key, setZoom)
      ) {
        event.preventDefault();
        return;
      }
      if (ignoreGalleryKeys(event)) {
        return;
      }
      const move = (patch: Partial<GalleryRoute>) =>
        setRoute((r) => normalize({ ...r, ...patch }));
      const routeFixtures = fixturesOf(route.component);
      const step = event.shiftKey ? -1 : 1;
      switch (event.key) {
        case "j":
        case "ArrowDown":
          move({ component: cycle(allNames, route.component, 1) });
          break;
        case "k":
        case "ArrowUp":
          move({ component: cycle(allNames, route.component, -1) });
          break;
        case "Tab":
          event.preventDefault();
          move({ component: cycle(allNames, route.component, step) });
          break;
        case "f":
          if (routeFixtures.length > 0) {
            move({ fixture: cycle(routeFixtures, route.fixture, 1) });
          }
          break;
        case "t":
          move({ theme: cycle(GALLERY_THEMES, route.theme, 1) });
          break;
        case "w":
          move({ width: cycle(GALLERY_WIDTHS, route.width, 1) });
          break;
        case "m":
          move({ mode: cycle(GALLERY_MODES, route.mode, 1) });
          break;
        case "/":
          event.preventDefault();
          document.querySelector<HTMLInputElement>(".qg-find input")?.focus();
          break;
        default:
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [route]);

  const visibleNames = allNames.filter((name) =>
    name.includes(filter.trim().toLowerCase())
  );

  const select = (component: string) => {
    setRoute((r) => normalize({ ...r, component }));
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
    <div className="qg-root">
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
                packages/ui/src/{route.component}.tsx
              </span>
            ) : null}
          </div>
          {entry ? (
            <div className="qg-controls">
              <div className="qg-ctl">
                <span className="qg-ctl-label">fixture</span>
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

        <main className="qg-stage">
          <StageContent route={route} />
        </main>

        <footer className="qg-helpbar">
          <span>j/k · tab · arrows component</span>
          <span>f fixture</span>
          <span>t theme</span>
          <span>w width</span>
          <span>m view</span>
          <span>/ find</span>
          <span>mod ± zoom</span>
          <span className="qg-hash">{formatGalleryHash(route)}</span>
        </footer>
      </div>
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
