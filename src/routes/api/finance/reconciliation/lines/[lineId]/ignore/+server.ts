import { json } from "@sveltejs/kit";
import { financeReconciliationDb } from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const lineId = Number(params.lineId);
    if (!lineId) return json({ error: "Invalid line id" }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const success = financeReconciliationDb.ignoreLine(lineId, body?.note);
    if (!success) return json({ error: "Line not found" }, { status: 404 });
    return json({ success: true });
  } catch (error) {
    console.error("Error ignoring reconciliation line:", error);
    return json({ error: "Failed to ignore reconciliation line" }, { status: 500 });
  }
};
