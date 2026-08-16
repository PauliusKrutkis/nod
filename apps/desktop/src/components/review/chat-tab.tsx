/**
 * Host wiring for the right dock's Chat tab: the chat runtime hook (store
 * reads, mutation, streaming listeners) plus the app's Markdown pipeline
 * lent to the catalogued panel. Escape in the composer seats focus back on
 * the diff's scroll host, the same landing the dock uses on close, so the
 * Esc ladder keeps working from wherever the reviewer was typing.
 */

import type { ChatComposerHandle } from "@nod/ui/chat-composer";
import { ChatPanel } from "@nod/ui/chat-panel";
import { useEffect, useRef } from "react";
import { useReviewChat } from "../../hooks/use-review-chat.ts";
import type { ChangedFile, ChatRegion, PullRequest } from "../../types.ts";
import { Markdown } from "../markdown-loader.tsx";

interface ChatTabProps {
  files: readonly ChangedFile[];
  focusSeq: number;
  onRevealRegion: (region: ChatRegion) => void;
  pr: PullRequest;
}

export function ChatTab({ files, focusSeq, onRevealRegion, pr }: ChatTabProps) {
  const composerRef = useRef<ChatComposerHandle>(null);
  const chat = useReviewChat({
    active: focusSeq > 0,
    composerRef,
    files,
    pr,
  });

  // `l` in the diff stages a region in the store; the composer is where it
  // belongs, so drain the queue into the caret as soon as it arrives.
  useEffect(() => {
    if (chat.chips.length === 0) {
      return;
    }
    for (const chip of chat.chips) {
      composerRef.current?.insertRegion(chip);
    }
    chat.clearChips();
  }, [chat.chips, chat.clearChips]);

  const renderMarkdown = (text: string) => (
    <Markdown owner={pr.owner} repo={pr.name}>
      {text}
    </Markdown>
  );

  const focusScrollHost = () => {
    document
      .querySelector<HTMLElement>(".qf-scrollhost")
      ?.focus({ preventScroll: true });
  };

  return (
    <ChatPanel
      composerRef={composerRef}
      contextNote={chat.contextNote}
      focusSeq={focusSeq}
      model={chat.model}
      onComposerChange={chat.onComposerChange}
      onEscape={focusScrollHost}
      onOpenSkills={chat.openSkillsFolder}
      onRemoveSkill={chat.removeSkill}
      onRevealRegion={onRevealRegion}
      onSend={() => {
        const sent = chat.send(composerRef.current?.parts() ?? []);
        if (sent) {
          composerRef.current?.clear();
        }
      }}
      onStop={chat.stop}
      pending={chat.pending}
      renderMarkdown={renderMarkdown}
      skill={chat.skill}
      skillCount={chat.skillCount}
      staged={{
        items: chat.staged,
        onDiscard: chat.stagedDiscard,
        onReveal: (id) => {
          const item = chat.staged.find((c) => c.id === id);
          if (item) {
            onRevealRegion({
              code: "",
              filePath: item.path,
              lineRange: String(item.line),
              side: item.side,
            });
          }
        },
      }}
      suggestions={chat.suggestions}
      threads={chat.threads}
      turns={chat.panelTurns}
    />
  );
}
