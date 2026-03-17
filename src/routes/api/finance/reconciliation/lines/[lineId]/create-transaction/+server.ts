import { json } from "@sveltejs/kit";
import { financeReconciliationDb } from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const lineId = Number(params.lineId);
    if (!lineId) return json({ error: "Invalid line id" }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const txn = financeReconciliationDb.createTransactionForLine(lineId, {
      sub_type: body?.sub_type,
      category_id: body?.category_id ? Number(body.category_id) : undefined,
      service_label: body?.service_label,
      payment_method: body?.payment_method,
    });
    if (!txn) {
      return json({ error: "Cannot create transaction for this line" }, { status: 400 });
    }
    return json(txn, { status: 201 });
  } catch (error) {
    const knownValidationError =
      error instanceof Error &&
      /^(Pilih |Kategori yang dipilih|Baris mutasi debit)/.test(error.message);
    if (knownValidationError && error instanceof Error) {
      return json({ error: error.message }, { status: 400 });
    }
    console.error("Error creating transaction from reconciliation line:", error);
    return json({ error: "Failed to create transaction from reconciliation line" }, { status: 500 });
  }
};
