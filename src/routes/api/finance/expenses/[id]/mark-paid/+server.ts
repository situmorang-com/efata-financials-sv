import { json } from '@sveltejs/kit';
import { financeTransactionDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (!id) return json({ error: 'Invalid id' }, { status: 400 });

    const success = financeTransactionDb.markPaid(id);
    if (!success) return json({ error: 'Expense transaction not found' }, { status: 404 });

    return json(financeTransactionDb.getById(id));
  } catch (error) {
    console.error('Error marking expense transaction as paid:', error);
    return json({ error: 'Failed to mark expense as paid' }, { status: 500 });
  }
};
