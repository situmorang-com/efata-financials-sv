import { describe, expect, it } from 'vitest';
import {
	isValidDate,
	isValidPeriod,
	membershipStatus,
	nextDay,
	periodBounds,
	periodFromBatchName
} from './membership';

describe('periodFromBatchName', () => {
	it('reads Indonesian and English month names', () => {
		expect(periodFromBatchName('Transfer Februari 2026')).toBe('2026-02');
		expect(periodFromBatchName('Transfer December 2025')).toBe('2025-12');
	});
	it('returns null when there is no month and year', () => {
		expect(periodFromBatchName('Bantuan Natal')).toBeNull();
		expect(periodFromBatchName('Mei')).toBeNull();
	});
});

describe('dates', () => {
	it('validates real calendar dates only', () => {
		expect(isValidDate('2026-02-28')).toBe(true);
		expect(isValidDate('2026-02-30')).toBe(false);
		expect(isValidDate('18/11/2026')).toBe(false);
		expect(isValidPeriod('2026-13')).toBe(false);
	});
	it('nextDay crosses month and year ends', () => {
		expect(nextDay('2026-10-31')).toBe('2026-11-01');
		expect(nextDay('2026-12-31')).toBe('2027-01-01');
	});
	it('periodBounds covers every day of the month by string comparison', () => {
		const { first, last } = periodBounds('2026-02');
		expect('2026-02-28' >= first && '2026-02-28' <= last).toBe(true);
		expect('2026-03-01' <= last).toBe(false);
	});
});

describe('membershipStatus', () => {
	const today = '2026-11-18';
	it('classifies a period against today', () => {
		expect(membershipStatus('2026-02-01', null, today)).toBe('active');
		expect(membershipStatus('2026-12-01', null, today)).toBe('upcoming');
		expect(membershipStatus('2026-02-01', '2026-11-30', today)).toBe('ending');
		expect(membershipStatus('2026-02-01', '2026-10-31', today)).toBe('ended');
	});
});
