import { beforeEach, describe, expect, it } from "vitest";
import { migrateStorageKeys } from "./storage-migrations.ts";

describe("migrateStorageKeys", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("moves a legacy value under its versioned key", () => {
    localStorage.setItem("nod:lastRoute", '{"kind":"inbox"}');
    migrateStorageKeys();
    expect(localStorage.getItem("nod:lastRoute:v1")).toBe('{"kind":"inbox"}');
    expect(localStorage.getItem("nod:lastRoute")).toBeNull();
  });

  it("never overwrites an existing versioned value", () => {
    localStorage.setItem("nod:lastSeen", '{"old":1}');
    localStorage.setItem("nod:lastSeen:v1", '{"new":2}');
    migrateStorageKeys();
    expect(localStorage.getItem("nod:lastSeen:v1")).toBe('{"new":2}');
    expect(localStorage.getItem("nod:lastSeen")).toBeNull();
  });

  it("is a no-op when nothing legacy exists", () => {
    migrateStorageKeys();
    expect(localStorage.length).toBe(0);
  });

  it("moves the pre-rename namespace onto nod:", () => {
    localStorage.setItem("pr-flow:zoom", "1.2");
    localStorage.setItem("pr-flow:pendingComments:v1", '{"draft":"wip"}');
    migrateStorageKeys();
    expect(localStorage.getItem("nod:zoom")).toBe("1.2");
    expect(localStorage.getItem("nod:pendingComments:v1")).toBe(
      '{"draft":"wip"}'
    );
    expect(localStorage.getItem("pr-flow:zoom")).toBeNull();
    expect(localStorage.getItem("pr-flow:pendingComments:v1")).toBeNull();
  });

  it("carries every pre-rename key, not just the versioned ones", () => {
    localStorage.setItem("pr-flow:drawerWide", "true");
    localStorage.setItem("pr-flow:fileTreeMode", "tree");
    localStorage.setItem("pr-flow:lastRunVersion", "0.4.0");
    localStorage.setItem("pr-flow:releases:v1", "[]");
    migrateStorageKeys();
    expect(localStorage.getItem("nod:drawerWide")).toBe("true");
    expect(localStorage.getItem("nod:fileTreeMode")).toBe("tree");
    expect(localStorage.getItem("nod:lastRunVersion")).toBe("0.4.0");
    expect(localStorage.getItem("nod:releases:v1")).toBe("[]");
    expect(localStorage.length).toBe(4);
  });

  it("chains both passes for a pre-versioning, pre-rename value", () => {
    localStorage.setItem("pr-flow:reviewMemory", '{"seen":[1]}');
    migrateStorageKeys();
    expect(localStorage.getItem("nod:reviewMemory:v1")).toBe('{"seen":[1]}');
    expect(localStorage.getItem("nod:reviewMemory")).toBeNull();
    expect(localStorage.getItem("pr-flow:reviewMemory")).toBeNull();
  });

  it("keeps the newer value when both namespaces hold the same key", () => {
    localStorage.setItem("pr-flow:zoom", "1.0");
    localStorage.setItem("nod:zoom", "1.4");
    migrateStorageKeys();
    expect(localStorage.getItem("nod:zoom")).toBe("1.4");
    expect(localStorage.getItem("pr-flow:zoom")).toBeNull();
  });

  it("leaves unrelated keys untouched", () => {
    localStorage.setItem("theme", "dark");
    migrateStorageKeys();
    expect(localStorage.getItem("theme")).toBe("dark");
  });
});
