// Payments summary PDF: every bank transfer of a batch, plus the one transfer
// that carries the cash to the cash distributor and the list of who gets cash.
// Made for the approver in the bank portal (compare against what is pending
// there) and for the cash distributor (who to hand cash to, and how much).
//
//   ?scope=awaiting  entered in the bank portal, awaiting approval
//   ?scope=open      everything not sent yet (default)
//   ?scope=all       everything
//   ?bank=mandiri|bca  the account the money is sent from
import { json } from "@sveltejs/kit";
import { batchDb, batchItemDb } from "$lib/server/db.js";
import { getCashDistributor } from "$lib/server/cash-distributor.js";
import {
  buildPaymentLines,
  sumPaymentLines,
  type PaymentLine,
  type PaymentStatus,
} from "$lib/payments.js";
import { DEFAULT_SOURCE_BANK, type SourceBank } from "$lib/transfer-fee.js";
import { withoutPhoneNumbers } from "$lib/transfer-reference.js";
import type { RequestHandler } from "./$types.js";

type Scope = "awaiting" | "open" | "all";

const SCOPE_LABEL: Record<Scope, string> = {
  awaiting: "Menunggu approval di bank",
  open: "Belum ditransfer",
  all: "Semua pembayaran",
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  todo: "Belum diinput",
  submitted: "Menunggu approval",
  done: "Sudah ditransfer",
};

function rupiah(value: number): string {
  return `Rp ${Math.round(value || 0).toLocaleString("id-ID")}`;
}

