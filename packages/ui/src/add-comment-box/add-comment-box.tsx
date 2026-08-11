/**
 * The inline comment composer: a rich editor surface (see ComposerEditor)
 * that submits markdown. When a secondary action is provided (the diff
 * "add to review" vs. "comment now" choice) it shows a segmented control that
 * makes the mode explicit, and the primary button + ⌘↵ follow the chosen
 * mode. Replies and issue comments (no secondary) fall back to a single
 * button. onEmptyChange mirrors the editor's empty state to the parent — the
 * drawer's collapsed prompt uses it to advertise a surviving draft.
 * `initialMode` seeds the segmented control the way `initialMarkdown` seeds
 * the text: uncontrolled afterwards, since the choice is the composer's own
 * for as long as it is open.
 *
 * `pending` alone cannot stop a double submit: it is a prop, so it only
 * becomes true after a render, and two ⌘↵ dispatched in the same tick both
 * pass it. `inFlightRef` is the synchronous lock that closes that window.
 * It never holds the composer open — the actions stay fire-and-forget, per
 * the optimistic-by-design contract in use-comments.ts. There is no error
 * state here for the same reason: a failed submit rolls back and flashes at
 * the mutation layer, and the composer's job is to keep the typed text.
 *
 * Both button labels are caller text, so both clip: the mode labels through
 * their own span and the primary through Button's, which is why neither can
 * push the footer wider than the panel it sits in.
 */
import type { Extensions } from "@tiptap/core";
import { Layers, Send } from "lucide-react";
import { type Ref, useImperativeHandle, useRef, useState } from "react";
import { Button } from "../button/button.tsx";
import { cn } from "../cn/cn.ts";
import {
  ComposerEditor,
  type ComposerEditorHandle,
} from "../composer-editor/composer-editor.tsx";
import "./add-comment-box.css";

export interface AddCommentBoxHandle {
  focus: () => void;
}

export interface AddCommentBoxProps {
  autoFocus?: boolean;
  extensions?: Extensions;
  initialMarkdown?: string;
  initialMode?: "batch" | "now";
  onCancel: () => void;
  onEmptyChange?: (empty: boolean) => void;
  onSecondary?: (body: string) => Promise<void> | void;
  onSubmit: (body: string) => Promise<void> | void;
  pending: boolean;
  placeholder?: string;
  ref?: Ref<AddCommentBoxHandle>;
  secondaryLabel?: string;
  submitLabel?: string;
  suggestionText?: string;
}

export function AddCommentBox({
  ref,
  onSubmit,
  onCancel,
  onEmptyChange,
  pending,
  placeholder,
  autoFocus,
  extensions,
  initialMarkdown,
  initialMode = "batch",
  submitLabel = "Comment",
  onSecondary,
  secondaryLabel = "Comment now",
  suggestionText,
}: AddCommentBoxProps) {
  const [mode, setMode] = useState(initialMode);
  const [empty, setEmpty] = useState(() => !initialMarkdown?.trim());
  const editorRef = useRef<ComposerEditorHandle>(null);
  const inFlightRef = useRef(false);
  const canSubmit = !(pending || empty);

  useImperativeHandle(
    ref,
    (): AddCommentBoxHandle => ({
      focus: () => editorRef.current?.focus(),
    }),
    []
  );

  const handleEmptyChange = (isEmpty: boolean) => {
    setEmpty(isEmpty);
    onEmptyChange?.(isEmpty);
  };

  const primaryAction = onSecondary && mode === "now" ? onSecondary : onSubmit;
  const primaryLabel =
    onSecondary && mode === "now" ? secondaryLabel : submitLabel;

  const run = async (action: (body: string) => Promise<void> | void) => {
    if (pending || inFlightRef.current) {
      return;
    }
    const body = editorRef.current?.getMarkdown().trim() ?? "";
    if (!body) {
      return;
    }
    inFlightRef.current = true;
    try {
      await action(body);
      editorRef.current?.clear();
    } catch {
      /* the mutation layer rolls back and flashes; keep the text */
    }
    /* not a finally: React Compiler can't lower try/catch/finally, and the
       empty catch already guarantees we reach this line */
    inFlightRef.current = false;
  };

  const handleSubmitRequest = () => {
    run(primaryAction);
  };

  const handleBatchMode = () => {
    setMode("batch");
  };

  const handleNowMode = () => {
    setMode("now");
  };

  const handlePrimaryClick = () => {
    run(primaryAction);
  };

  const handleModeFlip = () => {
    setMode((m) => (m === "batch" ? "now" : "batch"));
  };

  return (
    <div className="qa-inline">
      <ComposerEditor
        autoFocus={autoFocus}
        extensions={extensions}
        initialMarkdown={initialMarkdown}
        onCancel={onCancel}
        onEmptyChange={handleEmptyChange}
        onModeFlip={onSecondary ? handleModeFlip : undefined}
        onSubmitRequest={handleSubmitRequest}
        placeholder={placeholder ?? "Leave a comment…  ⌘↵ to save"}
        ref={editorRef}
        suggestionText={suggestionText}
      />

      <div className="qa-foot">
        {onSecondary ? (
          <div aria-label="When to post" className="qa-mode" role="radiogroup">
            <label
              className={cn("qa-mode-btn", mode === "batch" && "qa-mode-on")}
            >
              <input
                aria-checked={mode === "batch"}
                checked={mode === "batch"}
                className="qa-mode-input"
                name="post-mode"
                onChange={handleBatchMode}
                type="radio"
              />
              <Layers aria-hidden size={13} />
              <span className="qa-mode-label">{submitLabel}</span>
            </label>
            <label
              className={cn("qa-mode-btn", mode === "now" && "qa-mode-on")}
            >
              <input
                aria-checked={mode === "now"}
                checked={mode === "now"}
                className="qa-mode-input"
                name="post-mode"
                onChange={handleNowMode}
                type="radio"
              />
              <Send aria-hidden size={13} />
              <span className="qa-mode-label">{secondaryLabel}</span>
            </label>
          </div>
        ) : null}

        <div className="qa-actions">
          <Button onClick={onCancel} variant="ghost">
            Cancel
          </Button>
          <Button
            combo="mod+enter"
            disabled={!canSubmit}
            onClick={handlePrimaryClick}
            variant="primary"
          >
            {pending ? "Submitting…" : (primaryLabel ?? "")}
          </Button>
        </div>
      </div>

      {!!onSecondary && (
        <p className="qa-explain">
          {mode === "batch"
            ? "Held with your other pending comments until you submit the review."
            : "Posted to the PR immediately, on its own."}{" "}
          Tab switches.
        </p>
      )}
    </div>
  );
}
