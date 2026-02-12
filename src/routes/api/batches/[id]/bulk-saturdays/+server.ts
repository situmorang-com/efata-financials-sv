import { json } from '@sveltejs/kit';
import { batchItemDb, batchDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const data = await request.json();
		const saturdays = data.saturdays;
		if (saturdays === undefined || saturdays === null) {
			return json({ error: 'saturdays is required' }, { status: 400 });
		}
		const batch = batchDb.getById(Number(params.id));
		if (!batch) {
			return json({ error: 'Batch not found' }, { status: 404 });
		}
		if (saturdays < 0 || saturdays > batch.total_saturdays) {
			return json({ error: `saturdays must be between 0 and ${batch.total_saturdays}` }, { status: 400 });
		}
		const count = batchItemDb.bulkUpdateSaturdays(Number(params.id), saturdays, batch);
		return json({ message: `Updated ${count} items to ${saturdays} saturdays`, count });
	} catch (error) {
		console.error('Error bulk updating saturdays:', error);
		return json({ error: 'Failed to bulk update saturdays' }, { status: 500 });
	}
};
