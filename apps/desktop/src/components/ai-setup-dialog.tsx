/**
 * BYOK setup for the ask-about-code feature (docs/AI.md). The dialog has two
 * faces because it answers two different questions. With no key stored it is
 * onboarding: provider preset → base URL → key, and the primary action saves.
 * With a key stored the question is only ever "which model", so the connection
 * becomes a row you read rather than a field you fill, the model list loads on
 * open, and the picker is the control focus lands on.
 *
 * The key is write-only from here — the backend never returns it, and saving
 * with an empty key keeps the stored one, which is why the saved row can name
 * the provider and confirm a key exists but can never show one. Pasting the
 * key is the consent act; the disclosure line under the key input is the one
 * place that promise is made, per the 2026-08-01 privacy decision.
 *
 * Keyboard follows the watch-repos pattern: DOM focus stays on the model
 * picker, Tab arms an action instead of wandering focus, and the footer names
 * what Enter will do so pressing it is never a guess. Remove is a two-step arm
 * for the same reason comment delete is: finding your key again is the
 * expensive half of an accidental click.
 */

import { Kbd } from "@nod/ui/kbd";
import { useModalDialog } from "@nod/ui/use-modal-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import { useArmedRing } from "../hooks/use-armed-ring.ts";
import { useHotkeys } from "../keyboard/use-hotkeys.ts";
import { api } from "../lib/api.ts";
import { cn } from "../lib/cn.ts";
import { queryKeys } from "../lib/query-client.ts";
import type { AiInfo, AiModel } from "../types.ts";

const PRESETS = [
  { id: "nexos", label: "Nexos AI", url: "https://api.nexos.ai" },
  { id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api" },
] as const;

type ArmedAction = "done" | "remove" | "replace" | null;

const ARM_ORDER: ArmedAction[] = [null, "replace", "remove", "done"];

function presetFor(baseUrl: string): string {
  return PRESETS.find((p) => p.url === baseUrl)?.id ?? "custom";
}

function providerLabel(baseUrl: string): string {
  return PRESETS.find((p) => p.url === baseUrl)?.label ?? "Custom provider";
}

function providerHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

function contextLabel(model: AiModel): string {
  if (!model.contextLength) {
    return model.id;
  }
  return `${model.id} · ${Math.round(model.contextLength / 1000)}k context`;
}

function armedEnterLabel(armed: ArmedAction, removeArmed: boolean): string {
  if (armed === "replace") {
    return "replace key";
  }
  if (armed === "remove") {
    return removeArmed ? "confirm removal" : "remove key";
  }
  if (armed === "done") {
    return "close";
  }
  return "";
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
  const modelRef = useRef<HTMLSelectElement>(null);
  const initialBaseUrl = info.baseUrl ?? PRESETS[0].url;
  const [editingKey, setEditingKey] = useState(!info.configured);
  const [preset, setPreset] = useState(() => presetFor(initialBaseUrl));
  const [model, setModel] = useState(info.model);
  const [removeArmed, setRemoveArmed] = useState(false);
  const { armed, cycle, setArmed } = useArmedRing<ArmedAction>(ARM_ORDER, null);
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    onClose,
    editingKey ? keyRef : modelRef
  );

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
    mutationFn: async () => {
      await api.setAiConfig({
        apiKey: keyRef.current?.value ?? "",
        baseUrl: baseUrlRef.current?.value ?? "",
        model,
      });
      return api.aiListModels();
    },
    onSuccess: (list) => {
      queryClient.setQueryData(queryKeys.aiModels, list);
      if (!list.some((m) => m.id === model)) {
        setModel(null);
      }
      setEditingKey(false);
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
      queryClient.removeQueries({ queryKey: queryKeys.aiModels });
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

  const startReplacingKey = () => {
    setArmed(null);
    setRemoveArmed(false);
    setEditingKey(true);
    requestAnimationFrame(() => keyRef.current?.focus());
  };

  const requestRemoveKey = () => {
    if (removeArmed) {
      removeKey.mutate();
      return;
    }
    setRemoveArmed(true);
  };

  const runArmedAction = () => {
    if (armed === "replace") {
      startReplacingKey();
      return;
    }
    if (armed === "remove") {
      requestRemoveKey();
      return;
    }
    if (armed === "done") {
      onClose();
    }
  };

  const onSavedKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      setRemoveArmed(false);
      cycle(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === "Enter" && armed !== null) {
      e.preventDefault();
      runArmedAction();
    }
  };

  const onKeyInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!saveKey.isPending) {
        saveKey.mutate();
      }
    }
  };

  const cancelReplacingKey = () => {
    setEditingKey(false);
    requestAnimationFrame(() => modelRef.current?.focus());
  };

  const error = saveKey.error ?? saveModel.error ?? removeKey.error ?? null;
  const enterLabel = armedEnterLabel(armed, removeArmed);

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
          Answers come from your provider, grounded in the PR you're reading.
        </p>
      </div>

      <div className="flex flex-col gap-3 px-5 py-4">
        {showSaved ? (
          <SavedConnection
            armed={armed}
            baseUrl={info.baseUrl ?? initialBaseUrl}
            onRemove={requestRemoveKey}
            onReplace={startReplacingKey}
            removeArmed={removeArmed}
            removePending={removeKey.isPending}
          />
        ) : (
          <KeyFields
            baseUrlRef={baseUrlRef}
            configured={info.configured}
            initialBaseUrl={initialBaseUrl}
            keyRef={keyRef}
            onKeyInputKeyDown={onKeyInputKeyDown}
            onPreset={applyPreset}
            onPresetChange={setPreset}
            preset={preset}
            providerName={providerLabel(initialBaseUrl)}
          />
        )}

        {showSaved && (
          <ModelField
            loading={models.isPending}
            model={model}
            models={models.data ?? []}
            onKeyDown={onSavedKeyDown}
            onPick={(id) => {
              setModel(id);
              saveModel.mutate(id);
            }}
            ref={modelRef}
          />
        )}

        {error && (
          <p className="text-danger text-xs" role="alert">
            {String(error)}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-line border-t px-5 py-3">
        {showSaved ? (
          <>
            <span
              aria-live="polite"
              className="text-faint text-xs"
              role="status"
            >
              <Kbd combo="tab" /> actions
              {enterLabel ? (
                <>
                  {" · "}
                  <Kbd combo="enter" /> {enterLabel}
                </>
              ) : null}
              {" · "}
              <Kbd combo="esc" /> done
            </span>
            <button
              className={cn(
                "q-btn q-btn-quiet",
                armed === "done" && "qw-done-armed"
              )}
              data-armed={armed === "done"}
              onClick={onClose}
              tabIndex={-1}
              type="button"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <span className="text-faint text-xs">
              <Kbd combo="enter" /> save key
              {info.configured ? (
                <>
                  {" · "}
                  <Kbd combo="esc" /> keep the current one
                </>
              ) : null}
            </span>
            <div className="flex items-center gap-2">
              {info.configured && (
                <button
                  className="q-btn q-btn-ghost"
                  onClick={cancelReplacingKey}
                  type="button"
                >
                  Cancel
                </button>
              )}
              <button
                className="q-btn q-btn-primary"
                disabled={saveKey.isPending}
                onClick={() => saveKey.mutate()}
                type="button"
              >
                {saveKey.isPending ? "Saving…" : "Save key"}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

function SavedConnection({
  armed,
  baseUrl,
  onRemove,
  onReplace,
  removeArmed,
  removePending,
}: {
  armed: ArmedAction;
  baseUrl: string;
  onRemove: () => void;
  onReplace: () => void;
  removeArmed: boolean;
  removePending: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-semibold text-[11px] text-faint uppercase tracking-wide">
        Provider
      </span>
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
        <span
          aria-hidden
          className="size-[7px] shrink-0 rounded-full bg-success"
        />
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold text-[13px] text-fg">
            {providerLabel(baseUrl)}
          </span>
          <span className="truncate font-mono text-[11px] text-faint">
            {providerHost(baseUrl)} · key saved
          </span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            className={cn(
              "q-btn q-btn-quiet",
              armed === "replace" && "qw-done-armed"
            )}
            data-armed={armed === "replace"}
            onClick={onReplace}
            tabIndex={-1}
            type="button"
          >
            Replace key
          </button>
          <button
            className={cn(
              "q-btn",
              removeArmed ? "q-btn-danger" : "q-btn-quiet",
              armed === "remove" && "qw-done-armed"
            )}
            data-armed={armed === "remove"}
            disabled={removePending}
            onClick={onRemove}
            tabIndex={-1}
            type="button"
          >
            {removeArmed ? "Remove key?" : "Remove"}
          </button>
        </span>
      </div>
    </div>
  );
}

function ModelField({
  loading,
  model,
  models,
  onKeyDown,
  onPick,
  ref,
}: {
  loading: boolean;
  model: string | null;
  models: AiModel[];
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  onPick: (id: string) => void;
  ref: React.Ref<HTMLSelectElement>;
}) {
  const selected = models.find((m) => m.id === model);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-semibold text-[11px] text-faint uppercase tracking-wide">
        Model
      </span>
      <select
        aria-label="Model"
        className="q-input font-mono"
        onChange={(e) => onPick(e.target.value)}
        onKeyDown={onKeyDown}
        ref={ref}
        value={model ?? ""}
      >
        <option disabled value="">
          {loading ? "Loading models…" : "Choose a model…"}
        </option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {contextLabel(m)}
          </option>
        ))}
      </select>
      <span className="text-[11px] text-faint">
        {modelHint(loading, models.length, selected)}
      </span>
    </div>
  );
}

