/**
 * The component gallery — a dev-only surface, never part of a release build
 * (main.tsx mounts it behind import.meta.env.DEV, so the chunk is
 * tree-shaken out of production).
 *
 * It renders the REAL components from @nod/ui under their catalogued
 * fixtures; there is no parallel mock to drift the way the deleted
 * design-lab did. The chrome stays quieter than the specimens on purpose:
 * dim mono metadata, iris only on selection, and a capture frame whose
 * printed filename is exactly what the webkit screenshot suite snapshots —
 * the gallery is a screenshot target first and a showroom second.
 *
 * Interaction is keyboard-first like the rest of the app: j/k component,
 * f fixture, t theme, w width, m view, / find. The two effects synchronize
 * with things outside React (the URL hash, the window keydown listener).
 *
 * The "day" theme is a placeholder token set proving the switch mechanism —
 * a real second theme needs the diff and syntax palettes too, and lives in
 * @nod/tokens when it exists. RETROFIT_QUEUE lists desktop components that
 * belong in the catalog once they render from props alone; selecting one
 * shows how to bring it in.
 */
import { catalog, Kbd } from "@nod/ui";
import { useEffect, useMemo, useState } from "react";
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

const RETROFIT_QUEUE = ["ci-pill", "highlight", "ticket-title", "tooltip"];

const THEME_LABELS = { day: "Daylight", quiet: "Quiet" } as const;
const MODE_LABELS = { matrix: "Matrix", specimen: "Specimen" } as const;

const componentNames = Object.keys(catalog);
const cataloguedNames = new Set(componentNames);
const allNames = [...componentNames, ...RETROFIT_QUEUE];

const fixturesOf = (component: string): readonly string[] =>
  Object.keys(catalog[component]?.fixtures ?? {});

function widthLabel(width: number): string {
  return width === 0 ? "Fluid" : String(width);
}

function Frame({ route, small }: { route: GalleryRoute; small?: boolean }) {
  const entry = catalog[route.component];
  if (!entry) {
    return null;
  }
  const fixture = entry.fixtures[route.fixture];
  const Specimen = entry.component;
  return (
    <div className="qg-frame-wrap">
      <div className={`qg-frame qg-stage-${route.theme}`} data-frame>
        <i className="qg-tick qg-tl" />
        <i className="qg-tick qg-tr" />
        <i className="qg-tick qg-bl" />
        <i className="qg-tick qg-br" />
        <div
          className="qg-viewport"
          style={route.width ? { width: route.width } : { flex: 1 }}
        >
          <Specimen {...fixture.props} />
        </div>
      </div>
      <div className="qg-meta">
        <span>{captureName(route)}</span>
        {fixture.provenance && !small ? (
          <span className="qg-prov">{fixture.provenance}</span>
        ) : null}
      </div>
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
  if (!catalog[route.component]) {
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

export function Gallery() {
  const [route, setRoute] = useState<GalleryRoute>(() =>
    parseGalleryHash(window.location.hash, allNames, fixturesOf)
  );
  const [filter, setFilter] = useState("");

  const entry = catalog[route.component];
  const fixtureNames = fixturesOf(route.component);

  useEffect(() => {
    history.replaceState(null, "", formatGalleryHash(route));
  }, [route]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.target instanceof HTMLInputElement) {
        return;
      }
      const move = (patch: Partial<GalleryRoute>) =>
        setRoute((r) => normalize({ ...r, ...patch }));
      const routeFixtures = fixturesOf(route.component);
      switch (event.key) {
        case "j":
          move({ component: cycle(allNames, route.component, 1) });
          break;
        case "k":
          move({ component: cycle(allNames, route.component, -1) });
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

  const visibleNames = useMemo(
    () => allNames.filter((name) => name.includes(filter.trim().toLowerCase())),
    [filter]
  );

  const select = (component: string) => {
    setRoute((r) => normalize({ ...r, component }));
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
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Find a component  /"
            type="text"
            value={filter}
          />
        </div>
        <nav aria-label="Components" className="qg-rail-list">
          {visibleNames.map((name) => {
            const catalogued = cataloguedNames.has(name);
            return (
              <button
                className={[
                  "qg-rail-item",
                  catalogued ? "" : "qg-bare",
                  name === route.component ? "qg-sel" : "",
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
          <span>j/k component</span>
          <span>f fixture</span>
          <span>t theme</span>
          <span>w width</span>
          <span>m view</span>
          <span>/ find</span>
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
