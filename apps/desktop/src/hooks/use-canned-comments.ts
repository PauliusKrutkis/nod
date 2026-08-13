/**
 * The saved canned comments, live. Every mounted composer subscribes, so an
 * edit in the ⌘; dialog reaches a composer that is already open — including
 * the one the reviewer is typing in at that moment.
 */
import { useSyncExternalStore } from "react";
import {
  getCannedComments,
  subscribeCannedComments,
} from "../lib/canned-comments.ts";

export function useCannedComments(): string[] {
  return useSyncExternalStore(subscribeCannedComments, getCannedComments);
}
