/**
 * After the app updates, the first launch shows what changed: one section per
 * release the reader skipped past, newest first, so an update that jumped
 * several versions still shows every set of notes. With nothing to show — the
 * release feed was empty or unreachable — the card degrades to naming the
 * version rather than disappearing, because the update itself still happened.
 *
 * Which releases those are, and when the card has been acknowledged, are the
 * host's decisions; this side only renders the list it is handed.
 *
 * Notes are markdown, and rendering markdown means a parser, a sanitizer and
 * a link handler that opens URLs through the host — none of which belong in
 * this package. So the notes arrive as raw text and `renderNotes` turns them
 * into nodes, letting the app pass its full markdown pipeline while fixtures
 * pass something that needs no dependencies at all.
 *
 * The version chip is suppressed once there is more than one release: each
 * section already carries its own tag, and repeating the newest above them
 * reads as a mistake.
 */
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../button/button.tsx";
import "../notice-card/notice-card.css";
import "./whats-new.css";

export interface WhatsNewRelease {
  notes: string | null;
  tag: string;
}

export function WhatsNew({
  onDismiss,
  onShowHistory,
  releases,
  renderNotes,
  version,
}: {
  onDismiss: () => void;
  onShowHistory: () => void;
  releases: WhatsNewRelease[];
  renderNotes: (notes: string) => ReactNode;
  version: string;
}) {
  return (
    <div className="qb-update qb-whatsnew" role="status">
      <span className="qb-update-icon">
        <Sparkles aria-hidden size={16} />
      </span>
      <div className="qb-update-body">
        <div className="qb-update-head">
          <span className="qb-update-title">What's new</span>
          {releases.length <= 1 && (
            <span className="q-mono qb-update-ver">{version}</span>
          )}
        </div>
        {releases.length > 0 ? (
          <div className="qb-whatsnew-notes">
            {releases.map((release) => (
              <section key={release.tag}>
                {releases.length > 1 && (
                  <h4 className="q-mono qb-whatsnew-tag">{release.tag}</h4>
                )}
                {renderNotes(release.notes ?? "")}
              </section>
            ))}
          </div>
        ) : (
          <p className="qb-update-text">
            You're now on {version}. See the release on GitHub for details.
          </p>
        )}
        <div className="qb-update-actions">
          <Button
            className="qb-update-primary"
            onClick={onDismiss}
            variant="primary"
          >
            Got it
          </Button>
          <button
            className="qb-update-later"
            onClick={onShowHistory}
            type="button"
          >
            All releases
          </button>
        </div>
      </div>
    </div>
  );
}
