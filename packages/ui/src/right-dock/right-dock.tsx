/**
 * The review screen's right-side panel shell: the chrome that used to belong
 * to the pr-drawer (head, widen/close, scrim, focus traffic) pulled out so
 * more than one surface can live behind it. Tabs name the surfaces; the
 * active one renders as children, and a single tab renders as the familiar
 * static title instead of a strip — the dock with only "Pull request" in it
 * is visually the old drawer head.
 *
 * Two seatings, switched by `overlay`. Docked (wide viewports) sits in the
 * screen's flex row as a static column so the diff stays clickable while the
 * panel is open — the file sidebar's dual mode mirrored to the right edge.
 * Overlay (narrow viewports) keeps the original treatment: absolute, slid in
 * over the diff, with a scrim. Both seatings keep the `.qf-drawer` classes
 * because the desktop's end-to-end specs drive the panel by them, and both
 * toggle instantly — the column is layout, not theater, and animating it
 * would force the virtualizer through every intermediate width. Closed, the
 * panel is translated offscreen but stays mounted and inert, so tab content
 * (drafts, transcripts) survives a toggle.
 *
 * Opening moves focus onto the panel so Esc lands here; closing blurs
 * anything left inside and asks the host, via `onFocusExit`, to seat focus
 * back on its own surface. `embedded` renders the panel in normal flow
 * without the scrim or focus traffic, for hosts with no positioned frame
 * (the gallery).
 */

import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "../cn/cn.ts";
import { Tooltip } from "../tooltip/tooltip.tsx";
import { useEdgeResize } from "../use-edge-resize/use-edge-resize.ts";
import { useLatest } from "../use-latest/use-latest.ts";
import "../pr-drawer/pr-drawer.css";
import "./right-dock.css";

export interface RightDockTab {
  id: string;
  /** A state dot before the label (the CI vocabulary: red failing, muted
   *  running, green passing), for a tab whose content carries a verdict the
   *  reviewer should see without opening it. */
  indicator?: "failure" | "pending" | "success";
  /** The key that reaches this tab, shown in the tab's tooltip — present
   *  but not printed, the same discoverability contract every other
   *  keyboard-first control in the app keeps. */
  kbd?: string;
  label: string;
}

const INDICATOR_LABEL: Record<
  NonNullable<RightDockTab["indicator"]>,
  string
> = {
  failure: "failing",
  pending: "running",
  success: "passing",
};

export interface RightDockProps {
  activeTab: string;
  children: ReactNode;
  embedded?: boolean;
  onClose: () => void;
  onFocusExit?: () => void;
  onResize?: (width: number) => void;
  onSelectTab: (id: string) => void;
  open: boolean;
  overlay: boolean;
  tabs: RightDockTab[];
  width?: number | null;
}

const MIN_DOCK_WIDTH = 320;
const MAX_DOCK_FRACTION = 0.72;

export function RightDock({
  activeTab,
  children,
  embedded = false,
  onClose,
  onFocusExit,
  onResize,
  onSelectTab,
  open,
  overlay,
  tabs,
  width = null,
}: RightDockProps) {
  const panelRef = useRef<HTMLElement>(null);
  const onFocusExitRef = useLatest(onFocusExit);

  const startResize = useEdgeResize({
    edge: "left",
    maxFraction: MAX_DOCK_FRACTION,
    min: MIN_DOCK_WIDTH,
    onResize,
    panelRef,
  });

  useEffect(() => {
    const el = panelRef.current;
    if (embedded || !el) {
      return;
    }
    if (open) {
      el.focus({ preventScroll: true });
    } else if (el.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
      onFocusExitRef.current?.();
    }
  }, [open, embedded, onFocusExitRef]);

  return (
    <>
      {!embedded && overlay && (
        <button
          aria-label="Close panel"
          className={cn("qf-drawer-scrim", open && "qf-drawer-open")}
          onClick={onClose}
          type="button"
        />
      )}
      <aside
        aria-hidden={!open}
        className={cn(
          "qf-drawer",
          open && "qf-drawer-open",
          !(overlay || embedded) && "qf-dock-col",
          embedded && "qf-drawer-embedded"
        )}
        inert={!open}
        ref={panelRef}
        style={
          !(overlay || embedded) && open && width !== null
            ? { width }
            : undefined
        }
        tabIndex={-1}
      >
        {!(overlay || embedded) && onResize && (
          <div
            aria-hidden
            className="qf-dock-resize"
            onPointerDown={startResize}
          />
        )}
        <div
          className={cn(
            "qf-drawer-head",
            tabs.length > 1 && "qf-dock-head-tabs"
          )}
        >
          {tabs.length > 1 ? (
            <div className="qf-dock-tabs">
              {tabs.map((tab) => (
                <Tooltip combo={tab.kbd} key={tab.id} label={tab.label}>
                  <button
                    aria-label={
                      tab.indicator
                        ? `${tab.label} · ${INDICATOR_LABEL[tab.indicator]}`
                        : undefined
                    }
                    aria-pressed={tab.id === activeTab}
                    className="qf-dock-tab q-focus"
                    onClick={() => onSelectTab(tab.id)}
                    type="button"
                  >
                    {tab.indicator && (
                      <span
                        aria-hidden
                        className={cn(
                          "qf-dock-tab-dot",
                          `qf-dock-tab-dot-${tab.indicator}`
                        )}
                      />
                    )}
                    {tab.label}
                  </button>
                </Tooltip>
              ))}
            </div>
          ) : (
            <span className="qf-drawer-title">{tabs[0]?.label}</span>
          )}
          <div className="qf-drawer-head-actions">
            <Tooltip combo="esc" label="Close">
              <button
                aria-label="Close"
                className="qf-drawer-close q-focus"
                onClick={onClose}
                type="button"
              >
                Esc
              </button>
            </Tooltip>
          </div>
        </div>
        <div className="qf-dock-panel">{children}</div>
      </aside>
    </>
  );
}
