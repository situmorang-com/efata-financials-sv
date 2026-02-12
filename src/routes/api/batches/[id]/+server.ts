import { json } from '@sveltejs/kit';
import { batchDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const batch = batchDb.getById(Number(params.id));
		if (!batch) {
			return json({ error: 'Batch not found' }, { status: 404 });
		}
		return json(batch);
	} catch (error) {
		console.error('Error fetching batch:', error);
		return json({ error: 'Failed to fetch batch' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const data = await request.json();
		const success = batchDb.update(Number(params.id), data);
		if (!success) {
			return json({ error: 'Batch not found' }, { status: 404 });
		}
		const updated = batchDb.getById(Number(params.id));
		return json(updated);
	} catch (error) {
		console.error('Error updating batch:', error);
		return json({ error: 'Failed to update batch' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const success = batchDb.delete(Number(params.id));
		if (!success) {
			return json({ error: 'Batch not found' }, { status: 404 });
		}
		return json({ message: 'Batch deleted' });
	} catch (error) {
		console.error('Error deleting batch:', error);
		return json({ error: 'Failed to delete batch' }, { status: 500 });
	}
};
