import { error, fail } from "@sveltejs/kit";
import { giverStatementDb } from "$lib/server/db.js";
import { requireUser } from "$lib/server/require-user.js";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requireUser(event);
  const statement = giverStatementDb.byId(Number(event.params.id));
  if (!statement) throw error(404, "Konfirmasi tidak ditemukan");
  const { pin_hash: _pin, ...safe } = statement;
  return { statement: safe, lines: giverStatementDb.diff(statement.id) };
};

export const actions: Actions = {
  /** Writes the giver's confirmed split into the books. */
  apply: async (event) => {
    await requireUser(event);
    try {
      return { applied: giverStatementDb.apply(Number(event.params.id)) };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : "Gagal menerapkan." });
    }
  },
};