function modelHint(
  loading: boolean,
  count: number,
  selected: AiModel | undefined
): string {
  if (loading) {
    return "Loading the models this key can reach.";
  }
  if (count === 0) {
    return "No chat models found for this key.";
  }
  const available = `${count} available`;
  if (!selected?.contextLength) {
    return available;
  }
  return `${Math.round(selected.contextLength / 1000)}k context · ${available}`;
}

function KeyFields({
  baseUrlRef,
  configured,
  initialBaseUrl,
  keyRef,
  onKeyInputKeyDown,
  onPreset,
  onPresetChange,
  preset,
  providerName,
}: {
  baseUrlRef: React.Ref<HTMLInputElement>;
  configured: boolean;
  initialBaseUrl: string;
  keyRef: React.Ref<HTMLInputElement>;
  onKeyInputKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onPreset: (id: string, url: string) => void;
  onPresetChange: (id: string) => void;
  preset: string;
  providerName: string;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            aria-pressed={preset === p.id}
            className={cn(
              "q-btn q-btn-quiet",
              preset === p.id && "border-accent text-accent"
            )}
            key={p.id}
            onClick={() => onPreset(p.id, p.url)}
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
          onClick={() => onPresetChange("custom")}
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
        onChange={(e) => onPresetChange(presetFor(e.target.value))}
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
          placeholder={configured ? `New key for ${providerName}` : "nexos-…"}
          ref={keyRef}
          spellCheck={false}
          type="password"
        />
        <p className="mt-2 text-faint text-xs">
          Asking sends the selected code, file paths, and line numbers to this
          provider. Nothing is sent until you ask.
        </p>
      </div>
    </>
  );
}
