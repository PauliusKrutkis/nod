/**
 * The chat's message field: text and attached code in one editable line of
 * thought, in the order you put them there. Chips used to sit in a row above
 * the input, which lost the one thing that matters when you attach two
 * snippets — which sentence goes with which snippet. Here a chip is an
 * inline token between the words either side of it, and the message the
 * model receives is that same sequence.
 *
 * Uncontrolled by design. A contenteditable's DOM is the draft; mirroring it
 * into React state on every keystroke buys nothing and fights the caret. The
 * host talks to it through a handle instead — insert a region, read the
 * parts, clear, focus — and the panel stays a pure function of its props
 * everywhere else.
 *
 * Chips are `contenteditable=false` spans carrying their payload in a data
 * attribute, so Backspace deletes one whole and serialization is a walk over
 * child nodes. The payload is JSON in the DOM and never HTML: the code
 * inside it reaches the page only as a text node.
 */

import {
  type ClipboardEvent,
  type KeyboardEvent,
  type Ref,
  useImperativeHandle,
  useRef,
} from "react";
import type { ChatRegionChip } from "../chat-panel/chat-panel.tsx";
import "./chat-composer.css";

export type ChatPart =
  | { kind: "text"; text: string }
  | { kind: "code"; region: ChatRegionChip };

export interface ChatComposerHandle {
  clear: () => void;
  focus: () => void;
  insertRegion: (region: ChatRegionChip) => void;
  isEmpty: () => boolean;
  parts: () => ChatPart[];
}

export interface ChatComposerProps {
  onChange?: (text: string) => void;
  onEscape?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => boolean;
  onRevealRegion?: (region: ChatRegionChip) => void;
  onSend: () => void;
  placeholder: string;
  ref?: Ref<ChatComposerHandle>;
}

const CHIP_ATTR = "data-region";
const TRAILING_NEWLINES = /\n+$/;

export function regionLabel(region: ChatRegionChip): string {
  if (!region.filePath) {
    const lines = region.code.split("\n").length;
    return `pasted code (${lines} ${lines === 1 ? "line" : "lines"})`;
  }
  return region.lineRange
    ? `${region.filePath}:${region.lineRange}`
    : region.filePath;
}

const MAX_CHIP_CHARS = 30;

/** A chip label that fits without clipping. Paths lose their middle, never
 *  their tail: `review-items.ts:88–140` is what identifies the region, and
 *  an end-truncated path drops exactly that. */
export function shortenChipLabel(label: string): string {
  if (label.length <= MAX_CHIP_CHARS) {
    return label;
  }
  const tail = label.slice(-(MAX_CHIP_CHARS - 5));
  const head = label.slice(0, 4);
  return `${head}…${tail}`;
}

function chipElement(region: ChatRegionChip): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "qcc-chip";
  chip.contentEditable = "false";
  chip.setAttribute(CHIP_ATTR, JSON.stringify(region));
  const label = document.createElement("span");
  label.className = "qcc-chip-label";
  label.textContent = shortenChipLabel(regionLabel(region));
  const remove = document.createElement("span");
  remove.className = "qcc-chip-x";
  remove.setAttribute("data-chip-remove", "");
  remove.setAttribute("role", "button");
  remove.setAttribute("aria-label", `Remove ${regionLabel(region)}`);
  remove.textContent = "×";
  chip.append(label, remove);
  return chip;
}

function regionKey(region: ChatRegionChip): string {
  return `${region.filePath}:${region.lineRange}:${region.side}`;
}

function hasRegion(root: HTMLElement, region: ChatRegionChip): boolean {
  const key = regionKey(region);
  return [...root.querySelectorAll(`[${CHIP_ATTR}]`)].some((chip) => {
    const existing = readRegion(chip);
    return existing !== null && regionKey(existing) === key;
  });
}

function readRegion(el: Element): ChatRegionChip | null {
  try {
    return JSON.parse(el.getAttribute(CHIP_ATTR) ?? "") as ChatRegionChip;
  } catch {
    return null;
  }
}

/** The field's contents as ordered parts. Adjacent text is merged so a part
 *  is a run of prose, not a node-by-node transcript of how it was typed. */
function serialize(root: HTMLElement): ChatPart[] {
  const parts: ChatPart[] = [];
  const pushText = (text: string) => {
    if (!text) {
      return;
    }
    const last = parts.at(-1);
    if (last?.kind === "text") {
      last.text += text;
    } else {
      parts.push({ kind: "text", text });
    }
  };
  /** Whether the node's own children still need visiting. */
  const visit = (child: Node): boolean => {
    if (child.nodeType === Node.TEXT_NODE) {
      pushText(child.textContent ?? "");
      return false;
    }
    if (
      !(child instanceof HTMLElement) ||
      child.hasAttribute("data-chip-remove")
    ) {
      return false;
    }
    if (child.hasAttribute(CHIP_ATTR)) {
      const region = readRegion(child);
      if (region) {
        parts.push({ kind: "code", region });
      }
      return false;
    }
    if (child.tagName === "BR") {
      pushText("\n");
      return false;
    }
    if (child.tagName === "DIV" || child.tagName === "P") {
      pushText("\n");
    }
    return true;
  };
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (visit(child)) {
        walk(child);
      }
    }
  };
  walk(root);
  return parts
    .map((p) => (p.kind === "text" ? { ...p, text: p.text } : p))
    .filter(
      (p) => p.kind !== "text" || p.text.trim() !== "" || parts.length > 1
    );
}

