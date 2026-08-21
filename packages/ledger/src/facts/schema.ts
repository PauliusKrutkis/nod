import { createHash } from "node:crypto";

export type ActorKind = "human" | "agent";

export interface Actor {
  kind: ActorKind;
  /** Stable identity, e.g. a GitHub login or an agent name. */
  id: string;
}

export type Subject =
  | { kind: "anchor"; id: string }
  | { kind: "topic"; id: string };

export const VERDICTS = [
  "reviewed",
  "approved",
  "flagged",
  "assigned",
  "corrected",
  /** A remark on a subject; `body` carries the text, `parent` threads. */
  "commented",
  /** Closes the thread rooted at `parent` (docs/LEDGER.md §15). */
  "resolved",
] as const;

export type Verdict = (typeof VERDICTS)[number];

/**
 * The one immutable record shape of the ledger (docs/LEDGER.md §2). A fact is
 * never edited or deleted; a wrong fact is answered by a newer fact.
 */
export interface Fact {
  v: 1;
  actor: Actor;
  subject: Subject;
  verdict: Verdict;
  /** The commit the actor was looking at when the fact was made. */
  atSha: string;
  /** ISO 8601 timestamp. */
  atTime: string;
  body?: string;
  /** Id of the fact this one answers (threads, supersedes, corrections). */
  parent?: string;
}

export const canonicalJson = (value: unknown): string => canonicalize(value);

const canonicalize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    const body = entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`)
      .join(",");
    return `{${body}}`;
  }
  return JSON.stringify(value);
};

/**
 * Key-order-independent serialization, so a fact's identity is a function of
 * its content alone. This exact byte sequence is what gets stored.
 */
export const canonicalFactJson = (fact: Fact): string => canonicalize(fact);

/** Content hash of the canonical serialization; the fact's name everywhere. */
export const factId = (fact: Fact): string =>
  createHash("sha256").update(canonicalFactJson(fact)).digest("hex");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isActor = (value: unknown): value is Actor =>
  isRecord(value) &&
  (value.kind === "human" || value.kind === "agent") &&
  typeof value.id === "string";

const isSubject = (value: unknown): value is Subject =>
  isRecord(value) &&
  (value.kind === "anchor" || value.kind === "topic") &&
  typeof value.id === "string";

const isVerdict = (value: unknown): value is Verdict =>
  typeof value === "string" && (VERDICTS as readonly string[]).includes(value);

export const isFact = (value: unknown): value is Fact =>
  isRecord(value) &&
  value.v === 1 &&
  isActor(value.actor) &&
  isSubject(value.subject) &&
  isVerdict(value.verdict) &&
  typeof value.atSha === "string" &&
  typeof value.atTime === "string" &&
  (value.body === undefined || typeof value.body === "string") &&
  (value.parent === undefined || typeof value.parent === "string");

export const parseFact = (json: string): Fact => {
  const value: unknown = JSON.parse(json);
  if (!isFact(value)) {
    throw new Error("not a valid ledger fact");
  }
  return value;
};
