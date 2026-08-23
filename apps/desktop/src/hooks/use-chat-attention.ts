import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/app-store.ts";

/**
 * What the header's info button should say about the chat: "working" while a
 * turn streams, "done" for a turn that finished while the chat was out of
 * sight — held until the chat is looked at, because the whole point is
 * telling a reviewer who kept the dock closed that the answer is waiting.
 * "done" is a transition, not a derivation: it exists only because a busy →
 * idle edge happened unseen, so it is state, set on the edge.
 */
export function useChatAttention(
  prKey: string,
  rightOpen: boolean,
  rightTab: string
): "working" | "done" | null {
  const chatVisible = rightOpen && rightTab === "chat";
  const busy = useAppStore((s) => s.chatBusy[prKey] ?? false);
  const [unseen, setUnseen] = useState(false);
  const busyPrev = useRef(false);
  useEffect(() => {
    if (busyPrev.current && !busy && !chatVisible) {
      setUnseen(true);
    }
    busyPrev.current = busy;
    if (chatVisible) {
      setUnseen(false);
    }
  }, [busy, chatVisible]);
  if (busy) {
    return "working";
  }
  return unseen ? "done" : null;
}
