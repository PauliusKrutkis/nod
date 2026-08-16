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

import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "../cn/cn.ts";
import { Tooltip } from "../tooltip/tooltip.tsx";
import { useLatest } from "../use-latest/use-latest.ts";
import "../pr-drawer/pr-drawer.css";
import "./right-dock.css";

export interface RightDockTab {
  id: string;
  label: string;
}

export interface RightDockProps {
  activeTab: string;
  children: ReactNode;
  embedded?: boolean;
  onClose: () => void;
  onFocusExit?: () => void;
  onSelectTab: (id: string) => void;
  onToggleWide: () => void;
  open: boolean;
  overlay: boolean;
  tabs: RightDockTab[];
  wide: boolean;
}

export function RightDock({
  activeTab,
  children,
  embedded = false,
  onClose,
  onFocusExit,
  onSelectTab,
  onToggleWide,
  open,
  overlay,
  tabs,
  wide,
}: RightDockProps) {
  const panelRef = useRef<HTMLElement>(null);
  const onFocusExitRef = useLatest(onFocusExit);

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
          wide && "qf-drawer-wide",
          !(overlay || embedded) && "qf-dock-col",
          embedded && "qf-drawer-embedded"
        )}
        inert={!open}
        ref={panelRef}
        tabIndex={-1}
      >
        <div className="qf-drawer-head">
          {tabs.length > 1 ? (
            <div className="qf-dock-tabs">
              {tabs.map((tab) => (
                <button
                  aria-pressed={tab.id === activeTab}
                  className="qf-dock-tab q-focus"
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="qf-drawer-title">{tabs[0]?.label}</span>
          )}
          <div className="qf-drawer-head-actions">
            <Tooltip
              combo="shift+i"
              label={`${wide ? "Narrow" : "Widen"} panel`}
            >
              <button
                aria-label={wide ? "Narrow panel" : "Widen panel"}
                aria-pressed={wide}
                className="qf-drawer-wide-btn q-focus"
                onClick={onToggleWide}
                type="button"
              >
                {wide ? (
                  <PanelRightClose aria-hidden size={15} />
                ) : (
                  <PanelRightOpen aria-hidden size={15} />
                )}
              </button>
            </Tooltip>
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
