import { json } from '@sveltejs/kit';
import { batchItemDb, batchDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ params }) => {
	try {
		const batch = batchDb.getById(Number(params.id));
		if (!batch) {
			return json({ error: 'Batch not found' }, { status: 404 });
		}
		const count = batchItemDb.populate(Number(params.id), batch);
		return json({ message: `Added ${count} recipients to batch`, count });
	} catch (error) {
		console.error('Error populating batch:', error);
		return json({ error: 'Failed to populate batch' }, { status: 500 });
	}
};
