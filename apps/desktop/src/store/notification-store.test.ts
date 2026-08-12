import { beforeEach, describe, expect, it } from "vitest";
import type { NotificationEvent } from "../lib/notification-events.ts";
import { useNotificationStore } from "./notification-store.ts";

function event(
  id: string,
  createdAt = "2026-07-02T12:00:00Z"
): NotificationEvent {
  return {
    actor: "alice",
    actorAvatarUrl: "av",
    createdAt,
    id,
    kind: "authorResponded",
    name: "nod",
    number: 5,
    owner: "acme",
    prKey: "acme/nod#5",
    title: "Tighten the retry backoff",
  };
}

function seeded() {
  useNotificationStore.setState({ events: [], seeded: true });
}

beforeEach(() => {
  localStorage.clear();
  useNotificationStore.setState({ events: [], seeded: false });
});

describe("first run", () => {
  it("records the opening inbox without announcing any of it", () => {
    const fresh = useNotificationStore
      .getState()
      .ingest([event("a"), event("b")]);
    expect(fresh).toEqual([]);
    const { events } = useNotificationStore.getState();
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.readAt !== null)).toBe(true);
  });

  it("announces normally from the second poll on", () => {
    useNotificationStore.getState().ingest([event("a")]);
    const fresh = useNotificationStore
      .getState()
      .ingest([event("a"), event("b")]);
    expect(fresh.map((e) => e.id)).toEqual(["b"]);
    expect(useNotificationStore.getState().unreadCount()).toBe(1);
  });

  it("seeds even when the opening inbox is empty", () => {
    useNotificationStore.getState().ingest([]);
    expect(useNotificationStore.getState().seeded).toBe(true);
    expect(useNotificationStore.getState().ingest([event("a")])).toHaveLength(
      1
    );
  });
});

describe("ingest", () => {
  beforeEach(seeded);

  it("returns an event once, however many polls repeat it", () => {
    expect(useNotificationStore.getState().ingest([event("a")])).toHaveLength(
      1
    );
    expect(useNotificationStore.getState().ingest([event("a")])).toEqual([]);
    expect(useNotificationStore.getState().ingest([event("a")])).toEqual([]);
    expect(useNotificationStore.getState().events).toHaveLength(1);
  });

  it("survives a restart, so a reload announces nothing twice", () => {
    useNotificationStore.getState().ingest([event("a")]);
    const reloaded = JSON.parse(
      localStorage.getItem("nod:notifications:v1") ?? "{}"
    );
    useNotificationStore.setState({
      events: reloaded.events,
      seeded: reloaded.seeded,
    });
    expect(useNotificationStore.getState().ingest([event("a")])).toEqual([]);
  });

  it("keeps the newest events when the log is full", () => {
    const many = Array.from({ length: 205 }, (_, i) =>
      event(
        `e${i}`,
        `2026-07-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`
      )
    );
    useNotificationStore.getState().ingest(many);
    const { events } = useNotificationStore.getState();
    expect(events).toHaveLength(200);
    expect(
      new Date(events[0]?.createdAt ?? 0).getTime()
    ).toBeGreaterThanOrEqual(new Date(events.at(-1)?.createdAt ?? 0).getTime());
  });
});

describe("read state", () => {
  beforeEach(seeded);

  it("counts unread until each is read", () => {
    useNotificationStore.getState().ingest([event("a"), event("b")]);
    expect(useNotificationStore.getState().unreadCount()).toBe(2);
    useNotificationStore.getState().markRead("a");
    expect(useNotificationStore.getState().unreadCount()).toBe(1);
    useNotificationStore.getState().markAllRead();
    expect(useNotificationStore.getState().unreadCount()).toBe(0);
  });

  it("does not re-announce what you have already read", () => {
    useNotificationStore.getState().ingest([event("a")]);
    useNotificationStore.getState().markAllRead();
    expect(useNotificationStore.getState().ingest([event("a")])).toEqual([]);
    expect(useNotificationStore.getState().unreadCount()).toBe(0);
  });
});
