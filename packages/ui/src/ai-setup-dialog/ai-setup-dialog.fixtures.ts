/**
 * The dialog has two faces and a fetch behind one of them, so the cases are
 * the cross product that matters: onboarding with nothing stored, a stored
 * key with the picker loaded, the same key being replaced, and the picker's
 * four fetch states (loading, unreachable, none found, the long tail).
 *
 * `overflow` is the pair that has broken this panel — a model id with no
 * break opportunity and a base URL that is one unbreakable token — which used
 * to drag the panel wider than the screen. The picker's own hostile cases
 * moved down to ai-model-combobox with the control; what stays here is the
 * panel around it, which is why the same names appear at both levels.
 * `markup-as-text` is the security case: a provider that names a model
 * `<img …>` must render the tag, never mount it.
 *
 * No fixture carries an API key, and none can: the key is component state
 * that leaves only through onSaveKey, which is the same promise the
 * disclosure line makes to the user.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import {
  AI_DEFAULT_BASE_URL,
  AiSetupDialog,
  type AiSetupModel,
} from "./ai-setup-dialog.tsx";

const noop = () => {
  return;
};

const shared = {
  onCancelEditKey: noop,
  onEditKey: noop,
  onOpenChange: noop,
  onPickModel: noop,
  onRemoveKey: noop,
  onSaveKey: noop,
  open: true,
};

const saved = {
  ...shared,
  baseUrl: AI_DEFAULT_BASE_URL,
  configured: true,
  editingKey: false,
};

const onboarding = {
  ...shared,
  baseUrl: AI_DEFAULT_BASE_URL,
  configured: false,
  editingKey: true,
  model: null,
  models: undefined,
};

const TYPICAL: AiSetupModel[] = [
  { contextLength: 128_000, id: "gpt-4o" },
  { contextLength: 200_000, id: "claude-sonnet-4" },
  { contextLength: null, id: "mistral-large" },
];

const MANY: AiSetupModel[] = Array.from({ length: 120 }, (_, i) => ({
  contextLength: i % 4 === 0 ? null : (8 + i) * 1000,
  id: `vendor-${i}/model-${i}-instruct`,
}));

const LONG_ID = `meta-llama/${"llama-3.1-405b-instruct-".repeat(24)}free`;

export const aiSetupDialogEntry = defineEntry(
  AiSetupDialog,
  {
    "crowd-120": {
      props: { ...saved, model: "vendor-77/model-77-instruct", models: MANY },
    },
    "loading-models": {
      props: { ...saved, model: "gpt-4o", models: undefined },
    },
    "markup-as-text": {
      props: {
        ...saved,
        error: '<img src=x onerror="alert(1)"> failed',
        model: '<img src=x onerror="alert(1)">',
        models: [
          { contextLength: 8000, id: '<img src=x onerror="alert(1)">' },
          ...TYPICAL,
        ],
      },
    },
    "no-models": { props: { ...saved, model: null, models: [] } },
    overflow: {
      props: {
        ...saved,
        baseUrl: `https://${"gateway-region-eu-central-".repeat(30)}.example.com`,
        model: LONG_ID,
        models: [{ contextLength: 1_048_576, id: LONG_ID }, ...TYPICAL],
      },
    },
    removing: {
      props: { ...saved, model: "gpt-4o", models: TYPICAL, removing: true },
    },
    "replacing-key": {
      props: {
        ...saved,
        configured: true,
        editingKey: true,
        model: "gpt-4o",
        models: TYPICAL,
      },
    },
    "saved-key": { props: { ...saved, model: "gpt-4o", models: TYPICAL } },
    saving: { props: { ...onboarding, saving: true } },
    unconfigured: { props: onboarding },
    unicode: {
      props: {
        ...saved,
        baseUrl: "https://推論.example.jp/api",
        error: "مزود غير متاح · 藤本 さくら 👨‍👩‍👧‍👦",
        model: "さくら-モデル-大",
        models: [
          { contextLength: 32_000, id: "さくら-モデル-大" },
          { contextLength: 8000, id: "نموذج-عربي" },
          { contextLength: null, id: "🚀-turbo" },
        ],
      },
    },
    unreachable: {
      props: {
        ...saved,
        error: "provider unreachable: connect ETIMEDOUT 10.0.0.1:443",
        model: "gpt-4o",
        models: null,
      },
    },
    "validation-error": {
      props: {
        ...onboarding,
        configured: true,
        error: "401 Unauthorized — that key was rejected by the provider.",
      },
    },
  },
  { dialog: true }
);
