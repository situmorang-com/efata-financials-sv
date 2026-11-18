// Values to paste into Kopra's "Transaction Reference" and "Remark" fields when
// paying a batch, so each debit on the bank statement can be traced back to the
// batch row it paid (many rows in a batch share the same amount).

/** Kopra limits: Transaction Reference 19 characters, Remark 200. */
export const REFERENCE_MAX = 19;
export const REMARK_MAX = 200;

type BatchLike = { id?: number; name: string; period?: string | null; created_at?: string };

/** "2026-11" → "2611"; falls back to the batch's creation month, then "0000". */
function periodCode(batch: BatchLike): string {
	const ym = (batch.period || batch.created_at || '').slice(0, 7);
	const m = /^(\d{2})(\d{2})-(\d{2})$/.exec(ym);
	return m ? `${m[2]}${m[3]}` : '0000';
}

/**
 * Letters and digits only, so no bank form rejects it: EF + YYMM + B<batch id>
 * + R<row id>, e.g. "EF2611B12R345". Row ids are unique across batches, so the
 * reference alone identifies the row. A family transfer uses its lead row's id.
 */
export function buildTransferReference(batch: BatchLike, itemId: number): string {
	return `EF${periodCode(batch)}B${batch.id ?? 0}R${itemId}`.slice(0, REFERENCE_MAX);
}

/** Batch name without a leading "Transfer", e.g. "Transfer November 2026" → "November 2026". */
export function batchRemarkLabel(batchName?: string | null): string {
	return (batchName || '').trim().replace(/^transfer\s+/i, '') || 'bulan ini';
}

/** Keep characters bank forms accept; drop the rest (emoji, quotes, accents' marks). */
function clean(text: string): string {
	return text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^A-Za-z0-9 .,()/-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Some recipient names carry a phone number to tell two people apart, e.g.
 * "Maria (62…)". A remark is shown to the bank and the recipient, so drop any
 * long digit run (and the brackets left empty).
 */
function withoutPhoneNumbers(name: string): string {
	return name
		.replace(/\+?\d[\d\s-]{5,}\d/g, '')
		.replace(/\(\s*\)/g, '')
		.trim();
}

/** "EFATA November 2026 - Budi Santoso"; a family transfer lists every member. */
export function buildTransferRemark(batchName: string | null | undefined, recipientNames: string[]): string {
	const label = batchRemarkLabel(batchName);
	const prefix = /efata/i.test(label) ? label : `EFATA ${label}`;
	const names = recipientNames.map(withoutPhoneNumbers).filter(Boolean).join(', ');
	const text = clean(names ? `${prefix} - ${names}` : prefix);
	return text.slice(0, REMARK_MAX).trim();
}
