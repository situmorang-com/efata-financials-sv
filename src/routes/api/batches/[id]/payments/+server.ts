import { json } from "@sveltejs/kit";
import { batchDb, paymentDb } from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

// Marks payments as entered in the bank portal (awaiting approval), or clears
// the mark. Body: { item_ids: number[], submitted: boolean } for transfers, or
// { cash: true, submitted?: boolean, done?: boolean, notified?: boolean } for
// the cash payout (its receipt is uploaded to ./cash-proof).
export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const batchId = Number(params.id);
    if (!batchDb.getById(batchId)) {
      return json({ error: "Batch not found" }, { status: 404 });
    }
    const data = await request.json();

    if (data?.cash === true) {
      const state: { submitted?: boolean; done?: boolean; notified?: boolean } = {};
      if (typeof data.submitted === "boolean") state.submitted = data.submitted;
      if (typeof data.done === "boolean") state.done = data.done;
      if (typeof data.notified === "boolean") state.notified = data.notified;
      // A payout that was sent has also been entered.
      if (state.done === true) state.submitted = true;
      if (!paymentDb.setCashPayout(batchId, state)) {
        return json({ error: "Nothing to update" }, { status: 400 });
      }
      return json({ batch: batchDb.getById(batchId) });
    }

    const itemIds: number[] = Array.isArray(data?.item_ids)
      ? Array.from(
          new Set<number>(
            data.item_ids
              .map((id: unknown) => Number(id))
              .filter((id: number) => Number.isInteger(id) && id > 0),
          ),
        )
      : [];
    if (itemIds.length === 0 || typeof data?.submitted !== "boolean") {
      return json(
        { error: "item_ids and submitted are required" },
        { status: 400 },
      );
    }
    const count = paymentDb.setSubmitted(batchId, itemIds, data.submitted);
    return json({ count });
  } catch (error) {
    console.error("Error updating payment status:", error);
    return json({ error: "Gagal menyimpan status pembayaran" }, { status: 500 });
  }
};
