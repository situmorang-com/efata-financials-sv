import { json } from "@sveltejs/kit";
import sharp from "sharp";
import { batchDb, batchItemDb, saveProofFile } from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

function filenamePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseItemIds(raw: unknown): number[] {
  let payload: unknown = raw;
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = [];
    }
  }
  if (!Array.isArray(payload)) return [];
  return Array.from(
    new Set(
      payload
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  );
}

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const batchId = Number(params.id);
    const batch = batchDb.getById(batchId);
    if (!batch) return json({ error: "Batch not found" }, { status: 404 });

    const formData = await request.formData();
    const itemIds = parseItemIds(formData.get("item_ids"));
    if (itemIds.length === 0) {
      return json({ error: "item_ids array is required" }, { status: 400 });
    }

    const leadItemIdRaw = Number(formData.get("lead_item_id") || 0);
    const leadItemId = itemIds.includes(leadItemIdRaw)
      ? leadItemIdRaw
      : itemIds[0];
    const groupTransferFee = Math.max(
      0,
      Math.round(Number(formData.get("transfer_fee") || 0)),
    );

    const transferAtInput = String(formData.get("transfer_at") || "").trim();
    const transferAt = transferAtInput
      ? new Date(`${transferAtInput}T12:00:00`).toISOString()
      : new Date().toISOString();
    if (Number.isNaN(new Date(transferAt).getTime())) {
      return json({ error: "Invalid transfer_at date" }, { status: 400 });
    }

    const file = formData.get("proof");
    if (!(file instanceof File)) {
      return json({ error: "Proof image is required" }, { status: 400 });
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    if (rawBuffer.length === 0) {
      return json({ error: "Empty image data" }, { status: 400 });
    }

    const selectedItems = batchItemDb
      .getByBatchId(batchId)
      .filter((item) => item.id && itemIds.includes(item.id));
    if (selectedItems.length !== itemIds.length) {
      return json(
        { error: "One or more item_ids do not belong to this batch" },
        { status: 400 },
      );
    }

    const leadItem =
      selectedItems.find((item) => item.id === leadItemId) || selectedItems[0];

    const compressed = await sharp(rawBuffer)
      .rotate()
      .resize(1200, 1600, { fit: "inside", withoutEnlargement: true })
      .avif({ quality: 30 })
      .toBuffer();

    const parts = [
      batch.description ? filenamePart(batch.description) : "",
      batch.name ? filenamePart(batch.name) : "",
      leadItem.transfer_to_name
        ? filenamePart(leadItem.transfer_to_name)
        : leadItem.recipient_name
          ? filenamePart(leadItem.recipient_name)
          : "",
      `item-${leadItem.id || leadItemId}`,
      "family",
    ].filter(Boolean);
    const preferredBaseName =
      parts.join("-") || `family-proof-${leadItem.id || leadItemId}`;
    const filename = saveProofFile(
      leadItem.id || leadItemId,
      compressed,
      "avif",
      preferredBaseName,
    );

    const count = batchItemDb.setProofForGroup(itemIds, filename, {
      transferAt,
      groupTransferFee,
      leadItemId: leadItem.id || leadItemId,
    });

    return json({
      message: `Updated ${count} items`,
      count,
      has_transfer_proof: 1,
      filename,
      originalSize: rawBuffer.length,
      compressedSize: compressed.length,
    });
  } catch (error) {
    console.error("Error creating family transfer proof:", error);
    return json({ error: "Failed to save family transfer proof" }, { status: 500 });
  }
};
