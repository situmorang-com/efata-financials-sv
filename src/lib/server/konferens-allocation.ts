/**
 * Allocation and validation rules for the monthly
 * "Laporan Keuangan GMAHK Konferens DKI Jakarta & Sekitarnya" form.
 *
 * The form is receipt-driven: every kwitansi is split across five columns,
 * grouped into Dana Mission Sedunia (remitted to Konferens) and Dana Jemaat
 * (retained by the local church).
 *
 * Church policy:
 *   - Perpuluhan          -> 100% Konferens
 *   - Terpadu (offering)  -> 50% Konferens / 50% Jemaat
 *   - Persembahan Khusus  -> 100% Jemaat, unless explicitly mission-designated
 */

export const ALLOCATION_BUCKETS = [
  "perpuluhan",
  "khusus_mission",
  "terpadu_konferens",
  "terpadu_jemaat",
  "khusus_jemaat",
] as const;

export type AllocationBucket = (typeof ALLOCATION_BUCKETS)[number];

/** Buckets that make up Dana Mission Sedunia — the amount owed to Konferens. */
export const KONFERENS_BUCKETS: AllocationBucket[] = [
  "perpuluhan",
  "khusus_mission",
  "terpadu_konferens",
];

/** Buckets that stay with the local church. */
export const JEMAAT_BUCKETS: AllocationBucket[] = [
  "terpadu_jemaat",
  "khusus_jemaat",
];

export const BUCKET_LABELS: Record<AllocationBucket, string> = {
  perpuluhan: "Perpuluhan",
  khusus_mission: "Persembahan Khusus (Mission)",
  terpadu_konferens: "50% Terpadu Konferens",
  terpadu_jemaat: "50% Terpadu Jemaat",
  khusus_jemaat: "Persembahan Khusus (Jemaat)",
};

export type ReceiptKind =
  | "perpuluhan"
  | "terpadu"
  | "khusus_jemaat"
  | "khusus_mission"
  | "mixed";

export type Allocation = { bucket: AllocationBucket; amount: number };

/** Konferens share of a terpadu offering, in percent. */
export const DEFAULT_TERPADU_KONFERENS_PCT = 50;

/**
 * Splits a terpadu offering between Konferens and jemaat.
 *
 * Collections are almost always in round hundreds, but the split must still be
 * deterministic for an odd rupiah. The remainder goes to Konferens so the
 * church can never under-remit.
 */
export function splitTerpadu(
  total: number,
  konferensPct: number = DEFAULT_TERPADU_KONFERENS_PCT,
): { konferens: number; jemaat: number } {
  const amount = Math.max(0, Math.trunc(total));
  const pct = Math.min(100, Math.max(0, konferensPct));
  const konferens = Math.ceil((amount * pct) / 100);
  return { konferens, jemaat: amount - konferens };
}

/**
 * Derives the five-column allocation for a receipt from its kind and total.
 * `mixed` receipts (one kwitansi covering both tithe and offering) must be
 * allocated by hand.
 */
export function allocateReceipt(
  kind: ReceiptKind,
  total: number,
  konferensPct: number = DEFAULT_TERPADU_KONFERENS_PCT,
): Allocation[] {
  const amount = Math.max(0, Math.trunc(total));
  if (amount === 0) return [];

  switch (kind) {
    case "perpuluhan":
      return [{ bucket: "perpuluhan", amount }];
    case "khusus_jemaat":
      return [{ bucket: "khusus_jemaat", amount }];
    case "khusus_mission":
      return [{ bucket: "khusus_mission", amount }];
    case "terpadu": {
      const split = splitTerpadu(amount, konferensPct);
      const allocations: Allocation[] = [];
      if (split.konferens > 0) {
        allocations.push({
          bucket: "terpadu_konferens",
          amount: split.konferens,
        });
      }
      if (split.jemaat > 0) {
        allocations.push({ bucket: "terpadu_jemaat", amount: split.jemaat });
      }
      return allocations;
    }
    case "mixed":
      return [];
  }
}

export type ReceiptValidation = {
  ok: boolean;
  allocated: number;
  difference: number;
  errors: string[];
};

/**
 * A receipt is only valid when its allocations add up to the Jumlah exactly.
 * This is the per-row control that makes the column cross-foot meaningful.
 */
export function validateReceiptAllocations(
  total: number,
  allocations: Allocation[],
): ReceiptValidation {
  const errors: string[] = [];
  const allocated = allocations.reduce(
    (sum, allocation) => sum + Math.trunc(allocation.amount),
    0,
  );
  const difference = allocated - Math.trunc(total);

  if (allocations.some((allocation) => allocation.amount < 0)) {
    errors.push("Alokasi tidak boleh negatif");
  }
  const seen = new Set<string>();
  for (const allocation of allocations) {
    if (seen.has(allocation.bucket)) {
      errors.push(`Bucket ganda: ${BUCKET_LABELS[allocation.bucket]}`);
    }
    seen.add(allocation.bucket);
  }
  if (difference !== 0) {
    errors.push(
      `Jumlah alokasi (${allocated}) tidak sama dengan Jumlah kwitansi (${Math.trunc(total)})`,
    );
  }

  return { ok: errors.length === 0, allocated, difference, errors };
}

export type ReceiptRow = {
  id?: number;
  receipt_no?: string | null;
  total_amount: number;
  allocations: Allocation[];
};

