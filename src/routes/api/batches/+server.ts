import { json } from '@sveltejs/kit';
import { batchDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
	try {
		const batches = batchDb.getAll();
		return json(batches);
	} catch (error) {
		console.error('Error fetching batches:', error);
		return json({ error: 'Failed to fetch batches' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const data = await request.json();
		if (!data.name) {
			return json({ error: 'Name is required' }, { status: 400 });
		}
		const batch = batchDb.create({
			name: data.name,
			description: data.description,
			default_amount: data.default_amount,
			total_saturdays: data.total_saturdays,
			transport_rate: data.transport_rate,
			zoom_single_rate: data.zoom_single_rate,
			zoom_family_rate: data.zoom_family_rate
		});
		return json(batch, { status: 201 });
	} catch (error) {
		console.error('Error creating batch:', error);
		return json({ error: 'Failed to create batch' }, { status: 500 });
	}
};
