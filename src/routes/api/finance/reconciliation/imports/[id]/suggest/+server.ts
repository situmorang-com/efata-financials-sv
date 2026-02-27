import { json } from "@sveltejs/kit";
import { financeReconciliationDb } from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const id = Number(params.id);
    if (!id) return json({ error: "Invalid import id" }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const autoMatch = Boolean(body?.auto_match);
    const updated = financeReconciliationDb.refreshSuggestions(id, autoMatch);
    return json({ updated });
  } catch (error) {
    console.error("Error refreshing reconciliation suggestions:", error);
    return json({ error: "Failed to refresh suggestions" }, { status: 500 });
  }
};
