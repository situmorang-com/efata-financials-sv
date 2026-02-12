import { json } from '@sveltejs/kit';
import { batchItemDb, batchDb } from '$lib/server/db.js';
import { calculateAmount } from '$lib/types.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const items = batchItemDb.getByBatchId(Number(params.id));
		return json(items);
	} catch (error) {
		console.error('Error fetching batch items:', error);
		return json({ error: 'Failed to fetch batch items' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const data = await request.json();
		if (!data.recipient_id) {
			return json({ error: 'recipient_id is required' }, { status: 400 });
		}
		const batch = batchDb.getById(Number(params.id));
		if (!batch) {
			return json({ error: 'Batch not found' }, { status: 404 });
		}
		const saturdays = data.saturdays_attended ?? 0;
		const zoomType = data.zoom_type ?? 'none';
		const amount = data.amount ?? calculateAmount(
			saturdays,
			batch.transport_rate,
			zoomType,
			batch.zoom_single_rate,
			batch.zoom_family_rate
		);
		const item = batchItemDb.create(
			Number(params.id),
			data.recipient_id,
			amount,
			saturdays,
			zoomType
		);
		if (!item) {
			return json({ error: 'Recipient already in this batch' }, { status: 409 });
		}
		return json(item, { status: 201 });
	} catch (error) {
		console.error('Error adding batch item:', error);
		return json({ error: 'Failed to add batch item' }, { status: 500 });
	}
};