export type CrossFootResult = {
  ok: boolean;
  grand_total: number;
  allocated_total: number;
  difference: number;
  by_bucket: Record<AllocationBucket, number>;
  konferens_total: number;
  jemaat_total: number;
  unbalanced_receipts: Array<{
    id?: number;
    receipt_no?: string | null;
    total_amount: number;
    allocated: number;
    difference: number;
  }>;
};

/**
 * Reproduces the check a treasurer does by hand at the bottom of the page:
 * every column total added together must equal the Jumlah column total.
 */
export function crossFoot(rows: ReceiptRow[]): CrossFootResult {
  const byBucket = ALLOCATION_BUCKETS.reduce(
    (acc, bucket) => {
      acc[bucket] = 0;
      return acc;
    },
    {} as Record<AllocationBucket, number>,
  );

  let grandTotal = 0;
  const unbalanced: CrossFootResult["unbalanced_receipts"] = [];

  for (const row of rows) {
    const total = Math.trunc(row.total_amount);
    grandTotal += total;
    let allocated = 0;
    for (const allocation of row.allocations) {
      const amount = Math.trunc(allocation.amount);
      byBucket[allocation.bucket] += amount;
      allocated += amount;
    }
    if (allocated !== total) {
      unbalanced.push({
        id: row.id,
        receipt_no: row.receipt_no,
        total_amount: total,
        allocated,
        difference: allocated - total,
      });
    }
  }

  const allocatedTotal = ALLOCATION_BUCKETS.reduce(
    (sum, bucket) => sum + byBucket[bucket],
    0,
  );
  const konferensTotal = KONFERENS_BUCKETS.reduce(
    (sum, bucket) => sum + byBucket[bucket],
    0,
  );
  const jemaatTotal = JEMAAT_BUCKETS.reduce(
    (sum, bucket) => sum + byBucket[bucket],
    0,
  );

  return {
    ok: allocatedTotal === grandTotal && unbalanced.length === 0,
    grand_total: grandTotal,
    allocated_total: allocatedTotal,
    difference: allocatedTotal - grandTotal,
    by_bucket: byBucket,
    konferens_total: konferensTotal,
    jemaat_total: jemaatTotal,
    unbalanced_receipts: unbalanced,
  };
}

export type ReceiptNumberGap = {
  from: string;
  to: string;
  missing: string[];
};

/**
 * Finds breaks in the numbered receipt book. Gaps are usually voided
 * kwitansi, but an unexplained gap is the first thing an auditor pulls, so
 * they have to surface somewhere.
 *
 * Receipt numbers are treated as a numeric run sharing a common width
 * (e.g. 265021..265059); anything non-numeric is reported separately.
 */
export function findReceiptNumberGaps(
  receiptNos: Array<string | null | undefined>,
  maxGapSize = 50,
): { gaps: ReceiptNumberGap[]; unnumbered: number; nonNumeric: string[] } {
  const nonNumeric: string[] = [];
  const numbers: Array<{ value: number; width: number }> = [];
  let unnumbered = 0;

  for (const raw of receiptNos) {
    const text = String(raw ?? "").trim();
    if (!text) {
      unnumbered += 1;
      continue;
    }
    if (!/^\d+$/.test(text)) {
      nonNumeric.push(text);
      continue;
    }
    numbers.push({ value: Number(text), width: text.length });
  }

  const sorted = [...numbers].sort((left, right) => left.value - right.value);
  const gaps: ReceiptNumberGap[] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const distance = current.value - previous.value;
    if (distance <= 1 || distance - 1 > maxGapSize) continue;

    const width = Math.max(previous.width, current.width);
    const missing: string[] = [];
    for (let value = previous.value + 1; value < current.value; value += 1) {
      missing.push(String(value).padStart(width, "0"));
    }
    gaps.push({
      from: String(previous.value).padStart(previous.width, "0"),
      to: String(current.value).padStart(current.width, "0"),
      missing,
    });
  }

  return { gaps, unnumbered, nonNumeric };
}

export type GivingUnitCounts = {
  /** UPERPUL — Unit Pemberi Puluhan. */
  uperpul: number;
  /** UPERDU — Unit Pemberi Terpadu. */
  uperdu: number;
  /** JUTARI — Jumlah anggota pemberi. */
  jutari: number;
};

export type GiverLine = {
  giver_name: string;
  bucket: "perpuluhan" | "terpadu" | "khusus_jemaat" | "khusus_mission";
  amount: number;
};

/** Collapses spelling and spacing noise so one household counts once. */
export function normalizeGiverName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^(bpk|bapak|ibu|ibu\.|sdr|sdri|kel|kel\.|keluarga|pdt|pdt\.)\.?\s+/g, "")
    .replace(/[.,]/g, "");
}

/**
 * Derives the three statistical counters printed at the foot of the form.
 *
 * These count *giving units*, so they must be computed from per-giver lines,
 * not from receipts: a weekly terpadu collection is one kwitansi covering many
 * named envelopes, and counting the kwitansi would report 1 instead of 20.
 */
export function countGivingUnits(lines: GiverLine[]): GivingUnitCounts {
  const tithe = new Set<string>();
  const terpadu = new Set<string>();
  const all = new Set<string>();

  for (const line of lines) {
    if (Math.trunc(line.amount) <= 0) continue;
    const name = normalizeGiverName(line.giver_name);
    if (!name) continue;

    all.add(name);
    if (line.bucket === "perpuluhan") tithe.add(name);
    if (line.bucket === "terpadu") terpadu.add(name);
  }

  return { uperpul: tithe.size, uperdu: terpadu.size, jutari: all.size };
}
