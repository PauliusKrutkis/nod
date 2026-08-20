/**
 * The state space is the Rust queue's: offline with writes queued (summarised
 * by verb), offline with nothing queued (the cache line), and the reconnect
 * report — landed counts, nothing-to-do lines, failed items that keep their
 * text and actions, and the staged review that waits for the send press. The
 * quiet state (online, empty queue, no report) renders nothing, and that is
 * the contract, not an accident.
 *
 * failed-resolve is the item with no text: it must offer only Discard, never
 * a Copy or Place again that would act on nothing. sending is the staged
 * review mid-replay, with the send button honestly disabled. The overflow
 * fixture puts the worst strings in every slot at once — an unbreakable body,
 * a path with no separators, a giant PR number — because the failure surface
 * is exactly where hostile real-world text arrives.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { OfflineBar } from "./offline-bar.tsx";
import type {
  QueuedWrite,
  QueueVerb,
  ReplayedItem,
} from "./offline-summary.ts";

const noop = () => {
  return;
};

const on = {
  onCopy: noop,
  onDiscard: noop,
  onDismiss: noop,
  onPlaceAgain: noop,
  onSend: noop,
};

function write(id: string, verb: QueueVerb): QueuedWrite {
  return {
    createdAt: 1,
    failure: null,
    id,
    number: 4821,
    owner: "nod",
    repo: "nod",
    state: "queued",
    verb,
  };
}

function failed(id: string, verb: QueueVerb, failure: string): QueuedWrite {
  return { ...write(id, verb), failure, state: "failed" };
}

function landed(item: QueuedWrite): ReplayedItem {
  return { item, outcome: "landed", reason: null };
}

const comment = (
  body: string,
  path = "src/lib/api.ts",
  line = 42
): QueueVerb => ({
  body,
  commitId: "abc123",
  kind: "comment",
  line,
  path,
  side: "RIGHT",
});

const reply = (body: string): QueueVerb => ({
  body,
  inReplyTo: 9,
  kind: "reply",
});

function crowdFailedVerb(i: number): QueueVerb {
  if (i % 3 === 0) {
    return comment(`comment number ${i}`, `src/file-${i}.ts`, i + 1);
  }
  if (i % 3 === 1) {
    return reply(`reply number ${i}`);
  }
  return { body: `note ${i}`, kind: "issueComment" };
}

function crowdQueuedVerb(i: number): QueueVerb {
  if (i < 80) {
    return comment(`comment ${i}`);
  }
  if (i < 105) {
    return reply(`reply ${i}`);
  }
  if (i < 115) {
    return { kind: "resolve", resolved: true, threadId: `T_${i}` };
  }
  return { body: `note ${i}`, kind: "issueComment" };
}

const submitReview = (body: string): QueueVerb => ({
  body,
  comments: [],
  commitId: "abc123",
  event: "APPROVE",
  kind: "submitReview",
});

export const offlineBarEntry = defineEntry(OfflineBar, {
  "failed-comment": {
    props: {
      ...on,
      online: true,
      queue: [
        failed(
          "w1",
          comment("nit: this map rebuilds on every keystroke"),
          "the diff moved and the line is gone"
        ),
      ],
      report: null,
      sending: false,
    },
  },
  "failed-crowd-12": {
    props: {
      ...on,
      online: true,
      queue: Array.from({ length: 12 }, (_, i) =>
        failed(`w${i}`, crowdFailedVerb(i), "the request timed out")
      ),
      report: null,
      sending: false,
    },
  },
  "failed-resolve": {
    props: {
      ...on,
      online: true,
      queue: [
        failed(
          "w1",
          { kind: "resolve", resolved: true, threadId: "T_1" },
          "the thread was deleted on the host"
        ),
      ],
      report: null,
      sending: false,
    },
  },
  "landed-many": {
    props: {
      ...on,
      online: true,
      queue: [],
      report: [
        landed(write("w1", comment("first"))),
        landed(write("w2", reply("second"))),
        landed(write("w3", { body: "third", kind: "issueComment" })),
      ],
      sending: false,
    },
  },
  "landed-one": {
    props: {
      ...on,
      online: true,
      queue: [],
      report: [landed(write("w1", comment("just the one")))],
      sending: false,
    },
  },
  "markup-as-text": {
    props: {
      ...on,
      online: true,
      queue: [
        failed(
          "w1",
          {
            body: '<img src=x onerror="alert(1)"> and <script>void 0</script>',
            kind: "issueComment",
          },
          "<b>the host said no</b>"
        ),
      ],
      report: null,
      sending: false,
    },
  },
  "mixed-report": {
    props: {
      ...on,
      online: true,
      queue: [
        failed(
          "w4",
          comment("this one did not make it"),
          "the line is outside the diff"
        ),
        write("w5", submitReview("Looks good, two nits inline.")),
      ],
      report: [
        landed(write("w1", comment("first"))),
        landed(write("w2", reply("second"))),
        {
          item: write("w3", {
            kind: "resolve",
            resolved: true,
            threadId: "T_1",
          }),
          outcome: "nothingToDo",
          reason: "the thread is already resolved",
        },
        {
          item: failed(
            "w4",
            comment("this one did not make it"),
            "the line is outside the diff"
          ),
          outcome: "failed",
          reason: null,
        },
      ],
      sending: false,
    },
  },
  "nothing-to-do": {
    props: {
      ...on,
      online: true,
      queue: [],
      report: [
        {
          item: write("w1", {
            kind: "resolve",
            resolved: true,
            threadId: "T_1",
          }),
          outcome: "nothingToDo",
          reason: "the thread is already resolved",
        },
      ],
      sending: false,
    },
  },
  "offline-crowd-120": {
    props: {
      ...on,
      online: false,
      queue: Array.from({ length: 120 }, (_, i) =>
        write(`w${i}`, crowdQueuedVerb(i))
      ),
      report: null,
      sending: false,
    },
  },
  "offline-empty-queue": {
    props: { ...on, online: false, queue: [], report: null, sending: false },
  },
  "offline-queued": {
    props: {
      ...on,
      online: false,
      queue: [
        write("w1", comment("first nit")),
        write("w2", comment("second nit")),
        write("w3", reply("agreed")),
        write("w4", submitReview("Ship it.")),
      ],
      report: null,
      sending: false,
    },
  },
  "online-quiet": {
    props: { ...on, online: true, queue: [], report: null, sending: false },
    rendersNothing: true,
  },
  overflow: {
    props: {
      ...on,
      online: true,
      queue: [
        {
          createdAt: 1,
          failure: `E_${"CONNRESETUPSTREAMPROXYTIMEOUT".repeat(4)}`,
          id: "w1",
          number: 1_284_394,
          owner: "the-longest-github-organisation-name-anyone-registered",
          repo: "an-equally-unreasonable-repository-name-for-the-label",
          state: "failed",
          verb: comment(
            `x${"NoSpacesAnywhereInThisBody".repeat(80)}`,
            `src/${"deeply/nested/".repeat(12)}component.tsx`,
            98_431
          ),
        },
      ],
      report: null,
      sending: false,
    },
  },
  sending: {
    props: {
      ...on,
      online: true,
      queue: [write("w1", submitReview("Looks good."))],
      report: null,
      sending: true,
    },
  },
  "staged-review": {
    props: {
      ...on,
      online: true,
      queue: [write("w1", submitReview("Looks good, two nits inline."))],
      report: null,
      sending: false,
    },
  },
  unicode: {
    props: {
      ...on,
      online: true,
      queue: [
        {
          createdAt: 1,
          failure: "the host rejected it",
          id: "w1",
          number: 7,
          owner: "藤本さくら",
          repo: "مشروع-التجربة",
          state: "failed",
          verb: {
            body: "藤本 さくらさんへ: محمد الأمين reviewed this 👩‍👩‍👧‍👧 🇱🇹 ✅",
            kind: "issueComment",
          },
        },
      ],
      report: null,
      sending: false,
    },
  },
});
