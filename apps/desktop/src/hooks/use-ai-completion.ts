/**
 * Builds the composer's ghost-text extension. Two gates decide whether it ever
 * asks for anything: the reviewer turned completion on, and a model is
 * actually configured. Neither is checked when the extension is built — they
 * are read at request time, through a ref.
 *
 * That indirection is not decoration. The editor is created once, on mount,
 * from the extensions it is handed then; handing it a different list later
 * does nothing, and the AI config arrives from a query a tick after the
 * composer opens. Gating at build time meant the extension was always missing
 * from the composer that actually got created. So the plugin is always
 * installed and always inert until both gates open — the cost of inert is one
 * cleared timer per keystroke, and no request ever leaves the app.
 *
 * The extension is memoized on the context it closes over for the same reason
 * in reverse: a new plugin each render would tear down the debounce and the
 * in-flight request, so a reviewer typing steadily would never hold still long
 * enough to see an answer.
 */
import { ghostText } from "@nod/ui/ghost-text";
import { useLatest } from "@nod/ui/use-latest";
import { useQuery } from "@tanstack/react-query";
import type { Extensions } from "@tiptap/core";
import { useMemo, useSyncExternalStore } from "react";
import {
  getAiCompletionEnabled,
  subscribeAiCompletion,
} from "../lib/ai-completion.ts";
import { api } from "../lib/api.ts";
import { queryKeys } from "../lib/query-client.ts";

export function useAiCompletionEnabled(): boolean {
  return useSyncExternalStore(subscribeAiCompletion, getAiCompletionEnabled);
}

export function useAiCompletion(context: {
  code?: string;
  filePath?: string;
}): Extensions {
  const enabled = useAiCompletionEnabled();
  const { data: info } = useQuery({
    enabled,
    queryFn: api.getAiConfig,
    queryKey: queryKeys.aiConfig,
  });
  const readyRef = useLatest(enabled && !!info?.configured && !!info.model);
  const { code, filePath } = context;

  return useMemo(
    () => [
      ghostText({
        request: (prefix) =>
          readyRef.current
            ? api.aiComplete({ context: { code, filePath }, prefix })
            : Promise.resolve(""),
      }),
    ],
    [code, filePath, readyRef]
  );
}
