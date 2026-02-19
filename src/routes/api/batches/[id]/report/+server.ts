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
      },
      {
        label: "Transfer Fee",
        value: formatRupiah(transferFeeTotal),
        color: rgb(0.92, 0.91, 0.98),
      },
      {
        label: "Cash Paid",
        value: formatRupiah(cashTotal),
        color: rgb(0.99, 0.95, 0.88),
      },
      {
        label: "Total Paid",
        value: formatRupiah(totalPaid),
        color: rgb(0.89, 0.95, 0.99),
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
      drawText(card.label, x + 12, cy - 18, 9, false, rgb(0.22, 0.26, 0.28));
      drawText(card.value, x + 12, cy - 41, 14, true, rgb(0.07, 0.2, 0.22));
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
    // Compact widths so the right-most date column stays inside A4 page bounds.
    const colWidths = [18, 108, 118, 46, 64, 50, 42, 46];
    const colXs: number[] = [];
    let cursor = margin + 6;
    for (const w of colWidths) {
      colXs.push(cursor);
      cursor += w;
    }

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
      drawText(method.toUpperCase(), colXs[3], y - 12, 8);
      drawText(formatRupiah(item.amount || 0), colXs[4], y - 12, 8);
      drawText(
        method === "cash" ? "-" : formatRupiah(item.transfer_fee || 0),
        colXs[5],
        y - 12,
        8,
      );
      drawText(status, colXs[6], y - 12, 8);
      drawText(formatDate(item.transfer_at), colXs[7], y - 12, 8);
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
