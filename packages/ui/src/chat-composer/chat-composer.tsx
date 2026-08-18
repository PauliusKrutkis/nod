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
import { useLatest } from "../use-latest/use-latest.ts";
import "./chat-composer.css";

export type ChatPart =
  | { kind: "text"; text: string }
  | { kind: "code"; region: ChatRegionChip };

export interface ChatComposerHandle {
  clear: () => void;
  focus: () => void;
  insertRegion: (region: ChatRegionChip) => void;
  /** Puts the invoked skill in the field as a chip, replacing the `/query`
   *  that summoned it (`typed` characters back from the caret). Several can
   *  ride one message — a validity pass and a security pass over the same
   *  diff — so this appends unless the same skill is already there. */
  insertSkill: (name: string, typed?: number) => void;
  isEmpty: () => boolean;
  parts: () => ChatPart[];
  skills: () => string[];
}

export interface ChatComposerProps {
  onChange?: (text: string) => void;
  onEscape?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => boolean;
  onRevealRegion?: (region: ChatRegionChip) => void;
  onSend: () => void;
  /** The `/query` the caret is sitting in, or null when it isn't in one.
   *  The field knows where the caret is; the host does not, and inferring it
   *  from the text alone gets it wrong the moment a chip or a trailing space
   *  is involved. */
  onSlashQuery?: (query: string | null) => void;
  /** The skill chips changed. The host mirrors them because skills ride the
   *  request beside the message, not inside it. */
  onSkillChange?: (names: string[]) => void;
  placeholder: string;
  ref?: Ref<ChatComposerHandle>;
}

/** A slash command being typed, ending at the caret. */
const SLASH_AT_CARET = /(?:^|\s)\/(\S*)$/;

const CHIP_ATTR = "data-region";
const SKILL_ATTR = "data-skill";
const ANY_CHIP = `[${CHIP_ATTR}],[${SKILL_ATTR}]`;
const TRAILING_NEWLINES = /\n+$/;

