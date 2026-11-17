import { json } from '@sveltejs/kit';
import { batchItemDb, batchDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

/** Sync the batch's recipients with membership dates for its month. */
export const POST: RequestHandler = async ({ params }) => {
	try {
		const batch = batchDb.getById(Number(params.id));
		if (!batch) {
			return json({ error: 'Batch not found' }, { status: 404 });
		}
		const result = batchItemDb.sync(Number(params.id), batch);
		return json({
			message: `Ditambah ${result.added.length}, dihapus ${result.removed.length}`,
			count: result.added.length,
			...result
		});
	} catch (error) {
		console.error('Error populating batch:', error);
		const message = error instanceof Error ? error.message : 'Failed to populate batch';
		return json({ error: message }, { status: 500 });
	}
};
