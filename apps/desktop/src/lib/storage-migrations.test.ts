import { beforeEach, describe, expect, it } from "vitest";
import { migrateStorageKeys } from "./storage-migrations.ts";

describe("migrateStorageKeys", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("moves a legacy value under its versioned key", () => {
    localStorage.setItem("pr-flow:lastRoute", '{"kind":"inbox"}');
    migrateStorageKeys();
    expect(localStorage.getItem("pr-flow:lastRoute:v1")).toBe(
      '{"kind":"inbox"}'
    );
    expect(localStorage.getItem("pr-flow:lastRoute")).toBeNull();
  });

  it("never overwrites an existing versioned value", () => {
    localStorage.setItem("pr-flow:lastSeen", '{"old":1}');
    localStorage.setItem("pr-flow:lastSeen:v1", '{"new":2}');
    migrateStorageKeys();
    expect(localStorage.getItem("pr-flow:lastSeen:v1")).toBe('{"new":2}');
    expect(localStorage.getItem("pr-flow:lastSeen")).toBeNull();
  });

  it("is a no-op when nothing legacy exists", () => {
    migrateStorageKeys();
    expect(localStorage.length).toBe(0);
  });
});
