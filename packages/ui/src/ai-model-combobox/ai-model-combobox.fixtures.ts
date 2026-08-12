/**
 * The picker's states are the ones the dialog around it cannot reach: an open
 * list, a list narrowed by a query, and the free-text row that appears only
 * when what you typed is not in the list. Those seed through initialOpen and
 * initialQuery rather than being scripted, so each is a first-paint render.
 *
 * `crowd-120` and `overflow` are the two that have broken a model picker
 * before — a provider returning hundreds, and a single id with no break
 * opportunity — and both also shoot narrow, because the id column has to
 * ellipsize instead of pushing the context chip off the row.
 * `markup-as-text` is the security case: a provider that names a model
 * `<img …>` must render the tag, never mount it.
 */
import { defineEntry } from "../fixtures/fixtures.ts";
import { AiModelCombobox, type AiSetupModel } from "./ai-model-combobox.tsx";

const noop = () => {
  return;
};

const shared = {
  loading: false,
  onCommit: noop,
  onKeyDownFallthrough: noop,
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

export const aiModelComboboxEntry = defineEntry(AiModelCombobox, {
  closed: { props: { ...shared, models: TYPICAL, value: "gpt-4o" } },
  "crowd-120": {
    props: {
      ...shared,
      initialOpen: true,
      initialQuery: "",
      models: MANY,
      value: "vendor-77/model-77-instruct",
    },
  },
  filtered: {
    props: {
      ...shared,
      initialOpen: true,
      initialQuery: "son",
      models: TYPICAL,
      value: "gpt-4o",
    },
  },
  "free-text": {
    props: {
      ...shared,
      initialOpen: true,
      initialQuery: "internal/unlisted-model-v3",
      models: TYPICAL,
      value: "gpt-4o",
    },
  },
  loading: {
    props: { ...shared, loading: true, models: [], value: null },
  },
  "markup-as-text": {
    props: {
      ...shared,
      initialOpen: true,
      initialQuery: "",
      models: [
        { contextLength: 8000, id: '<img src=x onerror="alert(1)">' },
        ...TYPICAL,
      ],
      value: '<img src=x onerror="alert(1)">',
    },
  },
  "open-typical": {
    props: {
      ...shared,
      initialOpen: true,
      initialQuery: "",
      models: TYPICAL,
      value: "gpt-4o",
    },
  },
  overflow: {
    props: {
      ...shared,
      initialOpen: true,
      initialQuery: "",
      models: [{ contextLength: 1_048_576, id: LONG_ID }, ...TYPICAL],
      value: LONG_ID,
    },
  },
  unicode: {
    props: {
      ...shared,
      initialOpen: true,
      initialQuery: "",
      models: [
        { contextLength: 32_000, id: "さくら-モデル-大" },
        { contextLength: 8000, id: "نموذج-عربي" },
        { contextLength: null, id: "🚀-turbo" },
      ],
      value: "さくら-モデル-大",
    },
  },
});
