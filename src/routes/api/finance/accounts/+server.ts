import { json } from '@sveltejs/kit';
import { financeAccountDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
  try {
    return json(financeAccountDb.getAll());
  } catch (error) {
    console.error('Error fetching finance accounts:', error);
    return json({ error: 'Failed to fetch finance accounts' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data = await request.json();
    if (!data.name || !data.account_type) {
      return json({ error: 'name and account_type are required' }, { status: 400 });
    }
    if (!['cash', 'bank', 'ewallet', 'other'].includes(data.account_type)) {
      return json({ error: 'invalid account_type' }, { status: 400 });
    }

    const account = financeAccountDb.create({
      name: String(data.name).trim(),
      account_type: data.account_type,
      bank_name: data.bank_name,
      account_number: data.account_number,
      holder_name: data.holder_name,
      opening_balance: Number(data.opening_balance) || 0
    });

    return json(account, { status: 201 });
  } catch (error) {
    console.error('Error creating finance account:', error);
    return json({ error: 'Failed to create finance account' }, { status: 500 });
  }
};