/** The standard PDF fonts only cover Latin-1. */
function pdfSafe(text: string): string {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

function inScope(line: PaymentLine, scope: Scope): boolean {
  if (scope === "awaiting") return line.status === "submitted";
  if (scope === "open") return line.status !== "done";
  return true;
}

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

    const batchId = Number(params.id);
    const batch = batchDb.getById(batchId);
    if (!batch) return json({ error: "Batch not found" }, { status: 404 });

    const scopeParam = url.searchParams.get("scope");
    const scope: Scope =
      scopeParam === "awaiting" || scopeParam === "all" ? scopeParam : "open";
    const sourceBank: SourceBank =
      url.searchParams.get("bank") === "bca" ? "bca" : DEFAULT_SOURCE_BANK;

    const cashDistributor = getCashDistributor();
    const lines = buildPaymentLines(batch, batchItemDb.getByBatchId(batchId), {
      sourceBank,
      cashDistributor,
    }).filter((line) => inScope(line, scope));
    const transfers = lines.filter((line) => line.kind === "transfer");
    const cash = lines.find((line) => line.kind === "cash") || null;
    const transferTotals = sumPaymentLines(transfers);
    const totals = sumPaymentLines(lines);

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 36;
    const contentWidth = pageWidth - margin * 2;
    const right = pageWidth - margin;
    const ink = rgb(0.13, 0.15, 0.18);
    const muted = rgb(0.4, 0.44, 0.48);
    const rule = rgb(0.82, 0.85, 0.88);
    const shade = rgb(0.95, 0.96, 0.97);

    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const widthOf = (text: string, size: number, bold = false) =>
      (bold ? fontBold : font).widthOfTextAtSize(pdfSafe(text), size);

    /** Shortens text with "..." until it fits the width. */
    const fit = (text: string, maxWidth: number, size: number, bold = false) => {
      let out = pdfSafe(text);
      if (widthOf(out, size, bold) <= maxWidth) return out;
      while (out.length > 1 && widthOf(`${out}...`, size, bold) > maxWidth) {
        out = out.slice(0, -1);
      }
      return `${out.trimEnd()}...`;
    };

    const draw = (
      text: string,
      x: number,
      textY: number,
      opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; maxWidth?: number } = {},
    ) => {
      const size = opts.size ?? 9;
      const value = opts.maxWidth
        ? fit(text, opts.maxWidth, size, opts.bold)
        : pdfSafe(text);
      page.drawText(value, {
        x,
        y: textY,
        size,
        font: opts.bold ? fontBold : font,
        color: opts.color ?? ink,
      });
    };

    const drawRight = (
      text: string,
      xRight: number,
      textY: number,
      opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
    ) => {
      const size = opts.size ?? 9;
      draw(text, xRight - widthOf(text, size, opts.bold), textY, opts);
    };

    const hLine = (lineY: number, color = rule) => {
      page.drawLine({
        start: { x: margin, y: lineY },
        end: { x: right, y: lineY },
        thickness: 0.6,
        color,
      });
    };

    /** Starts a new page when fewer than `needed` points are left. */
    const ensure = (needed: number, onNewPage?: () => void) => {
      if (y - needed >= margin + 18) return;
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      onNewPage?.();
    };

    // --- Header ---
    const printedAt = new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    draw("Ringkasan Pembayaran", margin, y - 16, { size: 17, bold: true });
    draw(batch.name, margin, y - 34, { size: 11, bold: true, maxWidth: contentWidth });
    draw(
      `${SCOPE_LABEL[scope]}  |  Dari rekening ${sourceBank === "bca" ? "BCA" : "Mandiri"}  |  Dicetak ${printedAt} WIB`,
      margin,
      y - 48,
      { size: 8.5, color: muted, maxWidth: contentWidth },
    );
    y -= 60;

    // --- Summary ---
    const summaryRows: Array<[string, string, boolean]> = [
      [
        `Transfer bank (${transferTotals.count} transfer)`,
        rupiah(transferTotals.amount),
        false,
      ],
    ];
    if (cash) {
      summaryRows.push([
        `Tunai melalui ${cash.payeeName || "penyalur tunai"} (1 transfer, ${cash.members.length} orang)`,
        rupiah(cash.amount),
        false,
      ]);
    }
    summaryRows.push(
      [`Total nominal (${totals.count} transfer)`, rupiah(totals.amount), true],
      ["Biaya transfer", rupiah(totals.fee), false],
      ["Total didebit dari rekening", rupiah(totals.amount + totals.fee), true],
    );
    const summaryHeight = summaryRows.length * 15 + 12;
    page.drawRectangle({
      x: margin,
      y: y - summaryHeight,
      width: contentWidth,
      height: summaryHeight,
      color: shade,
      borderColor: rule,
      borderWidth: 0.6,
    });
    let sy = y - 17;
    for (const [label, value, bold] of summaryRows) {
      draw(label, margin + 10, sy, { size: 9.5, bold, maxWidth: contentWidth - 150 });
      drawRight(value, right - 10, sy, { size: 9.5, bold });
      sy -= 15;
    }
    y -= summaryHeight + 20;

    if (lines.length === 0) {
      draw("Tidak ada pembayaran untuk pilihan ini.", margin, y, { size: 10, color: muted });
    }

    // --- A. Bank transfers ---
    // Columns: No | Ref + status | Rekening tujuan | Untuk | Jumlah
    // Columns: No | Ref + status | Penerima | Rekening tujuan | Via | Jumlah.
    // The recipient comes first; "Via" is filled only when the money goes to
    // someone else's account, so those rows stand out.
    const col = {
      no: margin + 4,
      ref: margin + 22,
      recipient: margin + 98,
      account: margin + 270,
      via: margin + 386,
      amountRight: right - 4,
    };
    const colWidth = { ref: 74, recipient: 166, account: 112, via: 78 };

    /** Breaks text into at most two lines that fit the width. */
    const wrapTwo = (text: string, maxWidth: number, size: number): string[] => {
      const words = pdfSafe(text).split(" ").filter(Boolean);
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (!current || widthOf(next, size) <= maxWidth) {
          current = next;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
      if (lines.length <= 2) return lines.map((line) => fit(line, maxWidth, size));
      return [fit(lines[0], maxWidth, size), fit(lines.slice(1).join(" "), maxWidth, size)];
    };

    const transferHeader = () => {
      page.drawRectangle({
        x: margin,
        y: y - 16,
        width: contentWidth,
        height: 16,
        color: shade,
      });
      const hy = y - 11.5;
      const opts = { size: 8, bold: true, color: muted };
      draw("No", col.no, hy, opts);
      draw("Ref", col.ref, hy, opts);
      draw("Penerima", col.recipient, hy, opts);
      draw("Rekening tujuan", col.account, hy, opts);
      draw("Via (pemilik rek.)", col.via, hy, opts);
      drawRight("Jumlah", col.amountRight, hy, opts);
      y -= 16;
    };

    if (transfers.length > 0) {
      ensure(60);
      draw("A. Transfer bank", margin, y - 10, { size: 11, bold: true });
      y -= 18;
      transferHeader();

      transfers.forEach((line, index) => {
        const isFamily = line.members.length > 1;
        const rowHeight = Math.max(2, line.members.length) * 11 + 9;
        ensure(rowHeight, transferHeader);

        const top = y - 12;
        draw(String(index + 1), col.no, top, { color: muted });
        draw(line.reference, col.ref, top, { size: 8.5, bold: true, maxWidth: colWidth.ref });
        draw(STATUS_LABEL[line.status], col.ref, top - 11, { size: 7.5, color: muted });

        // Names only: a phone number kept in a name is not for the approver.
        if (isFamily) {
          line.members.forEach((member, i) => {
            const memberY = top - i * 11;
            draw(withoutPhoneNumbers(member.name), col.recipient, memberY, {
              size: 8,
              bold: true,
              maxWidth: colWidth.recipient - 34,
            });
            // Each member's share, without "Rp" to leave room for long names.
            drawRight(
              Math.round(member.amount).toLocaleString("id-ID"),
              col.recipient + colWidth.recipient - 4,
              memberY,
              { size: 8, color: muted },
            );
          });
        } else {
          draw(withoutPhoneNumbers(line.members[0]?.name || line.payeeName), col.recipient, top, {
            bold: true,
            maxWidth: colWidth.recipient - 4,
          });
        }

        draw(
          line.payAccountNumber
            ? `${line.bankName} ${line.payAccountNumber}`
            : "(rekening belum diisi)",
          col.account,
          top,
          { size: 8.5, maxWidth: colWidth.account },
        );
        if (line.viaName) {
          wrapTwo(withoutPhoneNumbers(line.viaName), colWidth.via, 8).forEach((text, i) => {
            draw(text, col.via, top - i * 10, { size: 8 });
          });
        }

        drawRight(rupiah(line.amount), col.amountRight, top, { bold: true });
        if (line.fee > 0) {
          drawRight(`+ biaya ${rupiah(line.fee)}`, col.amountRight, top - 11, {
            size: 7.5,
            color: muted,
          });
        }
        y -= rowHeight;
        hLine(y);
      });

      ensure(22);
      draw(`Total transfer bank (${transferTotals.count} transfer)`, col.ref, y - 14, { bold: true });
      drawRight(rupiah(transferTotals.amount), col.amountRight, y - 14, { bold: true });
      y -= 34;
    }

    // --- B. Cash through the distributor ---
    if (cash) {
      const listHeader = () => {
        page.drawRectangle({
          x: margin,
          y: y - 16,
          width: contentWidth,
          height: 16,
          color: shade,
        });
        const hy = y - 11.5;
        const opts = { size: 8, bold: true, color: muted };
        draw("No", col.no, hy, opts);
        draw("Diserahkan kepada", col.ref, hy, opts);
        drawRight("Jumlah", margin + 360, hy, opts);
        draw("Tanda terima", margin + 380, hy, opts);
        y -= 16;
      };

      ensure(120);
      draw(`${transfers.length > 0 ? "B" : "A"}. Tunai melalui penyalur`, margin, y - 10, {
        size: 11,
        bold: true,
      });
      y -= 18;

      const boxHeight = 50;
      page.drawRectangle({
        x: margin,
        y: y - boxHeight,
        width: contentWidth,
        height: boxHeight,
        borderColor: rule,
        borderWidth: 0.6,
      });
      if (cash.payeeName) {
        draw(cash.payeeName, margin + 10, y - 15, { size: 10, bold: true, maxWidth: 300 });
        draw(`${cash.bankName} ${cash.payAccountNumber}`, margin + 10, y - 28, {
          size: 9.5,
          maxWidth: 300,
        });
      } else {
        draw("Penyalur tunai belum diatur di halaman Pembayaran", margin + 10, y - 15, {
          size: 9.5,
          bold: true,
          maxWidth: 300,
        });
      }
      draw(`Ref ${cash.reference}  |  ${STATUS_LABEL[cash.status]}`, margin + 10, y - 41, {
        size: 8,
        color: muted,
      });
      drawRight(rupiah(cash.amount), right - 10, y - 17, { size: 12, bold: true });
      drawRight(
        `1 transfer untuk ${cash.members.length} orang${cash.fee > 0 ? `  + biaya ${rupiah(cash.fee)}` : ""}`,
        right - 10,
        y - 30,
        { size: 8, color: muted },
      );
      y -= boxHeight + 12;

      draw("Daftar pembagian tunai", margin, y - 9, { size: 9.5, bold: true });
      y -= 16;
      listHeader();
      // One row per hand-over: a family gets its cash together and signs once.
      const groups = cash.cashGroups ?? [];
      groups.forEach((group, index) => {
        const isFamily = group.members.length > 1;
        const rowHeight = isFamily ? 16 + group.members.length * 11 + 5 : 20;
        ensure(rowHeight, listHeader);
        const top = y - 13;
        draw(String(index + 1), col.no, top, { color: muted });
        draw(
          isFamily
            ? `${withoutPhoneNumbers(group.receiverName)} (${group.members.length} orang)`
            : group.receiverName,
          col.ref,
          top,
          { bold: isFamily, maxWidth: 250 },
        );
        drawRight(rupiah(group.amount), margin + 360, top, { bold: true });
        if (isFamily) {
          group.members.forEach((member, i) => {
            const memberY = top - 12 - i * 11;
            draw(member.name, col.ref + 10, memberY, { size: 8, color: muted, maxWidth: 200 });
            drawRight(rupiah(member.amount), margin + 300, memberY, { size: 8, color: muted });
          });
        }
        y -= rowHeight;
        hLine(y);
      });
      ensure(22);
      draw(
        `Total tunai (${cash.members.length} orang, ${groups.length} penyerahan)`,
        col.ref,
        y - 14,
        { bold: true },
      );
      drawRight(rupiah(cash.amount), margin + 360, y - 14, { bold: true });
      y -= 30;
    }

    // --- Page numbers ---
    const pages = pdf.getPages();
    pages.forEach((p, index) => {
      const label = `${pdfSafe(batch.name)}  |  Halaman ${index + 1} / ${pages.length}`;
      p.drawText(label, {
        x: right - font.widthOfTextAtSize(label, 7.5),
        y: margin - 12,
        size: 7.5,
        font,
        color: muted,
      });
    });

    const bytes = await pdf.save();
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="efata-pembayaran-batch-${batchId}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error generating payments PDF:", error);
    return json({ error: "Gagal membuat PDF pembayaran" }, { status: 500 });
  }
};
