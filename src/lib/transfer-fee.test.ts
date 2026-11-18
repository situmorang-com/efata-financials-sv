import { describe, expect, it } from 'vitest';
import { DEFAULT_SOURCE_BANK, getTransferFee } from './transfer-fee';

describe('getTransferFee', () => {
	it('defaults new batches to Mandiri', () => {
		expect(DEFAULT_SOURCE_BANK).toBe('mandiri');
	});
	it('is free within the same bank, 1.000 to Dana, 2.500 otherwise', () => {
		expect(getTransferFee('mandiri', 'Mandiri')).toBe(0);
		expect(getTransferFee('bca', ' BCA ')).toBe(0);
		expect(getTransferFee('mandiri', 'Dana')).toBe(1000);
		expect(getTransferFee('mandiri', 'BCA')).toBe(2500);
		expect(getTransferFee('bca', 'BRI')).toBe(2500);
	});
});
