import { json } from "@sveltejs/kit";
import { batchItemDb, batchDb } from "$lib/server/db.js";
import { calculateAmount } from "$lib/types.js";
import type { RequestHandler } from "./$types.js";

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const data = await request.json();

    // If saturdays_attended or zoom_type is being updated, auto-calculate amount
    if (data.saturdays_attended !== undefined || data.zoom_type !== undefined) {
      const batch = batchDb.getById(Number(params.id));
      const existing = batchItemDb.getById(Number(params.itemId));
      if (batch && existing) {
        if (batch.type === "special") {
          // Special batches are fixed-amount; ignore attendance/zoom overrides.
          data.saturdays_attended = existing.saturdays_attended;
          data.zoom_type = existing.zoom_type;
          data.amount = existing.amount;
        } else {
          const saturdays =
            data.saturdays_attended ?? existing.saturdays_attended;
          const zoomType = data.zoom_type ?? existing.zoom_type;
          data.amount = calculateAmount(
            saturdays,
            batch.transport_rate,
            zoomType,
            batch.zoom_single_rate,
            batch.zoom_family_rate,
          );
        }
      }
    }

    const success = batchItemDb.update(Number(params.itemId), data);
    if (!success) {
      return json({ error: "Batch item not found" }, { status: 404 });
    }
    const updated = batchItemDb.getById(Number(params.itemId));
    return json(updated);
  } catch (error) {
    console.error("Error updating batch item:", error);
    return json({ error: "Failed to update batch item" }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const success = batchItemDb.delete(Number(params.itemId));
    if (!success) {
      return json({ error: "Batch item not found" }, { status: 404 });
    }
    return json({ message: "Deleted" });
  } catch (error) {
    console.error("Error deleting batch item:", error);
    return json({ error: "Failed to delete batch item" }, { status: 500 });
  }
};
