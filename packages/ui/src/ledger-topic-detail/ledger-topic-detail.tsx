/**
 * The ledger's reading pane — what the inbox-detail pane is to a PR, this
 * is to a topic group: one meta line, the leading subject carrying the
 * weight, a single stat strip, then the provenance and file lists
 * scrolling on their own under a pinned footer of hints. inbox-detail.css
 * is imported as the single source of the qi-detail anatomy, so the two
 * panes can never drift apart; only the list rows below the head are this
 * component's own.
 *
 * The stat strip omits what it has nothing to say about, and a decayed
 * approval renders as the strip's trailing clause ("changed since <actor>
 * signed at <sha>") rather than an alert — staleness is a derived state
 * here, not an emergency.
 */
import { Badge } from "../badge/badge.tsx";
import { Kbd } from "../kbd/kbd.tsx";
import "../inbox-detail/inbox-detail.css";
import "./ledger-topic-detail.css";

export interface LedgerTopicFile {
  path: string;
  lines: number;
}

export interface LedgerTopicProvenance {
  /** `#123` for a squash merge, a short sha for a direct push. */
  label: string;
  subject: string;
}

export interface LedgerTopic {
  topic: string;
  /** The group's leading commit subject — its one-line story. */
  subject: string;
  regions: number;
  lines: number;
  files: LedgerTopicFile[];
  provenance: LedgerTopicProvenance[];
  /** A decayed approval these lines postdate. */
  deltaSince?: { actor: string; sha: string } | null;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function LedgerTopicDetail({ topic }: { topic: LedgerTopic }) {
  return (
    <div className="qi-detail">
      <div className="qi-detail-head">
        <div className="qi-detail-meta">
          <span className="qi-detail-num">{topic.topic}</span>
          {topic.deltaSince ? (
            <Badge dot tone="warning">
              changed since approval
            </Badge>
          ) : null}
        </div>
        <h2 className="qi-detail-title">{topic.subject || topic.topic}</h2>
        <div className="qi-detail-stats">
          <span>{plural(topic.regions, "region")}</span>
          <span aria-hidden>·</span>
          <span>{plural(topic.files.length, "file")}</span>
          <span aria-hidden>·</span>
          <span>{topic.lines} lines to read</span>
          {topic.deltaSince ? (
            <>
              <span aria-hidden>·</span>
              <span>
                since {topic.deltaSince.actor} signed at {topic.deltaSince.sha}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="qi-detail-body">
        {topic.provenance.length > 0 ? (
          <section className="q-ltd-section">
            <div className="qi-detail-kicker">How it got here</div>
            <ul className="q-ltd-list">
              {topic.provenance.map((entry) => (
                <li
                  className="q-ltd-row"
                  key={`${entry.label}-${entry.subject}`}
                >
                  <span className="q-ltd-label q-mono">{entry.label}</span>
                  <span className="q-ltd-cell">{entry.subject}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {topic.files.length > 0 ? (
          <section className="q-ltd-section">
            <div className="qi-detail-kicker">Files</div>
            <ul className="q-ltd-list">
              {topic.files.map((file) => (
                <li className="q-ltd-row" key={file.path}>
                  <span className="q-ltd-cell q-mono">{file.path}</span>
                  <span className="q-ltd-lines q-mono">{file.lines}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <footer className="qi-detail-foot">
        <span>
          <Kbd combo="enter" /> open session
        </span>
        <span>
          <Kbd combo="esc" /> back
        </span>
      </footer>
    </div>
  );
}
