/**
 * One diff line: the old/new line-number gutters, the +/−/space marker, and
 * the code cell. `html` arrives already highlighted (hljs token spans plus any
 * intraline / find / occurrence <mark> layers the host wrapped in) — the row
 * never highlights anything itself, which is what lets a cursor move flip two
 * rows' state classes without rebuilding the other rendered rows' code.
 *
 * The class names and data attributes are contract, not decoration: the host's
 * occurrence tracking, flash-on-jump, column math and end-to-end specs all
 * query `.qf-row`, `.qf-code`, `.qf-gutter`, `.qf-row-hunk` and the
 * `data-anchor` / `data-file-index` pair.
 *
 * `anchor === null` is a line no comment can attach to — a synthetic full-file
 * context line, or one outside the patch the forge would reject: no hover
 * report, no "+" affordance. `indent` is the file's indent unit as a CSS
 * length, read by the code cell's guide layer; it is a length rather than `ch`
 * because the guides are painted, not typeset (see code-cell.css).
 *
 * Rest is the only state the row owns. Cursor, hover and the "+" reveal are
 * decisions of the diff surface around it (input mode, drag, active file), so
 * that choreography stays with the host and arrives here as flags.
 *
 * The "+" drag keeps pointer capture on the pressed button, so the row being
 * dragged over is resolved by hit-testing for the nearest `[data-anchor]` —
 * the rows underneath never see the pointer.
 */

import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import { cn } from "../cn/cn.ts";
import { CodeCell } from "../code-cell/code-cell.tsx";
import "./diff-row.css";

export type DiffRowKind = "add" | "context" | "del";

const MARKER: Record<DiffRowKind, string> = {
  add: "+",
  context: " ",
  del: "-",
};

export interface DiffRowProps {
  active?: boolean;
  anchor?: string | null;
  canComment?: boolean;
  dimmed?: boolean;
  fileIndex: number;
  flash?: boolean;
  guideLvl?: number | null;
  html: string;
  indent?: string;
  kind: DiffRowKind;
  newLine?: number | null;
  oldLine?: number | null;
  onEnter?: (fileIndex: number, anchor: string, x: number, y: number) => void;
  onOpenBox?: (fileIndex: number, anchor: string) => void;
  onPlusDragEnd?: () => void;
  onPlusDragOver?: (fileIndex: number, anchor: string) => void;
  onPlusDragStart?: (fileIndex: number, anchor: string) => void;
  selected?: boolean;
  selectionEnd?: boolean;
  synthetic?: boolean;
  threaded?: boolean;
}

export function DiffRow({
  active = false,
  anchor = null,
  canComment = false,
  dimmed = false,
  fileIndex,
  flash = false,
  guideLvl = null,
  html,
  indent,
  kind,
  newLine = null,
  oldLine = null,
  onEnter,
  onOpenBox,
  onPlusDragEnd,
  onPlusDragOver,
  onPlusDragStart,
  selected = false,
  selectionEnd = false,
  synthetic = false,
  threaded = false,
}: DiffRowProps) {
  const handleMouseEnter = (e: MouseEvent<HTMLDivElement>) => {
    if (anchor !== null) {
      onEnter?.(fileIndex, anchor, e.clientX, e.clientY);
    }
  };

  const handleAddClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0 && anchor !== null) {
      onOpenBox?.(fileIndex, anchor);
    }
  };

  const handleAddPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (anchor === null) {
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    onPlusDragStart?.(fileIndex, anchor);
  };

  const handleAddPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.buttons === 0) {
      return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const rowEl = el?.closest?.("[data-anchor]");
    const a = rowEl?.getAttribute("data-anchor");
    const f = rowEl?.getAttribute("data-file-index");
    if (a && f !== null) {
      onPlusDragOver?.(Number(f), a);
    }
  };

  const rowHoverProps =
    anchor === null ? {} : { onMouseEnter: handleMouseEnter };

  return (
    <div
      className={cn(
        "qf-row",
        kind === "add" && "qf-row-add",
        kind === "del" && "qf-row-del",
        synthetic && "qf-row-xctx",
        active && "qf-row-active",
        selected && "qf-row-selected",
        selectionEnd && "qf-row-sel-end",
        flash && "qf-row-flash",
        threaded && "qf-row-threaded",
        dimmed && "qf-row-dimmed"
      )}
      data-anchor={anchor ?? undefined}
      data-file-index={fileIndex}
      style={
        indent === undefined
          ? undefined
          : ({ "--qf-indent": indent } as CSSProperties)
      }
      {...rowHoverProps}
    >
      <span className="qf-gutter qf-gutter-old">
        {oldLine ?? ""}
        {canComment && anchor !== null && (
          <button
            aria-label="Add comment"
            className="qf-add-btn"
            onClick={handleAddClick}
            onPointerCancel={onPlusDragEnd}
            onPointerDown={handleAddPointerDown}
            onPointerMove={handleAddPointerMove}
            onPointerUp={onPlusDragEnd}
            type="button"
          >
            +
          </button>
        )}
      </span>
      <span className="qf-gutter qf-gutter-new">{newLine ?? ""}</span>
      <span className="qf-marker">{MARKER[kind]}</span>
      <CodeCell guideLvl={guideLvl} html={html} />
    </div>
  );
}
