/**
 * Release history — every shipped version with its notes, newest first, on a
 * timeline spine. The running version wears the green "you are here" dot,
 * which the host identifies by passing `currentTag`: version comparison is
 * the app's business (it knows how its tags are shaped), rendering the dot is
 * this view's.
 *
 * `releases` carries the three states of a fetch in one prop — `undefined`
 * while loading, `null` when the fetch failed with nothing cached, an array
 * (possibly empty) once it resolved — so a fixture can pin each one without
 * the component knowing a query exists.
 *
 * Notes are markdown in production, but a markdown renderer drags in the
 * host's link handling and sanitiser, so it stays a `renderNotes` slot; with
 * none supplied the raw text renders, wrapped and pre-wrapped, which is also
 * what makes these captures deterministic.
 *
 * `closeArmed` is the Tab-armed dialog pattern: DOM focus stays on the panel
 * and the host's ring decides which control Enter would fire, so the button
 * shows an armed tint without ever holding focus (hence tabIndex -1).
 *
 * `inline` opens with show() instead of showModal() (see useModalDialog) and
 * `.qrh-inline` returns the panel to normal flow for embedding hosts.
 */
import { History, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn/cn.ts";
import { Spinner } from "../spinner/spinner.tsx";
import { useModalDialog } from "../use-modal-dialog/use-modal-dialog.ts";
import "./release-history.css";

export interface Release {
  notes: string | null;
  publishedAt: string | null;
  tag: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ReleaseHistory({
  open,
  onOpenChange,
  releases,
  currentTag = null,
  closeArmed = false,
  renderNotes,
  inline = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  releases: readonly Release[] | null | undefined;
  currentTag?: string | null;
  closeArmed?: boolean;
  renderNotes?: (notes: string) => ReactNode;
  inline?: boolean;
}) {
  if (!open) {
    return null;
  }
  return (
    <ReleaseHistoryContent
      closeArmed={closeArmed}
      currentTag={currentTag}
      inline={inline}
      onOpenChange={onOpenChange}
      releases={releases}
      renderNotes={renderNotes}
    />
  );
}

function ReleaseHistoryContent({
  onOpenChange,
  releases,
  currentTag,
  closeArmed,
  renderNotes,
  inline,
}: {
  onOpenChange: (v: boolean) => void;
  releases: readonly Release[] | null | undefined;
  currentTag: string | null;
  closeArmed: boolean;
  renderNotes?: (notes: string) => ReactNode;
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

  return (
    <dialog
      aria-label="Release history"
      className={cn("q-dialog q-dialog-top qrh-panel", inline && "qrh-inline")}
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <header className="qrh-head">
        <h2 className="qrh-title">
          <History aria-hidden size={14} />
          Release history
        </h2>
        <button
          aria-label="Close"
          className="qrh-close"
          data-armed={closeArmed}
          onClick={close}
          tabIndex={-1}
          type="button"
        >
          <X aria-hidden size={16} />
        </button>
      </header>

      <div className="qrh-list">
        {releases === undefined && (
          <div className="qrh-note">
            <Spinner label="Loading releases…" />
          </div>
        )}
        {releases === null && (
          <p className="qrh-note">
            Couldn't load releases. Check your connection and reopen this view.
          </p>
        )}
        {releases?.length === 0 && (
          <p className="qrh-note">Nothing has shipped yet.</p>
        )}
        {releases?.map((r) => (
          <ReleaseItem
            current={r.tag === currentTag}
            key={r.tag}
            release={r}
            renderNotes={renderNotes}
          />
        ))}
      </div>
    </dialog>
  );
}

function ReleaseItem({
  release,
  current,
  renderNotes,
}: {
  release: Release;
  current: boolean;
  renderNotes?: (notes: string) => ReactNode;
}) {
  return (
    <article className={cn("qrh-item", current && "qrh-item-on")}>
      <span aria-hidden className="qrh-dot" />
      <div className="qrh-item-head">
        <h3 className="q-mono qrh-tag">{release.tag}</h3>
        {current && <span className="qrh-now">current</span>}
        {release.publishedAt ? (
          <time className="qrh-date" dateTime={release.publishedAt}>
            {formatDate(release.publishedAt)}
          </time>
        ) : null}
      </div>
      {release.notes ? (
        <div className="qrh-notes">
          {renderNotes ? (
            renderNotes(release.notes)
          ) : (
            <p className="qrh-notes-plain">{release.notes}</p>
          )}
        </div>
      ) : (
        <p className="qrh-notes-none">No notes for this release.</p>
      )}
    </article>
  );
}
