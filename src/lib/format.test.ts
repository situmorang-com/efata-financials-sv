import { describe, expect, it } from 'vitest';
import { generateCashPayoutMessage, generateWhatsAppMessage } from './format';

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
		expect(msg).toContain('🏦 Rekening tujuan: BCA 1234\n🤝 Melalui: Jo Paulina (Anak)\n💰 Total');
	});

	it('names the recipient it is sent through, without a relationship if none is set', () => {
		const msg = generateWhatsAppMessage('Ani', 50000, details, undefined, {
			...account,
			transfer_to_name: 'Budi'
		});
		expect(msg).toContain('🤝 Melalui: Budi\n');
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
		expect(msg).toContain('🤝 Melalui: Budi (Suami)');
	});

	it('also covers the short message without attendance', () => {
		const msg = generateWhatsAppMessage('Eli', 150000, undefined, undefined, {
			...account,
			transfer_to_name: 'Eli',
			account_holder_name: 'Jo Paulina',
			account_holder_relation: 'Anak'
		});
		expect(msg).toContain('🏦 Rekening tujuan: BCA 1234\n🤝 Melalui: Jo Paulina (Anak)');
	});
});

describe('generateWhatsAppMessage: zoom', () => {
	it('shows flat zoom pay even when no Wednesday was recorded', () => {
		const msg = generateWhatsAppMessage(
			'Anita',
			150000,
			{ saturdays_attended: 4, wednesdays_attended: 0, transport_rate: 25000, zoom_type: 'single', zoom_amount: 50000 },
			undefined,
			{ ...account, transfer_to_name: 'Anita' }
		);
		expect(msg).toContain('- Anita\n       ↳ 4 sabat\n       ↳ zoom Rp 50.000\n');
	});

	it('adds the Wednesday evenings when they were recorded', () => {
		const msg = generateWhatsAppMessage(
			'Anita',
			150000,
			{ saturdays_attended: 4, wednesdays_attended: 3, transport_rate: 25000, zoom_type: 'single', zoom_amount: 50000 },
			undefined,
			{ ...account, transfer_to_name: 'Anita' }
		);
		expect(msg).toContain('↳ zoom Rp 50.000 (3 rabu malam)');
	});

	it('shows each family member’s zoom pay', () => {
		const msg = generateWhatsAppMessage('Ani', 130000, details, undefined, {
			...account,
			is_family_transfer: true,
			transfer_to_name: 'Budi',
			family_member_names: ['Ani', 'Budi'],
			family_total_transfer: 260000,
			family_member_details: [
				{ name: 'Ani', saturdays_attended: 4, zoom_sessions: 0, zoom_label: 'zoom', zoom_amount: 30000 },
				{ name: 'Budi', saturdays_attended: 4 }
			]
		});
		expect(msg).toContain('- Ani\n       ↳ 4 sabat\n       ↳ zoom Rp 30.000\n- Budi\n       ↳ 4 sabat\n');
	});

	it('adds no zoom line for someone without zoom', () => {
		const msg = generateWhatsAppMessage('Citra', 100000, details, undefined, { ...account, transfer_to_name: 'Citra' });
		expect(msg).not.toContain('zoom');
	});
});

describe('generateCashPayoutMessage', () => {
	const payout = {
		distributorName: 'Rina',
		batchLabel: 'Oktober 2026',
		bankName: 'BNI',
		accountNumber: '9876',
		amount: 300000,
		groups: [
			{ receiverName: 'Budi', amount: 100000, members: [{ name: 'Budi', amount: 100000 }] },
			{
				receiverName: 'Sari',
				amount: 200000,
				members: [
					{ name: 'Sari', amount: 120000 },
					{ name: 'Tono', amount: 80000 }
				]
			}
		]
	};

	it('lists each hand-over, a family with its members, and the receipt', () => {
		const msg = generateCashPayoutMessage({ ...payout, proofUrl: 'https://x/proof' });
		expect(msg).toContain('Halo Rina,');
		expect(msg).toContain('🏦 Rekening tujuan: BNI 9876');
		expect(msg).toContain('💰 Total transfer: Rp 300.000');
		expect(msg).toContain('- Budi: Rp 100.000');
		expect(msg).not.toContain('↳ Budi');
		expect(msg).toContain('- Sari: Rp 200.000\n       ↳ Sari: Rp 120.000\n       ↳ Tono: Rp 80.000');
		expect(msg.endsWith('🧾 Bukti transfer: https://x/proof')).toBe(true);
	});

	it('leaves the receipt line out when there is none', () => {
		expect(generateCashPayoutMessage(payout)).not.toContain('Bukti transfer');
	});
});
