import { json } from '@sveltejs/kit';
import { financeTransactionDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const statusRaw = url.searchParams.get('status');
    const from = url.searchParams.get('from') || undefined;
    const to = url.searchParams.get('to') || undefined;
    const q = url.searchParams.get('q') || undefined;
    const categoryIdRaw = url.searchParams.get('category_id');

    const status =
      statusRaw === 'draft' ||
      statusRaw === 'pending_approval' ||
      statusRaw === 'approved' ||
      statusRaw === 'posted' ||
      statusRaw === 'void'
        ? statusRaw
        : undefined;

    const items = financeTransactionDb.getAll({
      type: 'expense',
      sub_type: 'expense',
      status,
      from,
      to,
      q,
      category_id: categoryIdRaw ? Number(categoryIdRaw) : undefined
    });

    return json(items);
  } catch (error) {
    console.error('Error fetching expense transactions:', error);
    return json({ error: 'Failed to fetch expense transactions' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data = await request.json();

    if (!data.category_id || !data.txn_date || data.amount === undefined || data.amount === null) {
      return json({ error: 'category_id, txn_date, amount are required' }, { status: 400 });
    }

    const created = financeTransactionDb.create({
      type: 'expense',
      sub_type: 'expense',
      party_id: data.party_id ?? null,
      category_id: Number(data.category_id),
      account_id: data.account_id ?? null,
      amount: Number(data.amount),
      txn_date: String(data.txn_date),
      payment_method: data.payment_method,
      service_label: data.service_label,
      reference_no: data.reference_no,
      status: data.status === 'draft' ? 'draft' : 'pending_approval',
      notes: data.notes,
      created_by: null
    });

    return json(created, { status: 201 });
  } catch (error) {
    console.error('Error creating expense transaction:', error);
    return json({ error: 'Failed to create expense transaction' }, { status: 500 });
  }
};