/** What a Backspace at the caret would remove: the chip, and the space we
 *  put after it when it was inserted. That space is ours, not something the
 *  reviewer typed, so it goes with the chip instead of eating a press. */
interface ChipHit {
  chip: HTMLElement;
  spacer: Node | null;
}

function asChip(node: Node | null): HTMLElement | null {
  return node instanceof HTMLElement && node.hasAttribute(CHIP_ATTR)
    ? node
    : null;
}

/** The caret sits inside a text node, `offset` characters in. */
function chipBeforeText(node: Node, offset: number): ChipHit | null {
  const typed = (node.textContent ?? "").slice(0, offset);
  if (typed !== "" && typed !== " ") {
    return null;
  }
  const chip = asChip(node.previousSibling);
  return chip ? { chip, spacer: typed === "" ? null : node } : null;
}

/** The caret sits between child nodes, just after `before`. */
function chipBeforeChild(before: Node | null): ChipHit | null {
  if (before?.nodeType === Node.TEXT_NODE && before.textContent === " ") {
    const chip = asChip(before.previousSibling);
    return chip ? { chip, spacer: before } : null;
  }
  const chip = asChip(before);
  return chip ? { chip, spacer: null } : null;
}

/** Drops the single space Backspace is standing on — the character, not the
 *  node, so anything typed after the chip survives. */
function removeSpacer(spacer: Node | null) {
  if (!spacer) {
    return;
  }
  const text = spacer.textContent ?? "";
  if (text.length <= 1) {
    spacer.parentNode?.removeChild(spacer);
    return;
  }
  spacer.textContent = text.slice(1);
}

function insertAtCaret(root: HTMLElement, node: Node) {
  const selection = document.getSelection();
  const inField =
    selection &&
    selection.rangeCount > 0 &&
    root.contains(selection.getRangeAt(0).commonAncestorContainer);
  const range = inField ? selection.getRangeAt(0) : document.createRange();
  if (!inField) {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function ChatComposer({
  onChange,
  onEscape,
  onKeyDown,
  onRevealRegion,
  onSend,
  placeholder,
  ref,
}: ChatComposerProps) {
  const fieldRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    clear: () => {
      const el = fieldRef.current;
      if (el) {
        el.textContent = "";
      }
      onChange?.("");
    },
    focus: () => fieldRef.current?.focus(),
    insertRegion: (region) => {
      const el = fieldRef.current;
      if (!el) {
        return;
      }
      el.focus();
      // The field holds the chips, so it is also what answers "do I already
      // have this?" — pressing `l` twice on one selection is a no-op, not a
      // second copy of the same lines. Pasted code has no identity to
      // compare, so it always inserts.
      if (region.filePath && hasRegion(el, region)) {
        return;
      }
      insertAtCaret(el, chipElement(region));
      insertAtCaret(el, document.createTextNode(" "));
      onChange?.(el.textContent ?? "");
    },
    isEmpty: () => (fieldRef.current?.textContent ?? "").trim() === "",
    parts: () => (fieldRef.current ? serialize(fieldRef.current) : []),
  }));

  /** The chip a collapsed caret is sitting immediately after, if any. A
   *  contenteditable=false node is atomic to the browser, but only some
   *  browsers delete it on the first Backspace — doing it here makes the key
   *  behave the same everywhere. */
  const chipBeforeCaret = (): ChipHit | null => {
    const selection = document.getSelection();
    if (!selection?.isCollapsed || selection.rangeCount === 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    return node.nodeType === Node.TEXT_NODE
      ? chipBeforeText(node, range.startOffset)
      : chipBeforeChild(node.childNodes[range.startOffset - 1] ?? null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (onKeyDown?.(e)) {
      return;
    }
    if (e.key === "Backspace") {
      const found = chipBeforeCaret();
      if (found) {
        e.preventDefault();
        removeSpacer(found.spacer);
        found.chip.remove();
        onChange?.(fieldRef.current?.textContent ?? "");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onEscape?.();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text) {
      return;
    }
    e.preventDefault();
    const el = fieldRef.current;
    if (!el) {
      return;
    }
    if (text.includes("\n") && text.trim()) {
      insertAtCaret(
        el,
        chipElement({
          code: text.replace(TRAILING_NEWLINES, ""),
          filePath: "",
          lineRange: "",
          side: "",
        })
      );
      insertAtCaret(el, document.createTextNode(" "));
    } else {
      insertAtCaret(el, document.createTextNode(text));
    }
    onChange?.(el.textContent ?? "");
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const chip = target.closest(`[${CHIP_ATTR}]`);
    if (!(chip instanceof HTMLElement)) {
      return;
    }
    if (target.closest("[data-chip-remove]")) {
      e.preventDefault();
      chip.remove();
      onChange?.(fieldRef.current?.textContent ?? "");
      fieldRef.current?.focus();
      return;
    }
    const region = readRegion(chip);
    if (region?.filePath) {
      onRevealRegion?.(region);
    }
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a textarea cannot hold the inline chips this field is for — contenteditable is the mechanism, role/aria-multiline give it the same semantics
    <div
      aria-label="Message"
      aria-multiline="true"
      autoCapitalize="off"
      autoCorrect="off"
      className="qcc-field"
      contentEditable
      data-placeholder={placeholder}
      onClick={handleClick}
      onInput={(e) => onChange?.(e.currentTarget.textContent ?? "")}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      ref={fieldRef}
      role="textbox"
      spellCheck={false}
      suppressContentEditableWarning
      tabIndex={0}
    />
  );
}
