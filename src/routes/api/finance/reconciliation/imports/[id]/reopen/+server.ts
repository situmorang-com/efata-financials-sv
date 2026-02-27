import { json } from "@sveltejs/kit";
import { financeReconciliationDb } from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const id = Number(params.id);
    if (!id) return json({ error: "Invalid import id" }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const success = financeReconciliationDb.reopenImport(id, body?.note);
    if (!success) return json({ error: "Import not found" }, { status: 404 });
    return json({ success: true });
  } catch (error) {
    console.error("Error reopening reconciliation import:", error);
    return json({ error: "Failed to reopen reconciliation import" }, { status: 500 });
  }
};
