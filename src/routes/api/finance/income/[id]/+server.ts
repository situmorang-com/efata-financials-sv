import { json } from '@sveltejs/kit';
import { financeTransactionDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const id = Number(params.id);
    if (!id) return json({ error: 'Invalid id' }, { status: 400 });

    const data = await request.json();
    const payload: Record<string, unknown> = {};

    if (data.sub_type && ['tithe', 'offering', 'other_income'].includes(data.sub_type)) payload.sub_type = data.sub_type;
    if (data.party_id !== undefined) payload.party_id = data.party_id;
    if (data.category_id !== undefined) payload.category_id = Number(data.category_id);
    if (data.account_id !== undefined) payload.account_id = data.account_id;
    if (data.amount !== undefined) payload.amount = Number(data.amount);
    if (data.txn_date !== undefined) payload.txn_date = String(data.txn_date);
    if (data.payment_method !== undefined) payload.payment_method = data.payment_method;
    if (data.service_label !== undefined) payload.service_label = data.service_label;
    if (data.reference_no !== undefined) payload.reference_no = data.reference_no;
    if (data.notes !== undefined) payload.notes = data.notes;

    const success = financeTransactionDb.update(id, payload);
    if (!success) return json({ error: 'Income transaction not found' }, { status: 404 });

    return json(financeTransactionDb.getById(id));
  } catch (error) {
    console.error('Error updating income transaction:', error);
    return json({ error: 'Failed to update income transaction' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (!id) return json({ error: 'Invalid id' }, { status: 400 });
    const success = financeTransactionDb.softVoid(id);
    if (!success) return json({ error: 'Income transaction not found' }, { status: 404 });
    return json({ message: 'Voided' });
  } catch (error) {
    console.error('Error deleting income transaction:', error);
    return json({ error: 'Failed to delete income transaction' }, { status: 500 });
  }
};
