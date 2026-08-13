/**
 * Builds the composer's ghost-text extension. Two gates decide whether it ever
 * asks for anything: the reviewer turned completion on, and a model is
 * actually configured. Neither is checked when the extension is built — both
 * are read at request time, straight from the stores that own them: the
 * preference from its snapshot-and-subscribe module, the config from the query
 * cache the hook's own useQuery keeps filled.
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
import { useQuery } from "@tanstack/react-query";
import type { Extensions } from "@tiptap/core";
import { useMemo, useSyncExternalStore } from "react";
import {
  getAiCompletionEnabled,
  subscribeAiCompletion,
} from "../lib/ai-completion.ts";
import { api } from "../lib/api.ts";
import { queryClient, queryKeys } from "../lib/query-client.ts";
import type { AiInfo } from "../types.ts";

export function useAiCompletionEnabled(): boolean {
  return useSyncExternalStore(subscribeAiCompletion, getAiCompletionEnabled);
}

function bothGatesOpen(): boolean {
  const info = queryClient.getQueryData<AiInfo>(queryKeys.aiConfig);
  return getAiCompletionEnabled() && !!info?.configured && !!info.model;
}

export function useAiCompletion(context: {
  code?: string;
  filePath?: string;
}): Extensions {
  const enabled = useAiCompletionEnabled();
  useQuery({
    enabled,
    queryFn: api.getAiConfig,
    queryKey: queryKeys.aiConfig,
  });
  const { code, filePath } = context;

  return useMemo(
    () => [
      ghostText({
        request: (prefix) =>
          bothGatesOpen()
            ? api.aiComplete({ context: { code, filePath }, prefix })
            : Promise.resolve(""),
      }),
    ],
    [code, filePath]
  );
}
