import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLedgerConfig, writeLedgerConfig } from "./config.ts";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

const makeRoot = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "ledger-config-test-"));
  dirs.push(dir);
  return dir;
};

const writeRaw = async (root: string, json: string) => {
  await mkdir(join(root, ".ledger"), { recursive: true });
  await writeFile(join(root, ".ledger", "config.json"), json);
};

describe("ledger config", () => {
  it("round-trips approvalsRequired", async () => {
    const root = await makeRoot();
    await writeLedgerConfig(root, {
      approvalsRequired: 2,
      epoch: "a".repeat(40),
      version: 1,
    });
    expect(await readLedgerConfig(root)).toMatchObject({
      approvalsRequired: 2,
      version: 1,
    });
  });

  it("accepts a config without the optional field", async () => {
    const root = await makeRoot();
    await writeRaw(root, `{"version":1,"epoch":"${"b".repeat(40)}"}`);
    const config = await readLedgerConfig(root);
    expect(config?.approvalsRequired).toBeUndefined();
  });

  it("rejects a non-positive or fractional threshold loudly", async () => {
    const root = await makeRoot();
    await writeRaw(
      root,
      `{"version":1,"epoch":"${"c".repeat(40)}","approvalsRequired":0}`
    );
    await expect(readLedgerConfig(root)).rejects.toThrow("invalid");
  });

  it("returns null when no ledger exists", async () => {
    expect(await readLedgerConfig(await makeRoot())).toBeNull();
  });
});
