/**
 * Regression for issue #25: the Durable Object must refuse a table upgrade that
 * carries no `X-Mia-Table-Id` rather than invent one.
 *
 * `fetch` used to fall back to the literal `"unknown"`, which `handleConnect`
 * stored in the lobby state. The `this.tableId() === ""` guards in `writeResults`
 * and `handleStart` could never match that value, so a finished game on such a
 * room wrote `games` / `game_players` rows against the guessed id. The Worker
 * always forwards the canonical id, so an upgrade without it is a Worker bug and
 * is now rejected.
 */
import { env, runInDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/worker/db";
import { TestTableRoom } from "./table-room-test";

describe("the table upgrade header contract", () => {
  beforeAll(async () => {
    await ensureSchema(env);
  });

  it("refuses an upgrade with no X-Mia-Table-Id and writes no guessed-id rows", async () => {
    const stub = env.TABLE.getByName(`table-${crypto.randomUUID()}`);

    // Drive the Durable Object directly, the way a buggy Worker that forgot the
    // header would: every other upgrade header is present.
    const response = await stub.fetch(
      new Request("https://mia.test/ws", {
        headers: {
          Upgrade: "websocket",
          "X-Mia-Player": crypto.randomUUID(),
          "X-Mia-Name": encodeURIComponent("Headerless Player"),
          "X-Mia-Table-Name": encodeURIComponent("Headerless Table"),
        },
      }),
    );

    // Refused, not accepted: no 101 and no socket.
    expect(response.status).toBe(400);
    expect(response.webSocket).toBeNull();

    // Nothing built a lobby, so no state can carry a guessed id forward.
    const state = await runInDurableObject(stub, async (instance) => {
      return await (instance as TestTableRoom).__stateForTest();
    });
    expect(state).toBeNull();

    // And the guessed sentinel never reached the result tables.
    const guessedGames = await env.DB.prepare(`SELECT COUNT(*) AS n FROM games WHERE id = ?1 OR table_id = ?1`)
      .bind("unknown")
      .first<{ n: number }>();
    expect(guessedGames?.n ?? 0).toBe(0);
    const guessedPlayers = await env.DB.prepare(`SELECT COUNT(*) AS n FROM game_players WHERE game_id = ?1`)
      .bind("unknown")
      .first<{ n: number }>();
    expect(guessedPlayers?.n ?? 0).toBe(0);
  });
});
