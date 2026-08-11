/**
 * The review screen's pending shell: a sidebar and main-pane skeleton painted
 * in the real screen's proportions, so opening a pull request lands on a
 * frame that is already the right shape and only fills in. When the host can
 * name the PR from a list it already fetched, the header paints the real
 * title, number, repo and author immediately and only the file list and diff
 * are bars — the difference between "loading" and "loading *this*".
 *
 * The error face replaces the shell entirely rather than sitting inside it:
 * there is no frame to fill in any more, and the only useful thing left on
 * screen is what went wrong plus the way back.
 *
 * Skeleton bar widths are a fixed pattern, never random — this surface is a
 * screenshot target, and a shell that reshuffles on every mount cannot be
 * one. `Pr` is the package's own minimal shape; the app's richer pull-request
 * type satisfies it structurally.
 */
import { Avatar } from "../avatar/avatar.tsx";
import "./review-screen-pending.css";

export interface Pr {
  author: string;
  authorAvatarUrl?: string | null;
  number: number;
  repo: string;
  title: string;
}

const SIDEBAR_SKELETON_WIDTHS = [88, 72, 56, 40, 88, 72, 56, 40, 88] as const;
const MAIN_SKELETON_WIDTHS = Array.from(
  { length: 16 },
  (_, index) => ((index * 37) % 52) + 32
);

export function ReviewScreenPending({
  error,
  isError,
  onBack,
  pr,
}: {
  error: string;
  isError: boolean;
  onBack: () => void;
  pr?: Pr | null;
}) {
  if (isError) {
    return (
      <div className="qrp-error">
        <p className="qrp-error-title">Couldn't load this pull request</p>
        <p className="qrp-error-detail">{error}</p>
        <button className="qrp-error-back" onClick={onBack} type="button">
          Back to inbox
        </button>
        <p className="qrp-error-hint">Press Esc to go back</p>
      </div>
    );
  }

  return (
    <div className="qrp-root">
      <aside className="qrp-side">
        <div className="qrp-side-head">
          <span className="qrp-side-title">Files</span>
        </div>
        <div className="qrp-side-body">
          {SIDEBAR_SKELETON_WIDTHS.map((width, index, widths) => {
            const n = widths.slice(0, index).filter((w) => w === width).length;
            return (
              <div
                className="qrp-skel qrp-side-bar"
                key={`${width}-${n}`}
                style={{ width: `${width}%` }}
              />
            );
          })}
        </div>
      </aside>
      <main className="qrp-main">
        <header className="qrp-header">
          {pr ? (
            <>
              <h1 className="qrp-title" title={pr.title}>
                {pr.title}
              </h1>
              <div className="qrp-sub">
                <span className="qrp-num">#{pr.number}</span>
                <span className="qrp-dot">·</span>
                <span>{pr.repo}</span>
                <span className="qrp-dot">·</span>
                <Avatar name={pr.author} size={15} url={pr.authorAvatarUrl} />
                <span className="qrp-muted">{pr.author}</span>
              </div>
            </>
          ) : (
            <>
              <div className="qrp-skel qrp-head-bar" />
              <div className="qrp-skel qrp-head-bar-sub" />
            </>
          )}
        </header>
        <div className="qrp-body">
          {MAIN_SKELETON_WIDTHS.map((width) => (
            <div
              className="qrp-skel qrp-body-bar"
              key={width}
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
