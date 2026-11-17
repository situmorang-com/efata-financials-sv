import { json } from '@sveltejs/kit';
import { recipientDb, batchItemDb } from '$lib/server/db.js';
import { isValidDate } from '$lib/membership.js';
import type { RequestHandler } from './$types.js';

/** End a recipient's membership on end_date (inclusive) and resync open batches. */
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const id = Number(params.id);
		const { end_date } = await request.json();
		if (!isValidDate(end_date)) {
			return json({ error: 'Tanggal berhenti tidak valid' }, { status: 400 });
		}
		if (!recipientDb.getById(id)) {
			return json({ error: 'Recipient not found' }, { status: 404 });
		}
		try {
			recipientDb.endMembership(id, end_date);
		} catch (e) {
			return json({ error: (e as Error).message }, { status: 400 });
		}
		const sync = batchItemDb.syncOpenBatches();
		return json({ ...recipientDb.getById(id), sync });
	} catch (error) {
		console.error('Error ending membership:', error);
		return json({ error: 'Gagal menonaktifkan penerima' }, { status: 500 });
	}
};
