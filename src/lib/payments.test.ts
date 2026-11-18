import { describe, expect, it } from 'vitest';
import type { Batch, BatchItem } from './types';
import { buildPaymentLines, payAccountNumber, sumPaymentLines } from './payments';

const batch: Batch = {
	id: 12,
	type: 'monthly',
	name: 'Transfer Oktober 2026',
	default_amount: 0,
	total_saturdays: 4,
	transport_rate: 25000,
	zoom_single_rate: 50000,
	zoom_family_rate: 30000,
	status: 'active',
	period: '2026-10',
	created_at: '2026-10-01T00:00:00Z',
	updated_at: '2026-10-01T00:00:00Z'
};

let nextRecipient = 1;
function row(id: number, name: string, amount: number, extra: Partial<BatchItem> = {}): BatchItem {
	return {
		id,
		batch_id: 12,
		recipient_id: nextRecipient++,
		amount,
		payment_method: 'transfer',
		saturdays_attended: 0,
		wednesdays_attended: 0,
		zoom_type: 'none',
		custom_zoom_amount: 0,
		transfer_status: 'pending',
		notify_status: 'pending',
		transfer_fee: 0,
		created_at: '',
		updated_at: '',
		recipient_name: name,
		bank_name: 'BCA',
		account_number: `11${id}`,
		actual_bank_name: 'BCA',
		actual_account_number: `11${id}`,
		actual_account_holder: name,
		...extra
	};
}

// "Ani" is paid through "Budi": same family, same account.
const viaBudi = { family_group_id: 5, actual_account_number: '777', actual_account_holder: 'Budi' };
const ani = row(310, 'Ani', 130000, { ...viaBudi, transfer_to_id: 99, transfer_to_name: 'Budi' });
const budi = row(320, 'Budi', 130000, { ...viaBudi, account_number: '777', transfer_fee: 2500 });
const citra = row(330, 'Citra', 150000, { transfer_fee: 2500 });
const dewi = row(340, 'Dewi', 100000, { payment_method: 'cash' });
const eko = row(350, 'Eko', 50000, { payment_method: 'cash' });
const nol = row(360, 'Fajar', 0);

const opts = { sourceBank: 'mandiri' as const };

describe('buildPaymentLines', () => {
	it('merges a family into one transfer named after the lead row', () => {
		const lines = buildPaymentLines(batch, [ani, budi, citra, nol], opts);
		expect(lines.map((l) => l.key)).toEqual(['item:310', 'item:330']);
		const family = lines[0];
		expect(family.payeeName).toBe('Budi');
		expect(family.amount).toBe(260000);
		expect(family.fee).toBe(2500);
		expect(family.itemIds).toEqual([310, 320]);
		expect(family.reference).toBe('EF2610B12R310');
		expect(family.remark).toBe('EFATA Oktober 2026 (2 orang) - Ani / Budi');
	});

	it('leaves rows without an amount out, but keeps the family reference', () => {
		const lines = buildPaymentLines(batch, [{ ...ani, amount: 0 }, budi], opts);
		expect(lines).toHaveLength(1);
		expect(lines[0].reference).toBe('EF2610B12R310');
		expect(lines[0].amount).toBe(130000);
		expect(lines[0].remark).toBe('EFATA Oktober 2026 - Budi');
	});

	it('puts every cash row into one transfer to the cash distributor', () => {
		const lines = buildPaymentLines(batch, [citra, dewi, eko], {
			...opts,
			cashDistributor: { name: 'Pak Kas', bank_name: 'BNI', account_number: '12 34 56' }
		});
		const cash = lines.at(-1)!;
		expect(cash.kind).toBe('cash');
		expect(cash.payeeName).toBe('Pak Kas');
		expect(cash.payAccountNumber).toBe('123456');
		expect(cash.amount).toBe(150000);
		expect(cash.fee).toBe(2500);
		expect(cash.members.map((m) => m.name)).toEqual(['Dewi', 'Eko']);
		expect(cash.reference).toBe('EF2610B12C');
		expect(cash.remark).toBe('EFATA Oktober 2026 - Tunai untuk 2 orang');
		expect(sumPaymentLines(lines)).toEqual({ count: 2, amount: 300000, fee: 5000 });
	});

	it('groups cash by family, one hand-over per family', () => {
		const cashFamily = [ani, budi].map((item) => ({ ...item, payment_method: 'cash' as const }));
		const lines = buildPaymentLines(batch, [...cashFamily, dewi, citra], opts);
		const cash = lines.at(-1)!;
		expect(cash.amount).toBe(360000);
		expect(cash.members).toHaveLength(3);
		expect(cash.remark).toBe('EFATA Oktober 2026 - Tunai untuk 3 orang');
		expect(cash.cashGroups).toEqual([
			{
				receiverName: 'Budi',
				amount: 260000,
				members: [
					{ itemId: 310, name: 'Ani', amount: 130000 },
					{ itemId: 320, name: 'Budi', amount: 130000 }
				]
			},
			{ receiverName: 'Dewi', amount: 100000, members: [{ itemId: 340, name: 'Dewi', amount: 100000 }] }
		]);
		// One family member in cash, the other by transfer: each stands alone.
		const mixed = buildPaymentLines(batch, [{ ...ani, payment_method: 'cash' }, budi], opts);
		expect(mixed.map((l) => l.key)).toEqual(['item:320', 'cash']);
		expect(mixed[1].cashGroups?.map((g) => g.receiverName)).toEqual(['Ani']);
	});

	it('reports status per transfer', () => {
		const at = '2026-10-30T00:00:00Z';
		const status = (items: BatchItem[], b: Batch = batch) =>
			buildPaymentLines(b, items, opts).map((l) => l.status);
		expect(status([ani, budi])).toEqual(['todo']);
		expect(status([{ ...ani, kopra_submitted_at: at }, budi])).toEqual(['todo']);
		expect(status([{ ...ani, kopra_submitted_at: at }, { ...budi, kopra_submitted_at: at }])).toEqual(['submitted']);
		expect(status([{ ...ani, transfer_status: 'done' }, { ...budi, transfer_status: 'done' }])).toEqual(['done']);
		expect(status([dewi], { ...batch, cash_payout_submitted_at: at })).toEqual(['submitted']);
		expect(status([dewi], { ...batch, cash_payout_submitted_at: at, cash_payout_done_at: at })).toEqual(['done']);
	});
});

describe('payAccountNumber', () => {
	it('turns a Dana phone number into the source bank virtual account', () => {
		expect(payAccountNumber('Dana', '62-800 0000', 'mandiri')).toBe('8950808000000'); // sensitive-ok
		expect(payAccountNumber('Dana', '8000000', 'bca')).toBe('390108000000'); // sensitive-ok
		expect(payAccountNumber('BCA', '12 345', 'mandiri')).toBe('12345');
	});
});
