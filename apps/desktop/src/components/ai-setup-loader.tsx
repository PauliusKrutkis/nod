import {
  AI_DEFAULT_BASE_URL,
  AiSetupDialog as AiSetupDialogView,
} from "@nod/ui/ai-setup-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useHotkeys } from "../keyboard/use-hotkeys.ts";
import { api } from "../lib/api.ts";
import { queryKeys } from "../lib/query-client.ts";
import type { AiInfo } from "../types.ts";

/**
 * Config query, the three write commands and the hotkey for the BYOK setup
 * dialog; the view is ai-setup-dialog, catalogued in @nod/ui. Nothing renders
 * until the config resolves, because "no key stored" and "not asked yet" are
 * the same shape on screen and the second one would flash the onboarding face
 * at somebody who is already set up.
 *
 * Which face is showing is owned here rather than by the view: saving a key
 * is what closes the key field, and that resolution happens on this side. The
 * model picker is optimistic for the same reason the watched list is — the
 * write is a round trip through the provider, and the picker must not snap
 * back to the old id while it runs.
 *
 * The model list is fetched once per key (staleTime infinite, seeded straight
 * from the save so the picker is populated the moment the field closes) and
 * handed over as one prop: undefined while loading, null only when the fetch
 * failed with nothing cached — a later failure that still has a cached list
 * keeps showing the list, because "we couldn't reach the provider just now"
 * is not "this key has no models".
 */
export function AiSetupLoader({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data: info } = useQuery({
    enabled: open,
    queryFn: api.getAiConfig,
    queryKey: queryKeys.aiConfig,
  });

  if (!(open && info)) {
    return null;
  }

  return <AiSetupLoaderContent info={info} onClose={onClose} />;
}

function AiSetupLoaderContent({
  info,
  onClose,
}: {
  info: AiInfo;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const savedBaseUrl = info.baseUrl ?? AI_DEFAULT_BASE_URL;
  const [editingKey, setEditingKey] = useState(!info.configured);
  const [pickedModel, setPickedModel] = useState<string | null>(null);

  useHotkeys(
    "ai-setup",
    [{ description: "Close", hidden: true, keys: "esc", run: () => onClose() }],
    { enabled: true }
  );

  const showSaved = info.configured && !editingKey;

  const models = useQuery({
    enabled: showSaved,
    queryFn: api.aiListModels,
    queryKey: queryKeys.aiModels,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const invalidateConfig = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.aiConfig });

  const saveKey = useMutation({
    mutationFn: async (input: { apiKey: string; baseUrl: string }) => {
      await api.setAiConfig({
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: pickedModel ?? info.model,
      });
      return api.aiListModels();
    },
    onSuccess: (list) => {
      queryClient.setQueryData(queryKeys.aiModels, list);
      setEditingKey(false);
      invalidateConfig();
    },
  });

  const saveModel = useMutation({
    mutationFn: (id: string) =>
      api.setAiConfig({ apiKey: "", baseUrl: savedBaseUrl, model: id }),
    onSuccess: () => invalidateConfig(),
  });

  const removeKey = useMutation({
    mutationFn: api.clearAiConfig,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.aiModels });
      invalidateConfig();
      onClose();
    },
  });

  const onOpenChange = (next: boolean) => {
    if (!next) {
      onClose();
    }
  };

  const onPickModel = (id: string) => {
    setPickedModel(id);
    saveModel.mutate(id);
  };

  const onEditKey = () => setEditingKey(true);
  const onCancelEditKey = () => setEditingKey(false);

  const error =
    saveKey.error ?? saveModel.error ?? removeKey.error ?? models.error ?? null;

  return (
    <AiSetupDialogView
      baseUrl={savedBaseUrl}
      configured={info.configured}
      editingKey={editingKey}
      error={error === null ? null : String(error)}
      model={pickedModel ?? info.model}
      models={models.data ?? (models.isError ? null : undefined)}
      onCancelEditKey={onCancelEditKey}
      onEditKey={onEditKey}
      onOpenChange={onOpenChange}
      onPickModel={onPickModel}
      onRemoveKey={removeKey.mutate}
      onSaveKey={saveKey.mutate}
      open
      removing={removeKey.isPending}
      saving={saveKey.isPending}
    />
  );
}
