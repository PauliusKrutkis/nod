/**
 * Host wiring for the right dock's Chat tab: the chat runtime hook (store
 * reads, mutation, streaming listeners) plus the app's Markdown pipeline
 * lent to the catalogued panel. Escape in the composer seats focus back on
 * the diff's scroll host, the same landing the dock uses on close, so the
 * Esc ladder keeps working from wherever the reviewer was typing.
 */

import { ChatPanel } from "@nod/ui/chat-panel";
import { useReviewChat } from "../../hooks/use-review-chat.ts";
import type { ChangedFile, PullRequest } from "../../types.ts";
import { Markdown } from "../markdown-loader.tsx";

const noop = () => undefined;

interface ChatTabProps {
  files: readonly ChangedFile[];
  focusSeq: number;
  pr: PullRequest;
}

export function ChatTab({ files, focusSeq, pr }: ChatTabProps) {
  const chat = useReviewChat({ files, pr });

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
      chips={[]}
      composerValue={chat.draft}
      focusSeq={focusSeq}
      onChangeComposer={chat.setDraft}
      onEscape={focusScrollHost}
      onRemoveChip={noop}
      onSend={chat.send}
      onStop={chat.stop}
      pending={chat.pending}
      renderMarkdown={renderMarkdown}
      turns={chat.panelTurns}
    />
  );
}
