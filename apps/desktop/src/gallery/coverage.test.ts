/**
 * Enforces the partition coverage.ts declares: catalog ∪ CONTAINERS ∪ PENDING
 * covers every component file, the three sets never overlap, and neither
 * list carries a name whose file is gone. Failure messages name the
 * component, because the fix is always "classify (or catalog) this one".
 */
import { catalog } from "@nod/ui";
import { describe, expect, it } from "vitest";
import { CONTAINERS, desktopComponentNames, PENDING } from "./coverage.ts";

const classified = new Set([
  ...Object.keys(catalog),
  ...Object.keys(CONTAINERS),
  ...PENDING,
]);

describe("component coverage", () => {
  it.each(desktopComponentNames)(
    "%s is catalogued, a named container, or explicitly pending",
    (name) => {
      expect(classified.has(name)).toBe(true);
    }
  );

  it("catalogued components have left the pending queue", () => {
    const stale = PENDING.filter((name) => name in catalog);
    expect(stale).toEqual([]);
  });

  it("containers are not also catalogued", () => {
    const both = Object.keys(CONTAINERS).filter((name) => name in catalog);
    expect(both).toEqual([]);
  });

  it("pending and container entries still exist on disk", () => {
    const files = new Set(desktopComponentNames);
    const ghosts = [...PENDING, ...Object.keys(CONTAINERS)].filter(
      (name) => !files.has(name)
    );
    expect(ghosts).toEqual([]);
  });
});
