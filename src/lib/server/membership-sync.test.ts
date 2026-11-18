// Batch sync against membership dates, on a throwaway database (DATA_DIR).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'efata-test-'));
process.env.DATA_DIR = dir;

let dbm: typeof import('./db');

beforeAll(async () => {
	dbm = await import('./db');
});

afterAll(() => {
	rmSync(dir, { recursive: true, force: true });
});

function names(batchId: number) {
	return dbm.batchItemDb.getByBatchId(batchId).map((i) => i.recipient_name);
}

function addPerson(name: string, start: string, bank: string | undefined = 'BRI') {
	return dbm.recipientDb.create({
		name,
		bank_name: bank,
		account_number: '1111111111', // sensitive-ok: fake
		zoom_eligible: 1,
		is_active: 1,
		start_date: start
	});
}

describe('batch sync', () => {
	it('adds people whose dates overlap the batch month, with Mandiri fees', () => {
		const p = addPerson('Test Nov Start', '2026-11-10');
		const dana = addPerson('Test Dana', '2026-01-01', 'Dana');
		const later = addPerson('Test Dec Start', '2026-12-01');
		const nov = dbm.batchDb.create({ name: 'Transfer November 2026', period: '2026-11' });
		dbm.batchItemDb.sync(nov.id!, dbm.batchDb.getById(nov.id!)!);

		const items = dbm.batchItemDb.getByBatchId(nov.id!);
		expect(items.map((i) => i.recipient_id)).toContain(p.id);
		expect(items.map((i) => i.recipient_id)).not.toContain(later.id);
		expect(items.find((i) => i.recipient_id === p.id)!.transfer_fee).toBe(2500);
		expect(items.find((i) => i.recipient_id === dana.id)!.transfer_fee).toBe(1000);
	});

	it('ending a membership removes untouched rows but keeps paid ones', () => {
		const left = addPerson('Test Leaver', '2026-01-01');
		const paid = addPerson('Test Paid Leaver', '2026-01-01');
		const batch = dbm.batchDb.create({ name: 'Transfer Oktober 2026', period: '2026-10' });
		const b = dbm.batchDb.getById(batch.id!)!;
		dbm.batchItemDb.sync(batch.id!, b);
		const paidItem = dbm.batchItemDb.getByBatchId(batch.id!).find((i) => i.recipient_id === paid.id)!;
		dbm.batchItemDb.update(paidItem.id!, { transfer_status: 'done' });

		dbm.recipientDb.endMembership(left.id!, '2026-09-30');
		dbm.recipientDb.endMembership(paid.id!, '2026-09-30');
		const result = dbm.batchItemDb.sync(batch.id!, b);

		expect(result.removed).toContain('Test Leaver');
		expect(result.kept).toContain('Test Paid Leaver');
		expect(names(batch.id!)).not.toContain('Test Leaver');
	});

	it('rejoining starts a new period and keeps the old one', () => {
		const r = addPerson('Test Returner', '2026-01-01');
		dbm.recipientDb.endMembership(r.id!, '2026-03-31');
		expect(() => dbm.recipientDb.rejoin(r.id!, '2026-03-15')).toThrow();
		dbm.recipientDb.rejoin(r.id!, '2026-11-15');

		const periods = dbm.recipientDb.getPeriods(r.id!);
		expect(periods.map((p) => [p.start_date, p.end_date])).toEqual([
			['2026-01-01', '2026-03-31'],
			['2026-11-15', null]
		]);
		const inFeb = dbm.recipientDb.getForPeriod('2026-02').map((x) => x.id);
		const inJun = dbm.recipientDb.getForPeriod('2026-06').map((x) => x.id);
		const inNov = dbm.recipientDb.getForPeriod('2026-11').map((x) => x.id);
		expect(inFeb).toContain(r.id);
		expect(inJun).not.toContain(r.id);
		expect(inNov).toContain(r.id);
	});

	it('cash rows never carry a transfer fee', () => {
		const p = addPerson('Test Cash', '2026-01-01');
		const batch = dbm.batchDb.create({ name: 'Transfer Juli 2026', period: '2026-07' });
		dbm.batchItemDb.sync(batch.id!, dbm.batchDb.getById(batch.id!)!);
		const item = dbm.batchItemDb.getByBatchId(batch.id!).find((i) => i.recipient_id === p.id)!;
		dbm.batchItemDb.update(item.id!, { payment_method: 'cash', transfer_fee: 2500 });
		dbm.batchItemDb.bulkUpdateFees(batch.id!, [{ id: item.id!, transfer_fee: 9999 }]);
		expect(dbm.batchItemDb.getById(item.id!)!.transfer_fee).toBe(0);
	});

	it('purge is refused once something was paid', () => {
		const mistake = addPerson('Test Mistake', '2026-11-01');
		expect(dbm.recipientDb.canPurge(mistake.id!)).toBe(true);
		dbm.recipientDb.purge(mistake.id!);
		expect(dbm.recipientDb.getById(mistake.id!)).toBeUndefined();
	});
});
