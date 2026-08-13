import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Repo-versioned settings (docs/LEDGER.md §6): `.ledger/` lives in the
 * worktree, reviewable like code. The epoch is the adoption line — commits
 * reachable from it are grandfathered out of the metric.
 */
export interface LedgerConfig {
  version: 1;
  epoch: string;
}

const CONFIG_PATH = ".ledger/config.json";

const isConfig = (value: unknown): value is LedgerConfig =>
  typeof value === "object" &&
  value !== null &&
  "version" in value &&
  value.version === 1 &&
  "epoch" in value &&
  typeof value.epoch === "string";

export const readLedgerConfig = async (
  repoRoot: string
): Promise<LedgerConfig | null> => {
  let raw: string;
  try {
    raw = await readFile(join(repoRoot, CONFIG_PATH), "utf8");
  } catch {
    return null;
  }
  const value: unknown = JSON.parse(raw);
  if (!isConfig(value)) {
    throw new Error(`invalid ${CONFIG_PATH}`);
  }
  return value;
};

export const writeLedgerConfig = async (
  repoRoot: string,
  config: LedgerConfig
): Promise<void> => {
  const target = join(repoRoot, CONFIG_PATH);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`);
};
