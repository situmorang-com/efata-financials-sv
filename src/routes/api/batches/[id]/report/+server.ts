import { json } from "@sveltejs/kit";
import { batchDb, batchItemDb } from "$lib/server/db.js";
import type { RequestHandler } from "./$types.js";

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export const GET: RequestHandler = async ({ params }) => {
  try {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const batchId = Number(params.id);
    const batch = batchDb.getById(batchId);
    if (!batch) return json({ error: "Batch not found" }, { status: 404 });

    const items = batchItemDb.getByBatchId(batchId);
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const margin = 40;
    const rowHeight = 18;
    const pageWidth = 595.28; // A4
    const pageHeight = 841.89;
    const contentWidth = pageWidth - margin * 2;

    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const drawText = (
      text: string,
      x: number,
      size = 10,
      bold = false,
      color = rgb(0.12, 0.14, 0.18),
    ) => {
      page.drawText(text, { x, y, size, font: bold ? fontBold : font, color });
    };

    const drawLine = (yPos: number) => {
      page.drawLine({
        start: { x: margin, y: yPos },
        end: { x: pageWidth - margin, y: yPos },
        thickness: 0.8,
        color: rgb(0.85, 0.87, 0.9),
      });
    };

    const totalRecipients = items.length;
    const transferred = items.filter(
      (i) => i.transfer_status === "done",
    ).length;
    const notified = items.filter((i) => i.notify_status === "sent").length;
    const skipped = items.filter((i) => i.notify_status === "skipped").length;
    const totalAmount = items.reduce((sum, i) => sum + (i.amount ?? 0), 0);

    const headers = [
      "No",
      "Nama",
      "Rekening",
      "Sabat",
      "Zoom",
      "Tgl TF",
      "Jumlah",
      "TF",
      "WA",
    ];
    const colXs = [margin, 68, 205, 332, 372, 405, 465, 518, 545];
    const colWidths = [26, 130, 120, 32, 32, 55, 55, 24, 24];
    const tableLeft = Math.min(...colXs);
    const tableRight = Math.max(...colXs.map((x, i) => x + colWidths[i]));
    const tableWidth = tableRight - tableLeft;

    // Header block
    const headerHeight = 66;
    const headerTop = y;
    page.drawRectangle({
      x: tableLeft,
      y: headerTop - headerHeight,
      width: tableWidth,
      height: headerHeight,
      color: rgb(0.95, 0.98, 0.97),
      borderColor: rgb(0.85, 0.9, 0.9),
      borderWidth: 1,
    });
    page.drawRectangle({
      x: tableLeft,
      y: headerTop - headerHeight,
      width: 6,
      height: headerHeight,
      color: rgb(0.16, 0.63, 0.55),
    });
    y = headerTop - 18;
    drawText(
      "EFATA Transfer Checklist",
      tableLeft + 18,
      16,
      true,
      rgb(0.08, 0.2, 0.18),
    );
    y -= 16;
    drawText(`Batch: ${batch.name}`, tableLeft + 18, 11, true);
    y -= 14;
    if (batch.description) {
      drawText(
        `Deskripsi: ${batch.description}`,
        tableLeft + 18,
        9,
        false,
        rgb(0.25, 0.32, 0.31),
      );
      y -= 12;
    }
    drawText(
      `Sabat: ${batch.total_saturdays} • Transport: ${formatRupiah(batch.transport_rate)} • Zoom Single: ${formatRupiah(batch.zoom_single_rate)} • Zoom Family: ${formatRupiah(batch.zoom_family_rate)}`,
      tableLeft + 18,
      9,
      false,
      rgb(0.25, 0.32, 0.31),
    );
    y = headerTop - headerHeight - 10;

    // Summary row (aligned to table width)
    const summaryHeight = 22;
    const summaryTop = y;
    page.drawRectangle({
      x: tableLeft,
      y: summaryTop - summaryHeight,
      width: tableWidth,
      height: summaryHeight,
      color: rgb(0.97, 0.99, 0.99),
      borderColor: rgb(0.88, 0.92, 0.93),
      borderWidth: 1,
    });
    // Vertically center text in summary row
    const summaryBottom = summaryTop - summaryHeight;
    y = summaryBottom + (summaryHeight - 9) / 2 + 9 * 0.7;
    drawText(
      `Penerima: ${totalRecipients}`,
      tableLeft + 12,
      9,
      true,
      rgb(0.12, 0.22, 0.2),
    );
    drawText(
      `Transfer: ${transferred}/${totalRecipients}`,
      tableLeft + 140,
      9,
      true,
      rgb(0.12, 0.35, 0.28),
    );
    drawText(
      `Notif: ${notified}/${totalRecipients} (Skip ${skipped})`,
      tableLeft + 260,
      9,
      true,
      rgb(0.12, 0.28, 0.42),
    );
    drawText(
      `Total: ${formatRupiah(totalAmount)}`,
      tableLeft + 430,
      9,
      true,
      rgb(0.12, 0.22, 0.2),
    );
    y = summaryTop - summaryHeight - 12;

    const drawHeader = () => {
      const headerHeight = 18;
      page.drawRectangle({
        x: tableLeft,
        y: y - headerHeight,
        width: tableWidth,
        height: headerHeight,
        color: rgb(0.92, 0.96, 0.95),
        borderColor: rgb(0.84, 0.9, 0.9),
        borderWidth: 1,
      });
      // Vertically center header text in the box
      const headerBottom = y - headerHeight;
      const headerBaseline = headerBottom + (headerHeight - 9) / 2 + 9 * 0.7;
      const prevY = y;
      y = headerBaseline;
      headers.forEach((h, i) =>
        drawText(h, colXs[i], 9, true, rgb(0.16, 0.28, 0.26)),
      );
      // Add extra gap before line items
      y = prevY - rowHeight - 8;
    };

    drawHeader();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (y < margin + rowHeight + 8) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
        drawHeader();
      }

      const rekening = item.actual_bank_name
        ? `${item.actual_bank_name} ${item.actual_account_number ?? ""}`
        : item.bank_name
          ? `${item.bank_name} ${item.account_number ?? ""}`
          : "-";

      if (i % 2 === 0) {
        page.drawRectangle({
          x: tableLeft,
          y: y - 12,
          width: tableWidth,
          height: rowHeight,
          color: rgb(0.985, 0.995, 0.995),
        });
      }

      drawText(String(i + 1), colXs[0], 9);
      drawText(String(item.recipient_name ?? "-").slice(0, 24), colXs[1], 9);
      drawText(rekening.slice(0, 22), colXs[2], 9);
      drawText(String(item.saturdays_attended ?? 0), colXs[3], 9);
      drawText(String(item.zoom_type ?? "-"), colXs[4], 9);
      const tfDate = item.transfer_at
        ? new Date(item.transfer_at).toLocaleDateString("id-ID")
        : "—";
      drawText(tfDate, colXs[5], 9);
      drawText(formatRupiah(item.amount ?? 0), colXs[6], 9);
      drawText(item.transfer_status === "done" ? "OK" : "—", colXs[7], 9);
      drawText(
        item.notify_status === "sent"
          ? "OK"
          : item.notify_status === "skipped"
            ? "SKIP"
            : "—",
        colXs[8],
        9,
      );

      y -= rowHeight;
      if (i === items.length - 1 || y < margin + rowHeight) {
        drawLine(y + 4);
      }
    }

    const pdfBytes = await pdf.save();
    return new Response(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="batch-${batchId}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return json({ error: "Failed to generate PDF" }, { status: 500 });
  }
};
