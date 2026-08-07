/**
 * BYOK setup for the ask-about-code feature (docs/AI.md): provider preset →
 * base URL, API key, then a model picker fetched from the provider. Opened by
 * `a` in a review and from the command palette. The key is write-only from
 * here — the backend never returns it, and saving with an empty key keeps the
 * stored one, so the model can change without re-pasting. Pasting the key is
 * the consent act; the disclosure line under the key input is the one place
 * that promise is made, per the 2026-08-01 privacy decision.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import { useModalDialog } from "../hooks/use-modal-dialog.ts";
import { useHotkeys } from "../keyboard/use-hotkeys.ts";
import { api } from "../lib/api.ts";
import { cn } from "../lib/cn.ts";
import { queryKeys } from "../lib/query-client.ts";
import type { AiInfo, AiModel } from "../types.ts";

const PRESETS = [
  { id: "nexos", label: "Nexos AI", url: "https://api.nexos.ai" },
  { id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api" },
] as const;

function presetFor(baseUrl: string): string {
  return PRESETS.find((p) => p.url === baseUrl)?.id ?? "custom";
}

function contextLabel(model: AiModel): string {
  if (!model.contextLength) {
    return model.id;
  }
  return `${model.id} · ${Math.round(model.contextLength / 1000)}k context`;
}

export function AiSetupDialog({
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

  return <AiSetupDialogContent info={info} onClose={onClose} />;
}

function AiSetupDialogContent({
  info,
  onClose,
}: {
  info: AiInfo;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const baseUrlRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const initialBaseUrl = info.baseUrl ?? PRESETS[0].url;
  const [preset, setPreset] = useState(() => presetFor(initialBaseUrl));
  const [models, setModels] = useState<AiModel[] | null>(null);
  const [model, setModel] = useState(info.model);
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    onClose,
    keyRef
  );

  useHotkeys(
    "ai-setup",
    [{ description: "Close", hidden: true, keys: "esc", run: () => onClose() }],
    { enabled: true }
  );

  const invalidateConfig = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.aiConfig });

  const saveAndLoadModels = useMutation({
    mutationFn: async () => {
      await api.setAiConfig({
        apiKey: keyRef.current?.value ?? "",
        baseUrl: baseUrlRef.current?.value ?? "",
        model,
      });
      return api.aiListModels();
    },
    onSuccess: (list) => {
      setModels(list);
      const stillListed = list.some((m) => m.id === model);
      if (!stillListed) {
        setModel(null);
      }
      invalidateConfig();
    },
  });

  const saveModel = useMutation({
    mutationFn: (id: string) =>
      api.setAiConfig({
        apiKey: "",
        baseUrl: baseUrlRef.current?.value ?? initialBaseUrl,
        model: id,
      }),
    onSuccess: () => invalidateConfig(),
  });

  const removeKey = useMutation({
    mutationFn: api.clearAiConfig,
    onSuccess: () => {
      invalidateConfig();
      onClose();
    },
  });

  const applyPreset = (id: string, url: string) => {
    setPreset(id);
    if (baseUrlRef.current) {
      baseUrlRef.current.value = url;
    }
  };

  const onKeyInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!saveAndLoadModels.isPending) {
        saveAndLoadModels.mutate();
      }
    }
  };

  const error =
    saveAndLoadModels.error ?? saveModel.error ?? removeKey.error ?? null;

  return (
    <dialog
      aria-label="Ask about code"
      className="q-dialog q-dialog-top qw-panel"
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <div className="border-line border-b px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-semibold text-fg text-sm">
          <Sparkles aria-hidden className="text-accent" size={14} />
          Ask about code
        </h2>
        <p className="mt-0.5 text-muted text-xs">
          Bring your own key. Answers come from your provider, grounded in the
          PR you're reading.
        </p>
      </div>

      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              aria-pressed={preset === p.id}
              className={cn(
                "q-btn q-btn-quiet",
                preset === p.id && "border-accent text-accent"
              )}
              key={p.id}
              onClick={() => applyPreset(p.id, p.url)}
              type="button"
            >
              {p.label}
            </button>
          ))}
          <button
            aria-pressed={preset === "custom"}
            className={cn(
              "q-btn q-btn-quiet",
              preset === "custom" && "border-accent text-accent"
            )}
            onClick={() => {
              setPreset("custom");
              baseUrlRef.current?.focus();
            }}
            type="button"
          >
            Custom
          </button>
        </div>

        <input
          aria-label="Provider base URL"
          autoComplete="off"
          className="q-input font-mono"
          defaultValue={initialBaseUrl}
          onChange={(e) => setPreset(presetFor(e.target.value))}
          placeholder="https://api.nexos.ai"
          ref={baseUrlRef}
          spellCheck={false}
        />

        <div>
          <input
            aria-label="API key"
            autoComplete="off"
            className="q-input font-mono"
            onKeyDown={onKeyInputKeyDown}
            placeholder={
              info.configured ? "Key saved. Paste to replace." : "nexos-…"
            }
            ref={keyRef}
            spellCheck={false}
            type="password"
          />
          <p className="mt-2 text-faint text-xs">
            Asking sends the selected code, file paths, and line numbers to this
            provider. Nothing is sent until you ask.
          </p>
        </div>

        {models && models.length > 0 && (
          <select
            aria-label="Model"
            className="q-input"
            onChange={(e) => {
              setModel(e.target.value);
              saveModel.mutate(e.target.value);
            }}
            value={model ?? ""}
          >
            <option disabled value="">
              Choose a model…
            </option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {contextLabel(m)}
              </option>
            ))}
          </select>
        )}
        {models?.length === 0 && (
          <p className="text-faint text-xs">
            No chat models found for this key.
          </p>
        )}

        {error && (
          <p className="text-danger text-xs" role="alert">
            {String(error)}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-line border-t px-5 py-3">
        <div>
          {info.configured && (
            <button
              className="q-btn q-btn-ghost"
              disabled={removeKey.isPending}
              onClick={() => removeKey.mutate()}
              type="button"
            >
              Remove key
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="q-btn q-btn-ghost" onClick={onClose} type="button">
            {model && info.configured ? "Done" : "Cancel"}
          </button>
          <button
            className="q-btn q-btn-primary"
            disabled={saveAndLoadModels.isPending}
            onClick={() => saveAndLoadModels.mutate()}
            type="button"
          >
            {saveAndLoadModels.isPending
              ? "Loading models…"
              : "Save & load models"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
