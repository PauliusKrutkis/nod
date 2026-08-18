/**
 * The provider presets the setup dialog offers, and the base URL a fresh
 * install starts from. Beside the component rather than in it so the
 * component file exports components only.
 */

export const AI_PRESETS = [
  { id: "nexos", label: "Nexos AI", url: "https://api.nexos.ai" },
  { id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api" },
] as const;

export const AI_DEFAULT_BASE_URL = AI_PRESETS[0].url;
