import sharp from "sharp";
import {
  saveApprovalProofFile,
  sha256Hex,
} from "$lib/server/db.js";

function filenamePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function compressApprovalProof(
  approvalId: number,
  file: File,
  title: string,
): Promise<{
  filename: string;
  original_name: string;
  mime: string;
  size: number;
  sha256: string;
}> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Proof must be an image");
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());
  if (rawBuffer.length === 0) {
    throw new Error("Proof image is empty");
  }

  const compressed = await sharp(rawBuffer)
    .rotate()
    .resize(1400, 1800, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();

  const preferredBaseName = filenamePart(title) || `approval-${approvalId}`;
  const filename = saveApprovalProofFile(
    approvalId,
    compressed,
    "webp",
    preferredBaseName,
  );

  return {
    filename,
    original_name: file.name,
    mime: "image/webp",
    size: compressed.length,
    sha256: sha256Hex(compressed),
  };
}
