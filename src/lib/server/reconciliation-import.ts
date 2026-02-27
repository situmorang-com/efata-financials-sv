import { createHash } from "crypto";

export type ParsedBankStatementLine = {
  line_no: number;
  post_date: string;
  remarks: string;
  additional_desc: string;
  credit_amount: number;
  debit_amount: number;
  signed_amount: number;
  close_balance: number;
  line_hash: string;
};

export type ParsedBankStatementImport = {
  account_no: string;
  ccy: string;
  file_hash: string;
  lines: ParsedBankStatementLine[];
  line_count: number;
  total_credit: number;
  total_debit: number;
  opening_balance: number;
  closing_balance: number;
  period_from: string;
  period_to: string;
};

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function parseDateTime(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) throw new Error("PostDate is empty");
  const fallback = new Date(trimmed);
  if (!Number.isNaN(fallback.getTime())) return fallback.toISOString();

  const match = trimmed.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!match) {
    throw new Error(`Invalid PostDate format: ${trimmed}`);
  }
  const day = Number(match[1]);
  const month = MONTHS[match[2].toLowerCase()];
  const year = Number(match[3]);
  const hh = Number(match[4]);
  const mm = Number(match[5]);
  const ss = Number(match[6]);
  if (month === undefined) {
    throw new Error(`Invalid month in PostDate: ${trimmed}`);
  }
  const dt = new Date(Date.UTC(year, month, day, hh, mm, ss));
  return dt.toISOString();
}

function parseAmount(value: string): number {
  const cleaned = String(value || "")
    .replace(/,/g, "")
    .trim();
  if (!cleaned) return 0;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return 0;
  return num;
}

function stableHash(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export function parseBankStatementCsv(content: string): ParsedBankStatementImport {
  const normalized = String(content || "").replace(/^\uFEFF/, "");
  const rows = normalized
    .split(/\r?\n/)
    .map((r) => r.trimEnd())
    .filter((r) => r.trim().length > 0);
  if (rows.length < 2) {
    throw new Error("CSV kosong atau tidak memiliki data transaksi");
  }

  const headers = rows[0].split(";").map((h) => h.trim());
  const required = [
    "AccountNo",
    "Ccy",
    "PostDate",
    "Remarks",
    "AdditionalDesc",
    "Credit Amount",
    "Debit Amount",
    "Close Balance",
  ];
  for (const col of required) {
    if (!headers.includes(col)) {
      throw new Error(`Kolom wajib tidak ditemukan: ${col}`);
    }
  }
  const idx = (name: string) => headers.indexOf(name);

  const lines: ParsedBankStatementLine[] = [];
  let totalCredit = 0;
  let totalDebit = 0;
  let accountNo = "";
  let ccy = "";

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i].split(";");
    if (cols.length < headers.length) continue;
    const account = (cols[idx("AccountNo")] || "").trim();
    const currency = (cols[idx("Ccy")] || "").trim();
    const postIso = parseDateTime(cols[idx("PostDate")] || "");
    const remarks = (cols[idx("Remarks")] || "").trim();
    const additional = (cols[idx("AdditionalDesc")] || "").trim();
    const credit = parseAmount(cols[idx("Credit Amount")] || "0");
    const debit = parseAmount(cols[idx("Debit Amount")] || "0");
    const closeBalance = parseAmount(cols[idx("Close Balance")] || "0");
    const signed = credit - debit;

    if (!accountNo) accountNo = account;
    if (!ccy) ccy = currency;
    totalCredit += credit;
    totalDebit += debit;

    const lineHash = stableHash([
      account,
      currency,
      postIso,
      remarks,
      additional,
      credit.toFixed(2),
      debit.toFixed(2),
      closeBalance.toFixed(2),
    ]);

    lines.push({
      line_no: i,
      post_date: postIso,
      remarks,
      additional_desc: additional,
      credit_amount: credit,
      debit_amount: debit,
      signed_amount: signed,
      close_balance: closeBalance,
      line_hash: lineHash,
    });
  }

  if (lines.length === 0) {
    throw new Error("Tidak ada baris transaksi valid di CSV");
  }

  lines.sort((a, b) => a.post_date.localeCompare(b.post_date));
  const first = lines[0];
  const last = lines[lines.length - 1];
  const openingBalance = first.close_balance - first.credit_amount + first.debit_amount;
  const fileHash = createHash("sha256").update(normalized).digest("hex");

  return {
    account_no: accountNo,
    ccy,
    file_hash: fileHash,
    lines,
    line_count: lines.length,
    total_credit: totalCredit,
    total_debit: totalDebit,
    opening_balance: openingBalance,
    closing_balance: last.close_balance,
    period_from: first.post_date.slice(0, 10),
    period_to: last.post_date.slice(0, 10),
  };
}
