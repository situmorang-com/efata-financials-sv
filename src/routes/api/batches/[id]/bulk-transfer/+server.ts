import { json } from '@sveltejs/kit';
import { batchItemDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const data = await request.json();
		if (!data.item_ids || !Array.isArray(data.item_ids)) {
			return json({ error: 'item_ids array is required' }, { status: 400 });
		}
		const status = data.status || 'done';
		const count = batchItemDb.bulkUpdateTransfer(data.item_ids, status);
		return json({ message: `Updated ${count} items`, count });
	} catch (error) {
		console.error('Error bulk updating transfer:', error);
		return json({ error: 'Failed to bulk update' }, { status: 500 });
	}
};
