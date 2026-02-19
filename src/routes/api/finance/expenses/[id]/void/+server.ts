import { json } from '@sveltejs/kit';
import { financeTransactionDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (!id) return json({ error: 'Invalid id' }, { status: 400 });

    const success = financeTransactionDb.softVoid(id);
    if (!success) return json({ error: 'Expense transaction not found' }, { status: 404 });

    return json(financeTransactionDb.getById(id));
  } catch (error) {
    console.error('Error voiding expense transaction:', error);
    return json({ error: 'Failed to void expense transaction' }, { status: 500 });
  }
};
