import { json } from "@sveltejs/kit";
import { financeTransactionDb } from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const id = Number(params.id);
    if (!id) return json({ error: "Invalid id" }, { status: 400 });

    let approvalNote: string | undefined;
    try {
      const body = await request.json();
      if (body?.approval_note) approvalNote = String(body.approval_note);
    } catch {
      approvalNote = undefined;
    }

    const success = financeTransactionDb.approve(id, null, approvalNote);
    if (!success)
      return json({ error: "Expense transaction not found" }, { status: 404 });

    return json(financeTransactionDb.getById(id));
  } catch (error) {
    console.error("Error approving expense transaction:", error);
    return json(
      { error: "Failed to approve expense transaction" },
      { status: 500 },
    );
  }
};
