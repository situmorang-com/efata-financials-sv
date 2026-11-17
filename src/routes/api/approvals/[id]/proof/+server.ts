import { json } from "@sveltejs/kit";
import {
  boardApprovalDb,
  readApprovalProofFile,
} from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export const GET: RequestHandler = async ({ locals, params }) => {
  try {
    const session = await locals.auth();
    if (!session?.user) {
      return json({ error: "Authentication required" }, { status: 401 });
    }

    const id = Number(params.id);
    if (!id) return json({ error: "Invalid id" }, { status: 400 });

    const approval = boardApprovalDb.getById(id);
    if (!approval?.proof_filename) {
      return json({ error: "No proof found" }, { status: 404 });
    }

    const buffer = readApprovalProofFile(approval.proof_filename);
    if (!buffer) {
      return json({ error: "Proof file not found" }, { status: 404 });
    }

    return new Response(toArrayBuffer(buffer), {
      headers: {
        "Content-Type": approval.proof_mime || "image/webp",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Error fetching approval proof:", error);
    return json({ error: "Failed to fetch approval proof" }, { status: 500 });
  }
};