function regionLabel(region: ChatRegionChip): string {
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
function shortenChipLabel(label: string): string {
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

/** A skill reads as a chip too — same token, marked as the instruction it is
 *  rather than the code the others carry. */
function skillElement(name: string): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "qcc-chip qcc-chip-skill";
  chip.contentEditable = "false";
  chip.setAttribute(SKILL_ATTR, name);
  const label = document.createElement("span");
  label.className = "qcc-chip-label";
  label.textContent = `/${name}`;
  const remove = document.createElement("span");
  remove.className = "qcc-chip-x";
  remove.setAttribute("data-chip-remove", "");
  remove.setAttribute("role", "button");
  remove.setAttribute("aria-label", `Remove skill ${name}`);
  remove.textContent = "×";
  chip.append(label, remove);
  return chip;
}

/** The skills currently in the field, in the order they were invoked. */
function chipSkills(root: HTMLElement | null): string[] {
  const names: string[] = [];
  for (const chip of root?.querySelectorAll(`[${SKILL_ATTR}]`) ?? []) {
    const name = chip.getAttribute(SKILL_ATTR) ?? "";
    if (name !== "") {
      names.push(name);
    }
  }
  return names;
}

function isChip(node: Node | null): node is HTMLElement {
  return (
    node instanceof HTMLElement &&
    (node.hasAttribute(CHIP_ATTR) || node.hasAttribute(SKILL_ATTR))
  );
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
    if (child.hasAttribute(SKILL_ATTR)) {
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
  const kept: ChatPart[] = [];
  for (const part of parts) {
    if (part.kind !== "text" || part.text.trim() !== "" || parts.length > 1) {
      kept.push(part);
    }
  }
  return kept;
}

/** What a Backspace at the caret would remove: the chip, and the space we
 *  put after it when it was inserted. That space is ours, not something the
 *  reviewer typed, so it goes with the chip instead of eating a press. */
interface ChipHit {
  chip: HTMLElement;
  spacer: Node | null;
}

function asChip(node: Node | null): HTMLElement | null {
  return isChip(node) ? node : null;
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
/** The chip a collapsed caret is sitting immediately after, if any. A
 *  contenteditable=false node is atomic to the browser, but only some
 *  browsers delete it on the first Backspace — doing it here makes the key
 *  behave the same everywhere. */
function chipBeforeCaret(): ChipHit | null {
  const selection = document.getSelection();
  if (!selection?.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  return node.nodeType === Node.TEXT_NODE
    ? chipBeforeText(node, range.startOffset)
    : chipBeforeChild(node.childNodes[range.startOffset - 1] ?? null);
}

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

/** Rubs out the `n` characters the caret is sitting behind — the `/query`
 *  the reviewer typed, now that the chip says the same thing. */
function deleteBeforeCaret(n: number) {
  if (n <= 0) {
    return;
  }
  const selection = document.getSelection();
  if (!selection?.isCollapsed || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) {
    return;
  }
  const cut = Math.min(n, range.startOffset);
  range.setStart(node, range.startOffset - cut);
  range.deleteContents();
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
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
  // Land the caret INSIDE the trailing text node rather than after it. A
  // caret parked between an atomic chip and the field's edge is a block
  // boundary as far as the browser is concerned, and the first character
  // typed there starts a new line under the chip instead of continuing the
  // sentence beside it.
  if (node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, node.textContent?.length ?? 0);
  } else {
    range.setStartAfter(node);
  }
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
  onSkillChange,
  onSlashQuery,
  placeholder,
  ref,
}: ChatComposerProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const onSkillChangeRef = useLatest(onSkillChange);
  const onSlashQueryRef = useLatest(onSlashQuery);

  /** What the caret is typing, if it is typing a slash command. */
  const slashAtCaret = (): string | null => {
    const selection = document.getSelection();
    const field = fieldRef.current;
    if (!(field && selection?.isCollapsed) || selection.rangeCount === 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !field.contains(node)) {
      return null;
    }
    const before = (node.textContent ?? "").slice(0, range.startOffset);
    return SLASH_AT_CARET.exec(before)?.[1] ?? null;
  };

  const reportSkills = (el: HTMLElement | null) => {
    onSkillChangeRef.current?.(chipSkills(el));
  };

  /** Every edit reports both the text and where the caret stands in it. */
  const report = (el: HTMLElement | null) => {
    onChange?.(el?.textContent ?? "");
    onSlashQueryRef.current?.(slashAtCaret());
  };

  useImperativeHandle(ref, () => ({
    clear: () => {
      const el = fieldRef.current;
      if (el) {
        el.textContent = "";
      }
      onSkillChangeRef.current?.([]);
      onChange?.("");
      onSlashQueryRef.current?.(null);
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
      report(el);
    },
    insertSkill: (name, typed = 0) => {
      const el = fieldRef.current;
      if (!el) {
        return;
      }
      el.focus();
      deleteBeforeCaret(typed);
      if (el.querySelector(`[${SKILL_ATTR}="${CSS.escape(name)}"]`)) {
        report(el);
        return;
      }
      insertAtCaret(el, skillElement(name));
      insertAtCaret(el, document.createTextNode(" "));
      reportSkills(el);
      report(el);
    },
    isEmpty: () => (fieldRef.current?.textContent ?? "").trim() === "",
    parts: () => (fieldRef.current ? serialize(fieldRef.current) : []),
    skills: () => chipSkills(fieldRef.current),
  }));

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (onKeyDown?.(e)) {
      return;
    }
    if (e.key === "Backspace") {
      const found = chipBeforeCaret();
      if (found) {
        e.preventDefault();
        removeSpacer(found.spacer);
        removeChip(found.chip);
        report(fieldRef.current);
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
    report(el);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const chip = target.closest(ANY_CHIP);
    if (!(chip instanceof HTMLElement)) {
      return;
    }
    if (target.closest("[data-chip-remove]")) {
      e.preventDefault();
      removeChip(chip);
      fieldRef.current?.focus();
      report(fieldRef.current);
      return;
    }
    const region = readRegion(chip);
    if (region) {
      onRevealRegion?.(region);
    }
  };

  function removeChip(chip: HTMLElement) {
    const wasSkill = chip.hasAttribute(SKILL_ATTR);
    chip.remove();
    if (wasSkill) {
      reportSkills(fieldRef.current);
    }
  }

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
      onInput={(e) => report(e.currentTarget)}
      onKeyDown={handleKeyDown}
      onKeyUp={() => onSlashQueryRef.current?.(slashAtCaret())}
      onPaste={handlePaste}
      ref={fieldRef}
      role="textbox"
      spellCheck={false}
      suppressContentEditableWarning
      tabIndex={0}
    />
  );
}
