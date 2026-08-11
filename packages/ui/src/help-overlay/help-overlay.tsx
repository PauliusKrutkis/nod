/**
 * Help overlay (?) — the shortcut cheatsheet. It renders the bindings it is
 * handed and never reaches for a keyboard registry: the host flattens its live
 * registry into `sections`, which keeps this a props-pure view and lets the
 * gallery mount the sheet from a fixture. The shape is deliberately the
 * smallest thing that can be drawn (a scope name, an optional note, and
 * combo/description pairs), so a host with richer binding types satisfies it
 * structurally without converting anything.
 *
 * Layout is two columns: every inactive scope on the left, the scope you are
 * currently in on the right wearing the iris tint, so the keys that apply
 * right now read as one block instead of being hunted for in a list.
 *
 * `inline` opens with show() instead of showModal() (see useModalDialog) — no
 * top layer, no tab trap — and `.qh-inline` puts the panel back in normal flow
 * so an embedding host can size and capture it like any other specimen.
 */
import { Command, X } from "lucide-react";
import { cn } from "../cn/cn.ts";
import { Kbd } from "../kbd/kbd.tsx";
import { useModalDialog } from "../use-modal-dialog/use-modal-dialog.ts";
import "./help-overlay.css";

export interface HelpBinding {
  combo: string;
  description: string;
}

export interface HelpSection {
  active?: boolean;
  bindings: readonly HelpBinding[];
  note?: string;
  scope: string;
}

export function HelpOverlay({
  open,
  onOpenChange,
  sections,
  inline = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sections: readonly HelpSection[];
  inline?: boolean;
}) {
  if (!open) {
    return null;
  }
  return (
    <HelpOverlayContent
      inline={inline}
      onOpenChange={onOpenChange}
      sections={sections}
    />
  );
}

function HelpOverlayContent({
  onOpenChange,
  sections,
  inline,
}: {
  onOpenChange: (v: boolean) => void;
  sections: readonly HelpSection[];
  inline?: boolean;
}) {
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    () => {
      onOpenChange(false);
    },
    undefined,
    { modal: !inline }
  );

  const close = () => {
    onOpenChange(false);
  };

  const columns = [
    sections.filter((s) => !s.active),
    sections.filter((s) => s.active),
  ];

  return (
    <dialog
      aria-label="Keyboard shortcuts"
      className={cn("q-dialog qh-panel", inline && "qh-inline")}
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <header className="qh-head">
        <div className="qh-head-title">
          <Command aria-hidden size={15} />
          <span className="qh-title">Keyboard</span>
          <span className="qh-head-note">
            Scope-aware. Only the screen you're on responds
          </span>
        </div>
        <button
          aria-label="Close"
          className="qh-close q-focus"
          onClick={close}
          type="button"
        >
          <X aria-hidden size={16} />
        </button>
      </header>

      <div className="qh-grid">
        {columns.map((column, index) => (
          <div className="qh-col" key={index === 0 ? "inactive" : "active"}>
            {column.map((section) => (
              <ScopeCard key={section.scope} section={section} />
            ))}
          </div>
        ))}
      </div>

      <footer className="qh-foot">
        Generated from the live bindings, so the legend, the palette, and this
        sheet can never drift.
      </footer>
    </dialog>
  );
}

function ScopeCard({ section }: { section: HelpSection }) {
  return (
    <section className={cn("qh-scope", section.active && "qh-scope-active")}>
      <div className="qh-scope-head">
        <span className="qh-scope-name">{section.scope}</span>
        {section.active ? <span className="qh-scope-tag">active</span> : null}
        {section.note ? (
          <span className="qh-scope-note">{section.note}</span>
        ) : null}
      </div>
      <dl className="qh-rows">
        {section.bindings.map((binding) => (
          <div
            className="qh-row"
            key={`${binding.combo}-${binding.description}`}
          >
            <dt className="qh-keys">
              <Kbd combo={binding.combo} />
            </dt>
            <dd className="qh-label">{binding.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
