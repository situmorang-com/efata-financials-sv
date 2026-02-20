import { json } from "@sveltejs/kit";
import { batchDb, batchItemDb, readProofFile } from "$lib/server/db.js";
import type { BatchItem } from "$lib/types.js";
import type { RequestHandler } from "./$types.js";

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("id-ID");
}

function normalizePaymentMethod(value?: string | null): "transfer" | "cash" {
  return String(value || "").trim().toLowerCase() === "cash"
    ? "cash"
    : "transfer";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function clip(text: string, max = 24): string {
  if (!text) return "-";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type ProofAttachment = {
  item: BatchItem;
  label: string;
  bytes: Buffer;
};

export const GET: RequestHandler = async ({ params }) => {
  try {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const sharp = (await import("sharp")).default;

    const batchId = Number(params.id);
    const batch = batchDb.getById(batchId);
    if (!batch) return json({ error: "Batch not found" }, { status: 404 });

    const items = batchItemDb.getByBatchId(batchId);

    const totalRecipients = items.length;
    const transferredCount = items.filter((i) => i.transfer_status === "done")
      .length;
    const notifiedCount = items.filter((i) => i.notify_status === "sent").length;
    const skippedCount = items.filter((i) => i.notify_status === "skipped").length;
    const transferAmountTotal = items
      .filter(
        (i) =>
          normalizePaymentMethod(i.payment_method) === "transfer" &&
          i.transfer_status === "done",
      )
      .reduce((sum, i) => sum + (i.amount || 0), 0);
    const transferFeeTotal = items
      .filter(
        (i) =>
          normalizePaymentMethod(i.payment_method) === "transfer" &&
          i.transfer_status === "done",
      )
      .reduce((sum, i) => sum + (i.transfer_fee || 0), 0);
    const cashTotal = items
      .filter(
        (i) =>
          normalizePaymentMethod(i.payment_method) === "cash" &&
          i.transfer_status === "done",
      )
      .reduce((sum, i) => sum + (i.amount || 0), 0);
    const totalPaid = transferAmountTotal + transferFeeTotal + cashTotal;

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 36;
    const contentWidth = pageWidth - margin * 2;

    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const drawText = (
      text: string,
      x: number,
      textY: number,
      size = 10,
      bold = false,
      color = rgb(0.16, 0.18, 0.2),
    ) => {
      page.drawText(text, {
        x,
        y: textY,
        size,
        font: bold ? fontBold : font,
        color,
      });
    };

    const addPage = () => {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    };

    // Header card
    page.drawRectangle({
      x: margin,
      y: y - 88,
      width: contentWidth,
      height: 88,
      color: rgb(0.94, 0.98, 0.99),
      borderColor: rgb(0.84, 0.9, 0.93),
      borderWidth: 1,
    });
    page.drawRectangle({
      x: margin,
      y: y - 88,
      width: 7,
      height: 88,
      color: rgb(0.1, 0.54, 0.57),
    });
    drawText("EFATA Transfer Report", margin + 18, y - 26, 18, true, rgb(0.09, 0.26, 0.28));
    drawText(`Batch: ${batch.name}`, margin + 18, y - 47, 11, true);
    drawText(
      `Deskripsi: ${batch.description || "-"}`,
      margin + 18,
      y - 63,
      9,
      false,
      rgb(0.25, 0.33, 0.35),
    );
    drawText(
      `Dibuat: ${formatDate(batch.created_at)}  •  Tanggal Report: ${formatDate(new Date().toISOString())}`,
      margin + 18,
      y - 78,
      9,
      false,
      rgb(0.25, 0.33, 0.35),
    );
    y -= 106;

    // Summary cards
    const cardGap = 10;
    const cardW = (contentWidth - cardGap * 1) / 2;
    const cardH = 62;
    const cards = [
      {
        label: "Transfer Amount",
        value: formatRupiah(transferAmountTotal),
        color: rgb(0.86, 0.96, 0.91),
        accent: rgb(0.12, 0.62, 0.36),
        badge: "TR",
      },
      {
        label: "Transfer Fee",
        value: formatRupiah(transferFeeTotal),
        color: rgb(0.92, 0.91, 0.98),
        accent: rgb(0.45, 0.36, 0.8),
        badge: "FEE",
      },
      {
        label: "Cash Paid",
        value: formatRupiah(cashTotal),
        color: rgb(0.99, 0.95, 0.88),
        accent: rgb(0.78, 0.54, 0.14),
        badge: "CSH",
      },
      {
        label: "Total Paid",
        value: formatRupiah(totalPaid),
        color: rgb(0.89, 0.95, 0.99),
        accent: rgb(0.18, 0.48, 0.76),
        badge: "TOT",
      },
    ];
    cards.forEach((card, i) => {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const x = margin + col * (cardW + cardGap);
      const cy = y - row * (cardH + 8);
      page.drawRectangle({
        x,
        y: cy - cardH,
        width: cardW,
        height: cardH,
        color: card.color,
        borderColor: rgb(0.84, 0.9, 0.93),
        borderWidth: 1,
      });
      page.drawRectangle({
        x,
        y: cy - 3,
        width: cardW,
        height: 3,
        color: card.accent,
      });
      page.drawCircle({
        x: x + 17,
        y: cy - 19,
        size: 9,
        color: card.accent,
      });
      drawText(card.badge, x + 11.5, cy - 21.3, 6.5, true, rgb(1, 1, 1));
      drawText(card.label, x + 33, cy - 18, 9, false, rgb(0.22, 0.26, 0.28));
      drawText(card.value, x + 12, cy - 43, 14, true, rgb(0.07, 0.2, 0.22));
    });
    y -= cardH * 2 + 20;

    page.drawRectangle({
      x: margin,
      y: y - 24,
      width: contentWidth,
      height: 24,
      color: rgb(0.96, 0.98, 1),
      borderColor: rgb(0.86, 0.9, 0.95),
      borderWidth: 1,
    });
    drawText(
      `Penerima: ${totalRecipients}   •   Transfer Selesai: ${transferredCount}/${totalRecipients}   •   Notif WA: ${notifiedCount}/${totalRecipients} (Skip ${skippedCount})`,
      margin + 10,
      y - 16,
      9,
      true,
      rgb(0.19, 0.25, 0.35),
    );
    y -= 36;

    // Transaction table
    const headers = [
      "#",
      "Penerima",
      "Rekening",
      "Metode",
      "Jumlah",
      "Fee",
      "Status",
      "Tgl",
    ];
    // Slightly rebalance widths to improve readability between Metode and Jumlah.
    const colWidths = [18, 100, 110, 58, 76, 54, 42, 52];
    const colXs: number[] = [];
    let cursor = margin + 6;
    for (const w of colWidths) {
      colXs.push(cursor);
      cursor += w;
    }
    const methodDividerX = colXs[3] + colWidths[3] - 4;

    const drawCellRight = (
      text: string,
      colIndex: number,
      textY: number,
      size = 8,
      bold = false,
      color = rgb(0.16, 0.18, 0.2),
    ) => {
      const activeFont = bold ? fontBold : font;
      const textWidth = activeFont.widthOfTextAtSize(text, size);
      const x = colXs[colIndex] + colWidths[colIndex] - textWidth - 4;
      drawText(text, x, textY, size, bold, color);
    };

    const drawTableHeader = () => {
      if (y < margin + 120) addPage();
      page.drawRectangle({
        x: margin,
        y: y - 20,
        width: contentWidth,
        height: 20,
        color: rgb(0.91, 0.95, 0.96),
      });
      headers.forEach((h, i) =>
        drawText(h, colXs[i], y - 14, 8, true, rgb(0.18, 0.24, 0.26)),
      );
      page.drawLine({
        start: { x: methodDividerX, y: y - 20 },
        end: { x: methodDividerX, y },
        thickness: 0.8,
        color: rgb(0.8, 0.86, 0.9),
      });
      y -= 20;
    };

    drawTableHeader();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowHeight = 18;
      if (y < margin + rowHeight + 6) {
        addPage();
        drawTableHeader();
      }
      if (i % 2 === 0) {
        page.drawRectangle({
          x: margin,
          y: y - rowHeight,
          width: contentWidth,
          height: rowHeight,
          color: rgb(0.985, 0.99, 0.995),
        });
      }
      const rekening = item.actual_bank_name
        ? `${item.actual_bank_name} ${item.actual_account_number || ""}`
        : item.bank_name
          ? `${item.bank_name} ${item.account_number || ""}`
          : "-";
      const method = normalizePaymentMethod(item.payment_method);
      const status = item.transfer_status === "done" ? "DONE" : "PENDING";

      drawText(String(i + 1), colXs[0], y - 12, 8);
      drawText(clip(item.recipient_name || "-", 21), colXs[1], y - 12, 8);
      drawText(clip(rekening, 25), colXs[2], y - 12, 8);
      const chipX = colXs[3] + 1;
      const chipY = y - 15;
      const chipW = 48;
      const chipH = 12;
      page.drawRectangle({
        x: chipX,
        y: chipY,
        width: chipW,
        height: chipH,
        color: method === "cash" ? rgb(0.99, 0.95, 0.88) : rgb(0.91, 0.96, 1),
        borderColor: method === "cash" ? rgb(0.82, 0.64, 0.2) : rgb(0.4, 0.61, 0.84),
        borderWidth: 0.6,
      });
      drawText(
        method.toUpperCase(),
        chipX + 6,
        y - 12,
        7.5,
        true,
        method === "cash" ? rgb(0.48, 0.33, 0.06) : rgb(0.14, 0.36, 0.56),
      );
      drawCellRight(formatRupiah(item.amount || 0), 4, y - 12, 8);
      drawCellRight(
        method === "cash" ? "-" : formatRupiah(item.transfer_fee || 0),
        5,
        y - 12,
        8,
      );
      drawText(status, colXs[6], y - 12, 8);
      drawText(formatDate(item.transfer_at), colXs[7], y - 12, 8);
      page.drawLine({
        start: { x: methodDividerX, y: y - rowHeight },
        end: { x: methodDividerX, y },
        thickness: 0.6,
        color: rgb(0.88, 0.92, 0.95),
      });
      y -= rowHeight;
    }

    // Proof attachments
    const attachments: ProofAttachment[] = [];
    for (const item of items) {
      if (!item.id) continue;
      const method = normalizePaymentMethod(item.payment_method);
      if (method !== "transfer" || item.transfer_status !== "done") continue;
      const proof = batchItemDb.getProof(item.id);
      if (!proof) continue;
      let raw: Buffer | null = null;
      if (proof.startsWith("data:")) {
        const match = proof.match(/^data:image\/\w+;base64,(.+)$/);
        if (match) raw = Buffer.from(match[1], "base64");
      } else {
        raw = readProofFile(proof);
      }
      if (!raw) continue;
      attachments.push({
        item,
        label: item.recipient_name || `Item ${item.id}`,
        bytes: raw,
      });
    }

    addPage();
    drawText("Lampiran Bukti Transfer", margin, y - 8, 15, true, rgb(0.09, 0.25, 0.28));
    y -= 26;

    if (attachments.length === 0) {
      drawText(
        "Belum ada bukti transfer yang tersimpan untuk batch ini.",
        margin,
        y - 4,
        11,
        false,
        rgb(0.36, 0.4, 0.44),
      );
    } else {
      for (let i = 0; i < attachments.length; i++) {
        if (y < margin + 250) addPage();
        const attachment = attachments[i];
        const boxH = 240;
        page.drawRectangle({
          x: margin,
          y: y - boxH,
          width: contentWidth,
          height: boxH,
          color: rgb(0.98, 0.99, 1),
          borderColor: rgb(0.85, 0.9, 0.95),
          borderWidth: 1,
        });
        drawText(
          `${i + 1}. ${attachment.label}`,
          margin + 12,
          y - 20,
          11,
          true,
          rgb(0.15, 0.2, 0.25),
        );
        drawText(
          `Jumlah: ${formatRupiah(attachment.item.amount || 0)} • Fee: ${formatRupiah(attachment.item.transfer_fee || 0)} • Tanggal: ${formatDate(attachment.item.transfer_at)}`,
          margin + 12,
          y - 36,
          9,
          false,
          rgb(0.28, 0.32, 0.36),
        );

        try {
          const jpegBytes = await sharp(attachment.bytes)
            .rotate()
            .resize(980, 660, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
          const embedded = await pdf.embedJpg(jpegBytes);
          const maxW = contentWidth - 24;
          const maxH = boxH - 58;
          const scale = Math.min(
            maxW / embedded.width,
            maxH / embedded.height,
            1,
          );
          const drawW = embedded.width * scale;
          const drawH = embedded.height * scale;
          const drawX = margin + (contentWidth - drawW) / 2;
          const drawY = y - boxH + 10 + (maxH - drawH) / 2;
          page.drawImage(embedded, {
            x: drawX,
            y: drawY,
            width: drawW,
            height: drawH,
          });
        } catch (err) {
          console.error("Failed to embed proof image in PDF:", err);
          drawText(
            "Gagal memuat gambar bukti transfer.",
            margin + 12,
            y - 62,
            10,
            false,
            rgb(0.65, 0.2, 0.2),
          );
        }

        y -= boxH + 14;
      }
    }

    const pdfBytes = await pdf.save();
    return new Response(toArrayBuffer(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="efata-transfer-report-batch-${batchId}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return json({ error: "Failed to generate PDF" }, { status: 500 });
  }
};
