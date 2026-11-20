import { json } from "@sveltejs/kit";
import sharp from "sharp";
import { batchDb, paymentDb, readProofFile, saveProofFile } from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

// The receipt of the one transfer that carries a batch's cash to the cash
// distributor. Uploading it marks that transfer as sent. GET is public (see
// hooks.server.ts): the WhatsApp message to the distributor links to it.

function filenamePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const batchId = Number(params.id);
    const batch = batchDb.getById(batchId);
    if (!batch) return json({ error: "Batch not found" }, { status: 404 });
    if (!(request.headers.get("content-type") || "").startsWith("image/")) {
      return json({ error: "Kirim gambar bukti transfer" }, { status: 400 });
    }
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.length === 0) return json({ error: "Empty image data" }, { status: 400 });

    // Same as a row's proof: at most 1200 x 1600, AVIF q30.
    const compressed = await sharp(raw)
      .resize(1200, 1600, { fit: "inside", withoutEnlargement: true })
      .avif({ quality: 30 })
      .toBuffer();
    const base = [batch.description, batch.name, "tunai"]
      .map((part) => (part ? filenamePart(part) : ""))
      .filter(Boolean)
      .join("-");
    const filename = saveProofFile(batchId, compressed, "avif", `cash-${batchId}-${base}`);
    paymentDb.setCashProof(batchId, filename);
    return json({ batch: batchDb.getById(batchId) });
  } catch (error) {
    console.error("Error uploading cash payout proof:", error);
    return json({ error: "Gagal mengunggah bukti" }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ params }) => {
  const proof = paymentDb.getCashProof(Number(params.id));
  const buffer = proof ? readProofFile(proof) : null;
  if (!buffer) return json({ error: "No proof found" }, { status: 404 });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/avif",
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "public, max-age=86400",
    },
  });
};
