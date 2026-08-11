/**
 * BYOK setup for the ask-about-code feature (docs/AI.md). The dialog has two
 * faces because it answers two different questions. With no key stored it is
 * onboarding: provider preset → base URL → key, and the primary action saves.
 * With a key stored the question is only ever "which model", so the connection
 * becomes a row you read rather than a field you fill and the picker is the
 * control focus lands on.
 *
 * The key is write-only from here — the backend never returns it, and saving
 * with an empty key keeps the stored one, which is why the saved row can name
 * the provider and confirm a key exists but can never show one. Pasting the
 * key is the consent act; the disclosure line under the key input is the one
 * place that promise is made, per the 2026-08-01 privacy decision. `apiKey`
 * therefore lives in this component and leaves only through `onSaveKey`; it is
 * deliberately not a prop, so no fixture and no host can ever hold one.
 *
 * `models` carries the three states of a fetch in one prop — `undefined` while
 * loading, `null` when the provider could not be reached with nothing cached,
 * an array (possibly empty) once it resolved — which is what lets "could not
 * list models" and "this key has no chat models" stay different sentences.
 * `editingKey` is the host's because the save that flips it is the host's: the
 * mutation resolves there, and the face must change with it.
 *
 * Keyboard follows the watch-repos pattern: DOM focus stays on the model
 * picker, Tab arms an action instead of wandering focus, and the footer names
 * what Enter will do so pressing it is never a guess. Remove is a two-step arm
 * for the same reason comment delete is: finding your key again is the
 * expensive half of an accidental click. Focus follows the face — the effect
 * moves it to whichever control the current face asks for, which covers all
 * three ways the face changes (replace, cancel, save resolving upstream) with
 * one rule; inline hosts are exempt, because a specimen that grabs focus
 * paints its focus ring into every capture.
 *
 * `inline` opens with show() instead of showModal() (see useModalDialog) and
 * `.qai-inline` returns the panel to normal flow for embedding hosts.
 */
import { Sparkles } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "../button/button.tsx";
import { cn } from "../cn/cn.ts";
import { Kbd } from "../kbd/kbd.tsx";
import { useArmedRing } from "../use-armed-ring/use-armed-ring.ts";
import { useModalDialog } from "../use-modal-dialog/use-modal-dialog.ts";
import "./ai-setup-dialog.css";

