import { json } from '@sveltejs/kit';
import { recipientDb, batchItemDb } from '$lib/server/db.js';
import { isValidDate } from '$lib/membership.js';
import type { RequestHandler } from './$types.js';

/**
 * Bring back someone whose membership ended: starts a new period on
 * start_date and keeps the old one, so past batches are unaffected.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const id = Number(params.id);
		const { start_date } = await request.json();
		if (!isValidDate(start_date)) {
			return json({ error: 'Tanggal mulai tidak valid' }, { status: 400 });
		}
		if (!recipientDb.getById(id)) {
			return json({ error: 'Recipient not found' }, { status: 404 });
		}
		try {
			recipientDb.rejoin(id, start_date);
		} catch (e) {
			return json({ error: (e as Error).message }, { status: 400 });
		}
		const sync = batchItemDb.syncOpenBatches();
		return json({ ...recipientDb.getById(id), sync });
	} catch (error) {
		console.error('Error rejoining recipient:', error);
		return json({ error: 'Gagal mengaktifkan kembali penerima' }, { status: 500 });
	}
};
