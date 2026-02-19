import { json } from '@sveltejs/kit';
import { financeAccountDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const data = await request.json();
    const id = Number(params.id);
    if (!id) return json({ error: 'Invalid id' }, { status: 400 });

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = String(data.name).trim();
    if (['cash', 'bank', 'ewallet', 'other'].includes(data.account_type)) updateData.account_type = data.account_type;
    if (data.bank_name !== undefined) updateData.bank_name = data.bank_name;
    if (data.account_number !== undefined) updateData.account_number = data.account_number;
    if (data.holder_name !== undefined) updateData.holder_name = data.holder_name;
    if (data.opening_balance !== undefined) updateData.opening_balance = Number(data.opening_balance) || 0;
    if (data.is_active !== undefined) updateData.is_active = data.is_active ? 1 : 0;

    const success = financeAccountDb.update(id, updateData);
    if (!success) return json({ error: 'Account not found' }, { status: 404 });

    return json(financeAccountDb.getById(id));
  } catch (error) {
    console.error('Error updating finance account:', error);
    return json({ error: 'Failed to update finance account' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (!id) return json({ error: 'Invalid id' }, { status: 400 });
    const success = financeAccountDb.softDelete(id);
    if (!success) return json({ error: 'Account not found' }, { status: 404 });
    return json({ message: 'Deleted' });
  } catch (error) {
    console.error('Error deleting finance account:', error);
    return json({ error: 'Failed to delete finance account' }, { status: 500 });
  }
};
