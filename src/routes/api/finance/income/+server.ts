import { json } from '@sveltejs/kit';
import { financeTransactionDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const subType = url.searchParams.get('type');
    const from = url.searchParams.get('from') || undefined;
    const to = url.searchParams.get('to') || undefined;
    const q = url.searchParams.get('q') || undefined;

    const sub_type =
      subType === 'tithe' || subType === 'offering' || subType === 'other_income'
        ? subType
        : undefined;

    const items = financeTransactionDb.getAll({
      type: 'income',
      sub_type,
      from,
      to,
      q
    });

    return json(items);
  } catch (error) {
    console.error('Error fetching income transactions:', error);
    return json({ error: 'Failed to fetch income transactions' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data = await request.json();

    if (!data.sub_type || !['tithe', 'offering', 'other_income'].includes(data.sub_type)) {
      return json({ error: 'sub_type must be tithe|offering|other_income' }, { status: 400 });
    }
    if (!data.category_id || !data.txn_date || data.amount === undefined || data.amount === null) {
      return json({ error: 'category_id, txn_date, amount are required' }, { status: 400 });
    }

    const created = financeTransactionDb.create({
      type: 'income',
      sub_type: data.sub_type,
      party_id: data.party_id ?? null,
      category_id: Number(data.category_id),
      account_id: data.account_id ?? null,
      amount: Number(data.amount),
      txn_date: String(data.txn_date),
      payment_method: data.payment_method,
      service_label: data.service_label,
      reference_no: data.reference_no,
      status: 'posted',
      notes: data.notes,
      created_by: null
    });

    return json(created, { status: 201 });
  } catch (error) {
    console.error('Error creating income transaction:', error);
    return json({ error: 'Failed to create income transaction' }, { status: 500 });
  }
};
