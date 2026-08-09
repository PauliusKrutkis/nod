import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CANNED_COMMENTS,
  loadCannedComments,
  saveCannedComments,
} from "./canned-comments.ts";

const KEY = "nod:cannedComments:v1";

describe("canned comments storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("hands out the defaults on first run", () => {
    expect(loadCannedComments()).toEqual([...DEFAULT_CANNED_COMMENTS]);
  });

  it("keeps an emptied list empty instead of restoring the defaults", () => {
    saveCannedComments([]);
    expect(loadCannedComments()).toEqual([]);
  });

  it("round-trips an edited list", () => {
    saveCannedComments(["needs a test", "nit: naming"]);
    expect(loadCannedComments()).toEqual(["needs a test", "nit: naming"]);
  });

  it("drops junk entries and falls back when the value is not a list", () => {
    localStorage.setItem(KEY, JSON.stringify(["ok", 42, "   ", null]));
    expect(loadCannedComments()).toEqual(["ok"]);

    localStorage.setItem(KEY, "{}");
    expect(loadCannedComments()).toEqual([...DEFAULT_CANNED_COMMENTS]);
  });
});
