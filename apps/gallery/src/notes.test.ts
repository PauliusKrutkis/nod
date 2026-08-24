/**
 * The note file is hand-editable by design — the agent rewrites it, and so
 * does a person clearing something by hand — so the parser's contract is that
 * no shape of damaged input can take the gallery down, and nothing malformed
 * survives into the UI. Ids stay unique across a resolve because they are
 * derived from the highest live id, not from the count.
 */
import { describe, expect, it } from "vitest";
import {
  addNote,
  cellAnchor,
  emptyNotes,
  isEmptyNotes,
  isHidden,
  nextNoteId,
  notesFileName,
  parseNotes,
  resolveNote,
  withHidden,
} from "./notes.ts";

const draft = {
  added: "2026-08-13",
  cell: "comment-item/overflow/quiet/420",
  note: "Author row wraps before the body does.",
  scope: "component" as const,
};

describe("note ids", () => {
  it("starts at n1 on an empty file", () => {
    expect(nextNoteId(emptyNotes())).toBe("n1");
  });

  it("does not reuse an id after the note before it is resolved", () => {
    const two = addNote(addNote(emptyNotes(), draft), draft);
    const afterResolve = resolveNote(two, "n1");
    expect(nextNoteId(afterResolve)).toBe("n3");
  });

  it("survives a hand-written id that is not a number", () => {
    const file = { ...emptyNotes(), open: [{ ...draft, id: "typo" }] };
    expect(nextNoteId(file)).toBe("n1");
  });
});

describe("parseNotes", () => {
  it("degrades unreadable input to an empty file", () => {
    expect(parseNotes(null)).toEqual(emptyNotes());
    expect(parseNotes("nope")).toEqual(emptyNotes());
    expect(parseNotes({ decided: 7, open: "many" })).toEqual(emptyNotes());
  });

  it("drops notes with no text rather than rendering blank cards", () => {
    const file = parseNotes({ open: [{ note: "   " }, { note: "real" }] });
    expect(file.open.map((note) => note.note)).toEqual(["real"]);
  });

  it("falls back to component scope when the scope is unknown", () => {
    const file = parseNotes({ open: [{ note: "x", scope: "everywhere" }] });
    expect(file.open[0]?.scope).toBe("component");
  });

  it("gives an id to a note hand-written without one", () => {
    const file = parseNotes({ open: [{ note: "x" }] });
    expect(file.open[0]?.id).toBe("n1");
  });
});

describe("the hidden flag", () => {
  it("reads a hand-written hidden: true", () => {
    expect(isHidden(parseNotes({ hidden: true, open: [] }))).toBe(true);
  });

  it("treats anything that is not the boolean true as visible", () => {
    expect(isHidden(parseNotes({ hidden: "yes" }))).toBe(false);
    expect(isHidden(parseNotes({ hidden: 1 }))).toBe(false);
    expect(isHidden(parseNotes({ hidden: "false" }))).toBe(false);
    expect(isHidden(parseNotes({ hidden: false }))).toBe(false);
    expect(isHidden(emptyNotes())).toBe(false);
    expect(isHidden(undefined)).toBe(false);
  });

  it("keeps notes and decisions across a hide and an unhide", () => {
    const file = addNote(emptyNotes(), draft);
    const hidden = withHidden(file, true);
    expect(hidden.open).toEqual(file.open);
    expect(parseNotes(JSON.parse(JSON.stringify(hidden)))).toEqual(hidden);
    expect(withHidden(hidden, false)).toEqual(file);
  });

  it("writes no flag at all when a component is visible", () => {
    expect(
      Object.hasOwn(withHidden(parseNotes({ hidden: true }), false), "hidden")
    ).toBe(false);
  });
});

describe("cellAnchor", () => {
  it("drops the view mode, which changes how you look and not what at", () => {
    expect(
      cellAnchor({
        component: "diff-row",
        fixture: "run-20",
        theme: "quiet",
        width: 420,
      })
    ).toBe("diff-row/run-20/quiet/420");
  });

  it("names the fluid width the way the route does", () => {
    expect(
      cellAnchor({
        component: "badge",
        fixture: "typical",
        theme: "day",
        width: 0,
      })
    ).toBe("badge/typical/day/fluid");
  });
});

describe("file lifecycle", () => {
  it("is empty once its last note is resolved, so the file can be deleted", () => {
    const one = addNote(emptyNotes(), draft);
    expect(isEmptyNotes(one)).toBe(false);
    expect(isEmptyNotes(resolveNote(one, "n1"))).toBe(true);
  });

  it("keeps a file alive on decisions alone", () => {
    const decided = { decided: [{ note: "x", why: "y" }], open: [] };
    expect(isEmptyNotes(decided)).toBe(false);
  });

  it("keeps a file alive on the hidden flag alone, or the rail forgets", () => {
    expect(isEmptyNotes(withHidden(emptyNotes(), true))).toBe(false);
  });

  it("is empty once a noteless file is unhidden, so it goes away", () => {
    const hidden = withHidden(emptyNotes(), true);
    expect(isEmptyNotes(withHidden(hidden, false))).toBe(true);
  });

  it("names the file next to the component's fixtures", () => {
    expect(notesFileName("comment-item")).toBe("comment-item.notes.json");
  });
});
