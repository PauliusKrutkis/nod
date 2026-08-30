/**
 * The optimistic contract of useLedgerMutations, exercised against the
 * app's real singleton queryClient (the hook closes over it, so no
 * provider is involved): a mutation's effect is in both caches before the
 * sidecar answers, a failure restores both snapshots, and a failed sign
 * additionally invalidates every session key of the repo — the narrowed
 * key the optimism seeded is out of the snapshot's reach.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient, queryKeys } from "../lib/query-client.ts";
import type { LedgerSession, LedgerStatus } from "../types.ts";
import { useLedgerMutations } from "./use-ledger-mutations.ts";

vi.mock("../lib/api.ts", () => ({
  api: {
    ledgerApprove: vi.fn(),
    ledgerComment: vi.fn(),
    ledgerResolve: vi.fn(),
    ledgerReview: vi.fn(),
  },
}));

const { api } = await import("../lib/api.ts");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const REPO = "me/nod";
const TIP = "71b0000000000000000000000000000000000000";
const TARGETS = ["a.ts:1-4", "b.ts:2-6"];

const SESSION: LedgerSession = {
  comments: [],
  sessions: [
    {
      baseline: null,
      patch: "@@ -0,0 +1,2 @@\n+one\n+two",
      path: "a.ts",
      regions: [{ endLine: 4, startLine: 1 }],
    },
    {
      baseline: null,
      patch: "@@ -0,0 +1,2 @@\n+three\n+four",
      path: "b.ts",
      regions: [{ endLine: 6, startLine: 2 }],
    },
  ],
  tip: TIP,
};

const STATUS = {
  comments: [],
  coverage: 0,
  epoch: "e".repeat(40),
  queue: [
    {
      baseline: null,
      endLine: 4,
      newLines: 4,
      path: "a.ts",
      provenance: [],
      startLine: 1,
      topic: "ledger",
    },
  ],
  reviewedLines: 0,
  tip: TIP,
  topics: [],
  totalLines: 10,
  unassigned: [],
} as unknown as LedgerStatus;

let root: Root;
let mutations: ReturnType<typeof useLedgerMutations>;

function Probe() {
  mutations = useLedgerMutations({ repoKey: REPO, targets: TARGETS, tip: TIP });
  return null;
}

beforeEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
  queryClient.setQueryData(queryKeys.ledgerSession(REPO, TARGETS), SESSION);
  queryClient.setQueryData(queryKeys.ledger(REPO), STATUS);
  root = createRoot(document.createElement("div"));
  act(() => {
    root.render(<Probe />);
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
});

const sessionCache = () =>
  queryClient.getQueryData<LedgerSession>(
    queryKeys.ledgerSession(REPO, TARGETS)
  );
const statusCache = () =>
  queryClient.getQueryData<LedgerStatus>(queryKeys.ledger(REPO));

describe("useLedgerMutations", () => {
  it("inserts a comment into both caches before the sidecar answers", async () => {
    let settle: () => void = () => undefined;
    vi.mocked(api.ledgerComment).mockReturnValue(
      new Promise((resolve) => {
        settle = () => resolve(undefined);
      })
    );

    const done = mutations.addComment({
      body: "does this race?",
      line: 3,
      path: "a.ts",
    });
    expect(sessionCache()?.comments.at(-1)?.body).toBe("does this race?");
    expect(statusCache()?.comments.at(-1)?.body).toBe("does this race?");

    settle();
    await done;
  });

  it("rolls both caches back and toasts when the comment fails", async () => {
    vi.mocked(api.ledgerComment).mockRejectedValue(new Error("no anchor"));

    await mutations.addComment({ body: "doomed", line: 3, path: "a.ts" });

    expect(sessionCache()?.comments).toHaveLength(0);
    expect(statusCache()?.comments).toHaveLength(0);
    const { useAppStore } = await import("../store/app-store.ts");
    expect(useAppStore.getState().toast?.title).toBe("Comment failed");
  });

  it("invalidates the narrowed session key when a sign fails", async () => {
    vi.mocked(api.ledgerReview).mockRejectedValue(new Error("cas lost"));
    const narrowedKey = queryKeys.ledgerSession(REPO, ["b.ts:2-6"]);

    await mutations.sign("a.ts:1-4");

    expect(sessionCache()).toEqual(SESSION);
    expect(statusCache()).toEqual(STATUS);
    const narrowed = queryClient.getQueryState(narrowedKey);
    expect(narrowed?.isInvalidated).toBe(true);
  });
});
