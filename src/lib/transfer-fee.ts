// Bank transfer fees, shared by the batch page ("Hitung Biaya") and the
// server, which uses them to fill fees when a batch is first populated.

export type SourceBank = 'mandiri' | 'bca';

/** New batches assume transfers are sent from the church's Mandiri account. */
export const DEFAULT_SOURCE_BANK: SourceBank = 'mandiri';

/** Fee for one transfer from sourceBank to an account at destBankName. */
export function getTransferFee(sourceBank: SourceBank, destBankName?: string | null): number {
	const destBank = String(destBankName || '').trim().toLowerCase();
	if (destBank === 'dana') return 1000;
	if (sourceBank === 'mandiri' && destBank === 'mandiri') return 0;
	if (sourceBank === 'bca' && destBank === 'bca') return 0;
	return 2500;
}
