#!/usr/bin/env node
/**
 * Probe an OpenAI-compatible provider (Nexos by default) for the two contract
 * facts docs/AI.md refuses to assume: does tool calling round-trip, and what
 * is the exact SSE chunk shape. Findings unblock PR 5 (tool loop) and PR 6
 * (streaming) of the ask-about-code sequence.
 *
 * Usage:
 *   NEXOS_API_KEY=nexos-… node scripts/probe-nexos.mjs [model-id]
 *   NEXOS_BASE_URL=https://… to point elsewhere (default https://api.nexos.ai)
 *
 * Read-only against your account except for two tiny completions (~100 tokens).
 */

const BASE = (process.env.NEXOS_BASE_URL ?? "https://api.nexos.ai").replace(
  /\/+$/,
  ""
);
const KEY = process.env.NEXOS_API_KEY;
if (!KEY) {
  console.error("Set NEXOS_API_KEY first.");
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

const PREFERRED_MODEL = /gpt-4o|sonnet|4\.1|mini/i;

async function pickModel() {
  if (process.argv[2]) {
    return process.argv[2];
  }
  const res = await fetch(`${BASE}/v1/models`, { headers: HEADERS });
  const body = await res.json();
  const models = (body.data ?? []).map((m) => m.id);
  console.log(`GET /v1/models → ${res.status}, ${models.length} models`);
  const sample = body.data?.[0];
  if (sample) {
    console.log(
      "first model entry keys:",
      Object.keys(sample).join(", "),
      "| endpoints:",
      JSON.stringify(sample.endpoints)
    );
  }
  const preferred = models.find((id) => PREFERRED_MODEL.test(id));
  return preferred ?? models[0];
}

const READ_FILE_TOOL = {
  type: "function",
  function: {
    name: "read_file",
    description: "Read a file from the repository by path.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
};

async function probeTools(model) {
  console.log(`\n=== tools probe (model: ${model}) ===`);
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    body: JSON.stringify({
      max_completion_tokens: 200,
      messages: [
        {
          role: "user",
          content:
            "Use the read_file tool to read src/main.rs. Do not answer directly.",
        },
      ],
      model,
      tools: [READ_FILE_TOOL],
    }),
    headers: HEADERS,
    method: "POST",
  });
  const text = await res.text();
  console.log(`status ${res.status}`);
  try {
    const body = JSON.parse(text);
    const message = body.choices?.[0]?.message;
    console.log("finish_reason:", body.choices?.[0]?.finish_reason);
    console.log(
      "message keys:",
      message ? Object.keys(message).join(", ") : "none"
    );
    console.log("tool_calls:", JSON.stringify(message?.tool_calls, null, 2));
  } catch {
    console.log("non-JSON body:", text.slice(0, 500));
  }
}

async function probeStreaming(model) {
  console.log(`\n=== streaming probe (model: ${model}) ===`);
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    body: JSON.stringify({
      max_completion_tokens: 30,
      messages: [{ role: "user", content: "Say 'hello world' and stop." }],
      model,
      stream: true,
    }),
    headers: HEADERS,
    method: "POST",
  });
  console.log(
    `status ${res.status}, content-type: ${res.headers.get("content-type")}`
  );
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let shown = 0;
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      if (shown < 4 || line.includes("[DONE]")) {
        console.log("raw line:", line.slice(0, 300));
        shown += 1;
      }
    }
  }
  console.log("(first chunks + terminator shown — that is the wire shape)");
}

const model = await pickModel();
if (!model) {
  console.error("No model available to probe.");
  process.exit(1);
}
await probeTools(model);
await probeStreaming(model);
console.log(
  "\nPaste this output into the session (or docs/AI.md § Probe) to unblock PRs 5–6."
);
