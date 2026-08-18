import { describe, expect, it } from "vitest";
import type { QueuedWrite, QueueVerb } from "../types.ts";
import {
  canPlaceAgain,
  itemLabel,
  itemText,
  queueSummary,
} from "./offline-summary.ts";

function item(verb: QueueVerb, failure: string | null = null): QueuedWrite {
  return {
    createdAt: 1,
    failure,
    id: `w-${Math.random()}`,
    number: 7,
    owner: "acme",
    repo: "site",
    state: failure ? "failed" : "queued",
    verb,
  };
}

const comment: QueueVerb = {
  body: "nit: naming",
  commitId: "abc",
  kind: "comment",
  line: 12,
  path: "src/a.ts",
  side: "RIGHT",
};

describe("queueSummary", () => {
  it("counts by verb with singular and plural nouns", () => {
    const queue = [
      item(comment),
      item(comment),
      item({ body: "same here", inReplyTo: 4, kind: "reply" }),
    ];
    expect(queueSummary(queue)).toBe("2 comments · 1 reply");
  });

  it("names a staged review rather than counting it", () => {
    const queue = [
      item(comment),
      item({
        body: "lgtm",
        comments: [],
        commitId: "abc",
        event: "APPROVE",
        kind: "submitReview",
      }),
    ];
    expect(queueSummary(queue)).toBe("1 comment · review staged");
  });

  it("is empty for an empty queue", () => {
    expect(queueSummary([])).toBe("");
  });
});

describe("itemLabel and itemText", () => {
  it("anchors a comment to its file and line", () => {
    expect(itemLabel(item(comment))).toBe("comment on src/a.ts:12");
    expect(itemText(item(comment))).toBe("nit: naming");
  });

  it("keeps resolve direction and has no text for it", () => {
    const resolve = item({ kind: "resolve", resolved: true, threadId: "T" });
    expect(itemLabel(resolve)).toBe("resolve a thread on acme/site#7");
    expect(itemText(resolve)).toBeNull();
  });

  it("only inline comments can be placed again", () => {
    expect(canPlaceAgain(item(comment))).toBe(true);
    expect(
      canPlaceAgain(item({ body: "hi", inReplyTo: 1, kind: "reply" }))
    ).toBe(false);
  });
});