export const AI_PRESETS = [
  { id: "nexos", label: "Nexos AI", url: "https://api.nexos.ai" },
  { id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api" },
] as const;

export const AI_DEFAULT_BASE_URL = AI_PRESETS[0].url;

export interface AiSetupModel {
  contextLength: number | null;
  id: string;
}

type ArmedAction = "done" | "remove" | "replace" | null;

const ARM_ORDER: ArmedAction[] = [null, "replace", "remove", "done"];

function presetFor(baseUrl: string): string {
  return AI_PRESETS.find((p) => p.url === baseUrl)?.id ?? "custom";
}

function providerLabel(baseUrl: string): string {
  return AI_PRESETS.find((p) => p.url === baseUrl)?.label ?? "Custom provider";
}

function providerHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

function contextLabel(model: AiSetupModel): string {
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

function modelHint({
  models,
  selected,
}: {
  models: readonly AiSetupModel[] | null | undefined;
  selected: AiSetupModel | undefined;
}): string {
  if (models === undefined) {
    return "Loading the models this key can reach.";
  }
  if (models === null) {
    return "Could not reach the provider to list models. You can still type a model id.";
  }
  if (models.length === 0) {
    return "No chat models found for this key.";
  }
  const available = `${models.length} available`;
  if (!selected?.contextLength) {
    return available;
  }
  return `${Math.round(selected.contextLength / 1000)}k context · ${available}`;
}

export interface AiSetupDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  configured: boolean;
  baseUrl: string;
  model: string | null;
  models: readonly AiSetupModel[] | null | undefined;
  editingKey: boolean;
  onEditKey: () => void;
  onCancelEditKey: () => void;
  onSaveKey: (input: { apiKey: string; baseUrl: string }) => void;
  onPickModel: (id: string) => void;
  onRemoveKey: () => void;
  saving?: boolean;
  removing?: boolean;
  error?: string | null;
  inline?: boolean;
}

export function AiSetupDialog({ open, ...rest }: AiSetupDialogProps) {
  if (!open) {
    return null;
  }
  return <AiSetupDialogContent {...rest} />;
}

function AiSetupDialogContent({
  onOpenChange,
  configured,
  baseUrl,
  model,
  models,
  editingKey,
  onEditKey,
  onCancelEditKey,
  onSaveKey,
  onPickModel,
  onRemoveKey,
  saving = false,
  removing = false,
  error = null,
  inline = false,
}: Omit<AiSetupDialogProps, "open">) {
  const keyRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLSelectElement>(null);
  const [draftBaseUrl, setDraftBaseUrl] = useState(baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [preset, setPreset] = useState(() => presetFor(baseUrl));
  const [removeArmed, setRemoveArmed] = useState(false);
  const { armed, cycle, setArmed } = useArmedRing<ArmedAction>(ARM_ORDER, null);
  const faceRef = editingKey ? keyRef : modelRef;
  const { dialogRef, onDialogCancel, onDialogClose } = useModalDialog(
    () => {
      onOpenChange(false);
    },
    inline ? undefined : faceRef,
    { modal: !inline }
  );

  useEffect(() => {
    if (inline) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (editingKey) {
        keyRef.current?.focus();
      } else {
        modelRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [editingKey, inline]);

  const showSaved = configured && !editingKey;

  const close = () => {
    onOpenChange(false);
  };

  const save = () => {
    if (!saving) {
      onSaveKey({ apiKey, baseUrl: draftBaseUrl });
    }
  };

  const applyPreset = (id: string, url: string) => {
    setPreset(id);
    setDraftBaseUrl(url);
  };

  const startReplacingKey = () => {
    setArmed(null);
    setRemoveArmed(false);
    setApiKey("");
    onEditKey();
  };

  const requestRemoveKey = () => {
    if (removeArmed) {
      onRemoveKey();
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
      close();
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
      save();
    }
  };

  const enterLabel = armedEnterLabel(armed, removeArmed);

  return (
    <dialog
      aria-label="Ask about code"
      className={cn("q-dialog q-dialog-top qai-panel", inline && "qai-inline")}
      onCancel={onDialogCancel}
      onClose={onDialogClose}
      ref={dialogRef}
    >
      <div className="qai-head">
        <h2 className="qai-title">
          <Sparkles aria-hidden size={14} />
          Ask about code
        </h2>
        <p className="qai-sub">
          {configured
            ? "Answers come from your provider, grounded in the PR you're reading."
            : "Bring your own key. Answers come from your provider, grounded in the PR you're reading."}
        </p>
      </div>

      <div className="qai-body">
        {showSaved ? (
          <SavedConnection
            armed={armed}
            baseUrl={baseUrl}
            onRemove={requestRemoveKey}
            onReplace={startReplacingKey}
            removeArmed={removeArmed}
            removePending={removing}
          />
        ) : (
          <KeyFields
            baseUrl={draftBaseUrl}
            configured={configured}
            keyRef={keyRef}
            onApiKeyChange={setApiKey}
            onBaseUrlChange={setDraftBaseUrl}
            onKeyInputKeyDown={onKeyInputKeyDown}
            onPreset={applyPreset}
            onPresetChange={setPreset}
            preset={preset}
            providerName={providerLabel(baseUrl)}
            value={apiKey}
          />
        )}

        {showSaved && (
          <ModelField
            model={model}
            models={models}
            onKeyDown={onSavedKeyDown}
            onPick={onPickModel}
            ref={modelRef}
          />
        )}

        {error ? (
          <p className="qai-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="qai-foot">
        {showSaved ? (
          <>
            <span aria-live="polite" className="qai-foot-hint" role="status">
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
            <Button
              className={cn(armed === "done" && "qai-armed")}
              data-armed={armed === "done"}
              onClick={close}
              tabIndex={-1}
            >
              Done
            </Button>
          </>
        ) : (
          <>
            <span className="qai-foot-hint">
              <Kbd combo="enter" /> save key
              {configured ? (
                <>
                  {" · "}
                  <Kbd combo="esc" /> keep the current one
                </>
              ) : null}
            </span>
            <div className="qai-foot-actions">
              {configured && (
                <Button onClick={onCancelEditKey} variant="ghost">
                  Cancel
                </Button>
              )}
              <Button disabled={saving} onClick={save} variant="primary">
                {saving ? "Saving…" : "Save key"}
              </Button>
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
    <div className="qai-field">
      <span className="qai-label">Provider</span>
      <div className="qai-conn">
        <span aria-hidden className="qai-conn-dot" />
        <span className="qai-conn-main">
          <span className="qai-conn-name">{providerLabel(baseUrl)}</span>
          <span className="qai-conn-host">
            {providerHost(baseUrl)} · key saved
          </span>
        </span>
        <span className="qai-conn-actions">
          <Button
            className={cn(armed === "replace" && "qai-armed")}
            data-armed={armed === "replace"}
            onClick={onReplace}
            tabIndex={-1}
          >
            Replace key
          </Button>
          <Button
            className={cn(armed === "remove" && "qai-armed")}
            data-armed={armed === "remove"}
            disabled={removePending}
            onClick={onRemove}
            tabIndex={-1}
            variant={removeArmed ? "danger" : "quiet"}
          >
            {removeArmed ? "Remove key?" : "Remove"}
          </Button>
        </span>
      </div>
    </div>
  );
}

function ModelField({
  model,
  models,
  onKeyDown,
  onPick,
  ref,
}: {
  model: string | null;
  models: readonly AiSetupModel[] | null | undefined;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  onPick: (id: string) => void;
  ref: React.Ref<HTMLSelectElement>;
}) {
  const list = models ?? [];
  const selected = list.find((m) => m.id === model);

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onPick(e.target.value);
  };

  return (
    <div className="qai-field">
      <span className="qai-label">Model</span>
      <select
        aria-label="Model"
        className="qai-select"
        onChange={onChange}
        onKeyDown={onKeyDown}
        ref={ref}
        value={model ?? ""}
      >
        <option disabled value="">
          {models === undefined ? "Loading models…" : "Choose a model…"}
        </option>
        {list.map((m) => (
          <option key={m.id} value={m.id}>
            {contextLabel(m)}
          </option>
        ))}
      </select>
      <span className="qai-hint">{modelHint({ models, selected })}</span>
    </div>
  );
}

function KeyFields({
  baseUrl,
  configured,
  keyRef,
  onApiKeyChange,
  onBaseUrlChange,
  onKeyInputKeyDown,
  onPreset,
  onPresetChange,
  preset,
  providerName,
  value,
}: {
  baseUrl: string;
  configured: boolean;
  keyRef: React.Ref<HTMLInputElement>;
  onApiKeyChange: (v: string) => void;
  onBaseUrlChange: (v: string) => void;
  onKeyInputKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onPreset: (id: string, url: string) => void;
  onPresetChange: (id: string) => void;
  preset: string;
  providerName: string;
  value: string;
}) {
  const onBaseUrlInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onBaseUrlChange(e.target.value);
    onPresetChange(presetFor(e.target.value));
  };

  const onApiKeyInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onApiKeyChange(e.target.value);
  };

  const onCustom = () => {
    onPresetChange("custom");
  };

  return (
    <>
      <div className="qai-presets">
        {AI_PRESETS.map((p) => (
          <Button
            aria-pressed={preset === p.id}
            className={cn(preset === p.id && "qai-preset-on")}
            key={p.id}
            onClick={() => onPreset(p.id, p.url)}
          >
            {p.label}
          </Button>
        ))}
        <Button
          aria-pressed={preset === "custom"}
          className={cn(preset === "custom" && "qai-preset-on")}
          onClick={onCustom}
        >
          Custom
        </Button>
      </div>

      <input
        aria-label="Provider base URL"
        autoComplete="off"
        className="qai-input"
        onChange={onBaseUrlInput}
        placeholder="https://api.nexos.ai"
        spellCheck={false}
        value={baseUrl}
      />

      <div className="qai-keyfield">
        <input
          aria-label="API key"
          autoComplete="off"
          className="qai-input"
          onChange={onApiKeyInput}
          onKeyDown={onKeyInputKeyDown}
          placeholder={configured ? `New key for ${providerName}` : "nexos-…"}
          ref={keyRef}
          spellCheck={false}
          type="password"
          value={value}
        />
        <p className="qai-note">
          Asking sends the selected code, file paths, and line numbers to this
          provider. Nothing is sent until you ask.
        </p>
      </div>
    </>
  );
}
