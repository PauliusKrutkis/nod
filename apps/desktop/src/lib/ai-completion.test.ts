import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAiCompletionEnabled,
  resetAiCompletionCache,
  setAiCompletionEnabled,
  subscribeAiCompletion,
} from "./ai-completion.ts";

const KEY = "nod:aiCompletion:v1";

beforeEach(() => {
  localStorage.clear();
  resetAiCompletionCache();
});

describe("ai completion preference", () => {
  it("is off until it is turned on", () => {
    expect(getAiCompletionEnabled()).toBe(false);
  });

  it("stays off for anything that is not the stored true", () => {
    for (const stored of ["", "1", "yes", "TRUE", "null"]) {
      localStorage.setItem(KEY, stored);
      resetAiCompletionCache();
      expect(getAiCompletionEnabled()).toBe(false);
    }
  });

  it("persists the choice and tells subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAiCompletion(listener);

    setAiCompletionEnabled(true);
    expect(getAiCompletionEnabled()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe("true");
    expect(listener).toHaveBeenCalledTimes(1);

    setAiCompletionEnabled(false);
    expect(getAiCompletionEnabled()).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("false");

    unsubscribe();
    setAiCompletionEnabled(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps the choice in memory when storage refuses the write", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });

    setAiCompletionEnabled(true);
    expect(getAiCompletionEnabled()).toBe(true);

    setItem.mockRestore();
  });
});
