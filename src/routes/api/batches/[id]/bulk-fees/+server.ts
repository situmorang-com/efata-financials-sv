import { json } from '@sveltejs/kit';
import { batchItemDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const data = await request.json();
		if (!Array.isArray(data?.fees)) {
			return json({ error: 'fees array is required' }, { status: 400 });
		}
		const fees = data.fees
			.map((f: { id: unknown; transfer_fee: unknown }) => ({
				id: Number(f?.id),
				transfer_fee: Math.max(0, Math.round(Number(f?.transfer_fee) || 0))
			}))
			.filter((f: { id: number }) => Number.isFinite(f.id) && f.id > 0);
		const count = batchItemDb.bulkUpdateFees(Number(params.id), fees);
		return json({ message: `Updated ${count} items`, count });
	} catch (error) {
		console.error('Error bulk updating fees:', error);
		return json({ error: 'Failed to update transfer fees' }, { status: 500 });
	}
};
