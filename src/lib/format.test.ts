import { describe, expect, it } from 'vitest';
import { generateWhatsAppMessage } from './format';

const details = {
	saturdays_attended: 4,
	transport_rate: 25000,
	zoom_type: 'none' as const,
	zoom_amount: 0
};
const account = { actual_bank_name: 'BCA', actual_account_number: '1234', batch_label: 'Oktober 2026' };

describe('generateWhatsAppMessage: who the account belongs to', () => {
	it('names an outside account holder and the relationship', () => {
		const msg = generateWhatsAppMessage('Eli', 150000, details, undefined, {
			...account,
			transfer_to_name: 'Eli',
			account_holder_name: 'Jo Paulina',
			account_holder_relation: 'Anak'
		});
		expect(msg).toContain('➡️ Rekening tujuan: BCA 1234\n➡️ Melalui: Jo Paulina (Anak)\n✅ Total');
	});

	it('names the recipient it is sent through, without a relationship if none is set', () => {
		const msg = generateWhatsAppMessage('Ani', 50000, details, undefined, {
			...account,
			transfer_to_name: 'Budi'
		});
		expect(msg).toContain('➡️ Melalui: Budi\n');
	});

	it('adds nothing for the recipient’s own account', () => {
		const msg = generateWhatsAppMessage('Citra', 50000, details, undefined, {
			...account,
			transfer_to_name: 'Citra'
		});
		expect(msg).not.toContain('Melalui');
	});

	it('shows the holder and relationship on a family transfer', () => {
		const msg = generateWhatsAppMessage('Ani', 60000, details, undefined, {
			...account,
			is_family_transfer: true,
			transfer_to_name: 'Budi',
			account_holder_relation: 'Suami',
			family_member_names: ['Ani', 'Budi'],
			family_total_transfer: 60000
		});
		expect(msg).toContain('➡️ Melalui: Budi (Suami)');
	});

	it('also covers the short message without attendance', () => {
		const msg = generateWhatsAppMessage('Eli', 150000, undefined, undefined, {
			...account,
			transfer_to_name: 'Eli',
			account_holder_name: 'Jo Paulina',
			account_holder_relation: 'Anak'
		});
		expect(msg).toContain('➡️ Rekening tujuan: BCA 1234\n➡️ Melalui: Jo Paulina (Anak)');
	});
});
