import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CANNED_COMMENTS,
  getCannedComments,
  resetCannedCommentsCache,
  setCannedComments,
  subscribeCannedComments,
} from "./canned-comments.ts";

const KEY = "nod:cannedComments:v1";

beforeEach(() => {
  localStorage.clear();
  resetCannedCommentsCache();
});

describe("canned comments storage", () => {
  it("yields the defaults on first run", () => {
    expect(getCannedComments()).toEqual(DEFAULT_CANNED_COMMENTS);
  });

  it("keeps an empty list the reviewer chose", () => {
    localStorage.setItem(KEY, "[]");
    expect(getCannedComments()).toEqual([]);
  });

  it("falls back to the defaults on a value that is not a list", () => {
    localStorage.setItem(KEY, '{"nit":"naming"}');
    expect(getCannedComments()).toEqual(DEFAULT_CANNED_COMMENTS);
  });

  it("falls back to the defaults on unparseable json", () => {
    localStorage.setItem(KEY, "{not json");
    expect(getCannedComments()).toEqual(DEFAULT_CANNED_COMMENTS);
  });

  it("drops non-strings and blank lines a bad write left behind", () => {
    localStorage.setItem(KEY, '["keep", 7, null, "   ", "also keep"]');
    expect(getCannedComments()).toEqual(["keep", "also keep"]);
  });

  it("returns the same reference until a write replaces it", () => {
    const first = getCannedComments();
    expect(getCannedComments()).toBe(first);
    setCannedComments(["nit: naming"]);
    expect(getCannedComments()).not.toBe(first);
  });

  it("persists a write and tells subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCannedComments(listener);

    setCannedComments(["nit: naming"]);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getCannedComments()).toEqual(["nit: naming"]);
    expect(localStorage.getItem(KEY)).toBe('["nit: naming"]');

    unsubscribe();
    setCannedComments([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the list in memory when storage refuses the write", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });

    setCannedComments(["nit: naming"]);
    expect(getCannedComments()).toEqual(["nit: naming"]);

    setItem.mockRestore();
  });
});
