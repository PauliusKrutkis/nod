/**
 * The band that opens one file's section of the diff: status glyph, path,
 * churn, and the two controls the keyboard also drives (shift+v expand, v
 * viewed). The host's virtualized list pins it as a sticky group header — the
 * stickiness is the list's, the band is this component's.
 *
 * The path is a button because it doubles as the copy target (the mouse mirror
 * of mod+shift+c); `copied` is the host's acknowledgement, and it is announced
 * as well as shown. The directory is dimmed and the basename bold so a screen
 * of monorepo paths scans by the part that differs, and the whole thing
 * ellipsizes from the right rather than pushing the controls off the band.
 *
 * `status` is a plain string, not a union — see file-status-glyph — and it is
 * read twice: once for the glyph, once for whether the previous path is worth
 * showing, which only a rename has.
 *
 * `expandable` is the host's decision — whether a full file can be fetched at
 * all depends on the patch and the file's state, which is not visual. The
 * expand control is absent rather than disabled when it cannot apply: a
 * control that is never usable on this file is noise, not information.
 * `viewable` follows the same convention for the viewed control — a host
 * with no viewed state (the ledger session) omits the button entirely.
 *
 * `leadRef` marks the strip immediately above the band. The host measures the
 * hand-off between one sticky header and the next against it; nothing here
 * reads it.
 */

import { Check, FoldVertical, UnfoldVertical } from "lucide-react";
import type { Ref } from "react";
import { cn } from "../cn/cn.ts";
import { FileStatusGlyph } from "../file-status-glyph/file-status-glyph.tsx";
import { Tooltip } from "../tooltip/tooltip.tsx";
import "./file-section-header.css";

export interface FileSectionHeaderProps {
  active?: boolean;
  additions: number;
  copied?: boolean;
  deletions: number;
  expandable?: boolean;
  expanded?: boolean;
  expanding?: boolean;
  fileIndex: number;
  filename: string;
  hiddenResolved?: number;
  leadRef?: Ref<HTMLSpanElement>;
  onCopyPath?: () => void;
  onToggleExpand?: () => void;
  onToggleViewed?: () => void;
  previousFilename?: string | null;
  status: string;
  updated?: boolean;
  viewable?: boolean;
  viewed?: boolean;
}

export function FileSectionHeader({
  active = false,
  additions,
  copied = false,
  deletions,
  expandable = false,
  expanded = false,
  expanding = false,
  fileIndex,
  filename,
  hiddenResolved = 0,
  leadRef,
  onCopyPath,
  onToggleExpand,
  onToggleViewed,
  previousFilename = null,
  status,
  updated = false,
  viewable = true,
  viewed = false,
}: FileSectionHeaderProps) {
  const slash = filename.lastIndexOf("/");
  const dir = slash === -1 ? "" : filename.slice(0, slash + 1);
  const basename = slash === -1 ? filename : filename.slice(slash + 1);

  return (
    <header
      className={cn("qf-fsec-head", active && "qf-fsec-active")}
      data-file-index={fileIndex}
    >
      <span aria-hidden className="qf-fsec-lead" ref={leadRef} />
      <FileStatusGlyph status={status} />
      <Tooltip
        anchorClassName="qf-fsec-name-anchor"
        label={copied ? "Copied" : `${filename} · click to copy path`}
      >
        <button
          className="qf-fsec-name qf-fsec-copy"
          onClick={onCopyPath}
          type="button"
        >
          {previousFilename && status === "renamed" && (
            <span className="qf-filebar-prev">{previousFilename} → </span>
          )}
          <span className="qf-file-dir">{dir}</span>
          <span className="qf-fsec-base">{basename}</span>
          {copied && (
            <span aria-live="polite" className="qf-fsec-copied">
              <Check aria-hidden size={11} /> copied
            </span>
          )}
        </button>
      </Tooltip>
      {updated && (
        <span
          className="qf-updated-chip"
          title="Changed since you marked it viewed"
        >
          updated
        </span>
      )}
      {hiddenResolved > 0 && (
        <span
          className="qf-hidden-resolved-chip"
          title="Resolved threads are hidden · shift+z shows them"
        >
          {hiddenResolved} resolved hidden
        </span>
      )}
      <span className="qf-filebar-stat">
        <span className="qf-add">+{additions}</span>
        <span className="qf-del">−{deletions}</span>
      </span>
      {expandable && (
        <Tooltip
          combo="shift+v"
          label={expanded ? "Back to the diff" : "Expand to the full file"}
        >
          <button
            aria-busy={expanding || undefined}
            aria-pressed={expanded}
            className={cn("qf-expand-btn", expanded && "qf-expand-on")}
            onClick={onToggleExpand}
            type="button"
          >
            {expanded ? (
              <FoldVertical aria-hidden size={12} />
            ) : (
              <UnfoldVertical aria-hidden size={12} />
            )}
            <span className="qf-fsec-btn-label">
              {expanded ? "Diff only" : "Full file"}
            </span>
          </button>
        </Tooltip>
      )}
      {viewable && (
        <Tooltip
          combo="v"
          label={viewed ? "Viewed · click to unmark" : "Mark as viewed"}
        >
          <button
            aria-pressed={viewed}
            className={cn("qf-viewed-btn", viewed && "qf-viewed-on")}
            onClick={onToggleViewed}
            type="button"
          >
            <Check aria-hidden size={12} />
            <span className="qf-fsec-btn-label">Viewed</span>
          </button>
        </Tooltip>
      )}
    </header>
  );
}
