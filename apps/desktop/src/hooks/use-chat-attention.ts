import { useState } from "react";
import { useAppStore } from "../store/app-store.ts";

/**
 * What the header's info button should say about the chat: "working" while a
 * turn streams, "done" for a turn that finished while the chat was out of
 * sight — held until the chat is looked at, because the whole point is
 * telling a reviewer who kept the dock closed that the answer is waiting.
 * "done" is a transition, not a derivation: it exists only because a busy →
 * idle edge happened unseen. The edge is caught by adjusting state during
 * render against the previous busy value — the React-sanctioned shape for
 * reacting to a changed input, and one the compiler can optimize where an
 * effect setting state cannot.
 */
export function useChatAttention(
  prKey: string,
  rightOpen: boolean,
  rightTab: string
): "working" | "done" | null {
  const chatVisible = rightOpen && rightTab === "chat";
  const busy = useAppStore((s) => s.chatBusy[prKey] ?? false);
  const [prevBusy, setPrevBusy] = useState(busy);
  const [unseen, setUnseen] = useState(false);
  if (busy !== prevBusy) {
    setPrevBusy(busy);
    if (prevBusy && !chatVisible) {
      setUnseen(true);
    }
  }
  if (chatVisible && unseen) {
    setUnseen(false);
  }
  if (busy) {
    return "working";
  }
  return unseen ? "done" : null;
}
