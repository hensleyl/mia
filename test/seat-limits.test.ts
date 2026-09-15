/**
 * The 2–8 seat limit must live in exactly one place: `src/shared/mia.ts`.
 *
 * Issue #8 was five copies of the same pair — the lobby, the D1 `max_players`
 * default, the Durable Object cap, the start gate and the client copy — where
 * changing one and missing another is a silent mismatch. The runtime tests
 * cover the worker's behaviour; this guard stops a consumer from quietly
 * growing its own literal again.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MAX_PLAYERS, MIN_PLAYERS } from "../src/shared/mia";

const CONSUMERS = [
  "src/worker/index.ts",
  "src/worker/table-room.ts",
  "src/worker/db.ts",
  "client/src/table.ts",
  "scripts/bots.ts",
];

function read(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
}

describe("seat-limit constants", () => {
  it("keeps the canonical pair in the shared rules module", () => {
    expect(MIN_PLAYERS).toBe(2);
    expect(MAX_PLAYERS).toBe(8);
  });

  it("leaves no hardcoded seat limit in any consumer", () => {
    for (const file of CONSUMERS) {
      const source = read(file);
      expect(source, `${file} defines its own limit`).not.toMatch(/\b(?:MIN|MAX)_PLAYERS\s*=\s*\d+/);
      expect(source, `${file} hardcodes the D1 schema default`).not.toMatch(
        /max_players\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+\d+/i,
      );
      expect(source, `${file} hardcodes the cap in copy`).not.toMatch(/of\s+\d+\s+seats?/i);
      expect(source, `${file} hardcodes a seat-count comparison`).not.toMatch(
        /players(?:\.length)?\s*[<>]=?\s*\d+/,
      );
      expect(source, `${file} hardcodes the minimum in copy`).not.toMatch(/at least\s+\d+\s+players?/i);
      expect(source, `${file} hardcodes the bot seat count`).not.toMatch(/from\s+1\s+to\s+\d+/i);
    }
  });

  it("reads the limit from the shared constants", () => {
    for (const file of CONSUMERS) {
      expect(read(file), `${file} should reference the shared constants`).toMatch(/\b(?:MIN|MAX)_PLAYERS\b/);
    }
  });
});
