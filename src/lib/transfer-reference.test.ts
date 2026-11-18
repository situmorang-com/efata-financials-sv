import { describe, expect, it } from 'vitest';
import {
	REFERENCE_MAX,
	REMARK_MAX,
	buildTransferReference,
	buildTransferRemark
} from './transfer-reference';

describe('buildTransferReference', () => {
	it('encodes period, batch and row', () => {
		expect(buildTransferReference({ id: 12, name: 'x', period: '2026-11' }, 345)).toBe('EF2611B12R345');
	});

	it('falls back to the creation month without a period', () => {
		expect(
			buildTransferReference({ id: 3, name: 'x', period: null, created_at: '2026-04-02T10:00:00Z' }, 7)
		).toBe('EF2604B3R7');
	});

	it('stays alphanumeric and within the Kopra limit for large ids', () => {
		const ref = buildTransferReference({ id: 9999, name: 'x', period: '2026-11' }, 999999);
		expect(ref).toMatch(/^[A-Z0-9]+$/);
		expect(ref.length).toBeLessThanOrEqual(REFERENCE_MAX);
	});
});

describe('buildTransferRemark', () => {
	it('drops the leading "Transfer" and adds EFATA', () => {
		expect(buildTransferRemark('Transfer November 2026', ['Budi Santoso'])).toBe(
			'EFATA November 2026 - Budi Santoso'
		);
	});

	it('does not repeat EFATA and lists family members', () => {
		expect(buildTransferRemark('EFATA Natal 2026', ['A Satu L.S', 'B Dua'])).toBe(
			'EFATA Natal 2026 (2 orang) - A Satu L.S / B Dua'
		);
	});

	it('leaves phone numbers in names out of the remark', () => {
		expect(buildTransferRemark('Transfer Mei', ['Maria (6280000000000)', 'Yosef'])).toBe( // sensitive-ok
			'EFATA Mei (2 orang) - Maria / Yosef'
		);
		expect(buildTransferRemark('Transfer Mei', ['Daniel +62 800-0000-0000'])).toBe('EFATA Mei - Daniel'); // sensitive-ok
		expect(buildTransferRemark('Transfer Mei', ['Tan Wei Ming (Andi Tan)'])).toBe(
			'EFATA Mei - Tan Wei Ming (Andi Tan)'
		);
	});

	it('removes characters a bank form may reject and caps the length', () => {
		expect(buildTransferRemark('Transfer Mei', ['Sari "Ina" Wijaya 🙏'])).toBe(
			'EFATA Mei - Sari Ina Wijaya'
		);
		const long = buildTransferRemark('Transfer Mei', Array(40).fill('Nama Panjang Sekali'));
		expect(long.length).toBeLessThanOrEqual(REMARK_MAX);
	});
});
