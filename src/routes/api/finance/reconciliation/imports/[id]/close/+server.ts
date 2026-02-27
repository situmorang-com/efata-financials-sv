import { json } from "@sveltejs/kit";
import { financeReconciliationDb } from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const id = Number(params.id);
    if (!id) return json({ error: "Invalid import id" }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const result = financeReconciliationDb.closeImport(id, body?.note);
    if (!result.success) {
      return json({ error: result.reason || "Failed to close reconciliation" }, { status: 400 });
    }
    return json({ success: true });
  } catch (error) {
    console.error("Error closing reconciliation import:", error);
    return json({ error: "Failed to close reconciliation import" }, { status: 500 });
  }
};
