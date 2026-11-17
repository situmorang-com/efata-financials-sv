import { fail } from "@sveltejs/kit";
import { giverStatementDb } from "$lib/server/db.js";
import { requireUser } from "$lib/server/require-user.js";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requireUser(event);
  return { givers: giverStatementDb.listGivers(), origin: event.url.origin };
};

export const actions: Actions = {
  /** New link + PIN for a giver. The PIN is returned once and never stored in clear. */
  create: async (event) => {
    await requireUser(event);
    const form = await event.request.formData();
    const giverKey = String(form.get("giver_key") || "");
    if (!giverKey) return fail(400, { error: "Pemberi tidak dipilih." });
    try {
      const { statement, pin } = giverStatementDb.createStatement(giverKey);
      return {
        created: {
          giver_key: giverKey,
          giver_name: statement.giver_name,
          link: `${event.url.origin}/g/${statement.token}`,
          pin,
        },
      };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : "Gagal membuat link." });
    }
  },
};
