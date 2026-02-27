import { json } from "@sveltejs/kit";
import { financeReconciliationDb } from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = async ({ params }) => {
  try {
    const lineId = Number(params.lineId);
    if (!lineId) return json({ error: "Invalid line id" }, { status: 400 });
    const txn = financeReconciliationDb.createTransactionForLine(lineId);
    if (!txn) {
      return json({ error: "Cannot create transaction for this line" }, { status: 400 });
    }
    return json(txn, { status: 201 });
  } catch (error) {
    console.error("Error creating transaction from reconciliation line:", error);
    return json(
      { error: "Failed to create transaction from reconciliation line" },
      { status: 500 },
    );
  }
};
