/**
 * The keyboard command channel (reply/edit/toggle requests) is
 * edge-triggered: the host keeps the LAST request in state, and the diff
 * list virtualizes threads in and out. The contract under test is that a
 * request already present when a thread MOUNTS is consumed, never applied
 * — without it, cycling back to a thread you once pressed shift+e on
 * replays the edit and opens a composer nobody asked for (the dogfooded
 * "w opens edit" bug). A nonce that moves while mounted must still apply.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CommentThread, type ThreadComment } from "./comment-thread.tsx";

afterEach(cleanup);

const asyncNoop = () => Promise.resolve();

const COMMENT: ThreadComment = {
  body: "mine, editable",
  createdAt: "2024-08-01T00:00:00Z",
  id: 7,
  resolved: false,
  threadId: "PRRT_x",
  user: "paulius",
  userAvatarUrl: "",
};

function composer({ initialMarkdown }: { initialMarkdown?: string }) {
  return <textarea aria-label="Composer" defaultValue={initialMarkdown} />;
}

function thread(editRequest: { nonce: number; rootId: number } | null) {
  return (
    <CommentThread
      comments={[COMMENT]}
      composer={composer}
      editRequest={editRequest}
      onEdit={asyncNoop}
      onReply={asyncNoop}
      ownLogin="paulius"
      replyPending={false}
    />
  );
}

describe("CommentThread command requests", () => {
  it("treats a request already present at mount as consumed", () => {
    render(thread({ nonce: 5, rootId: 7 }));
    expect(screen.queryByLabelText("Composer")).toBeNull();
  });

  it("applies a request whose nonce moves while mounted", () => {
    const { rerender } = render(thread({ nonce: 5, rootId: 7 }));
    rerender(thread({ nonce: 6, rootId: 7 }));
    expect(screen.getByLabelText("Composer")).toBeTruthy();
  });
});
