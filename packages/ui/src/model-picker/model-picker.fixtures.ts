/**
 * The picker's space is the provider's list: a short one, a crowd worth
 * scrolling, the loading gap before ids arrive, and the empty answer. The
 * hostile corners are the ids themselves — the probe found they can carry
 * spaces, parentheses and region suffixes (docs/AI.md § Probe findings), so
 * one fixture is a vendor-qualified monster and another is an unbreakable
 * token. The current model carries the check.
 */

import { defineEntry } from "../fixtures/fixtures.ts";
import { ModelPicker, type ModelPickerProps } from "./model-picker.tsx";

const noop = () => undefined;

const LONG_ID =
  "anthropic.claude-sonnet-4-5@20250929 (aoxy-analytics europe-west1)";

const base = (over: Partial<ModelPickerProps>): ModelPickerProps => ({
  current: "gpt-4o",
  models: [
    { contextLength: 128_000, id: "gpt-4o" },
    { contextLength: 200_000, id: "claude-sonnet-4-5" },
    { contextLength: 1_000_000, id: "gemini-2.5-pro" },
  ],
  onClose: noop,
  onPick: noop,
  ...over,
});

export const modelPickerEntry = defineEntry(ModelPicker, {
  crowd: {
    props: base({
      models: Array.from({ length: 40 }, (_, i) => ({
        contextLength: (i % 4) * 64_000 || null,
        id: `vendor-${i}/model-${i}-preview`,
      })),
    }),
  },
  empty: {
    props: base({ models: [] }),
  },
  loading: {
    props: base({ models: null }),
  },
  overflow: {
    props: base({
      current: LONG_ID,
      models: [
        { contextLength: 200_000, id: LONG_ID },
        { contextLength: null, id: `tok_${"9f8e7d6c".repeat(80)}` },
      ],
    }),
  },
  typical: {
    props: base({}),
  },
  unicode: {
    props: base({
      current: "モデル/日本語-4",
      models: [
        { contextLength: 32_000, id: "モデル/日本語-4" },
        { contextLength: 8000, id: "نموذج-عربي" },
      ],
    }),
  },
});
