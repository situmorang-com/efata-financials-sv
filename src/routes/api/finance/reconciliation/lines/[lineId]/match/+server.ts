import { json } from "@sveltejs/kit";
import { financeReconciliationDb } from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const lineId = Number(params.lineId);
    if (!lineId) return json({ error: "Invalid line id" }, { status: 400 });
    const body = await request.json();
    const txnId = Number(body?.txn_id);
    if (!txnId) return json({ error: "txn_id is required" }, { status: 400 });
    const success = financeReconciliationDb.matchLine(lineId, txnId, body?.note);
    if (!success) return json({ error: "Line not found" }, { status: 404 });
    return json({ success: true });
  } catch (error) {
    console.error("Error matching reconciliation line:", error);
    return json({ error: "Failed to match reconciliation line" }, { status: 500 });
  }
};
