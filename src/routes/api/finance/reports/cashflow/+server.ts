import { json } from '@sveltejs/kit';
import { financeTransactionDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function monthStartKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const dateFrom = url.searchParams.get('date_from') || monthStartKey();
    const dateTo = url.searchParams.get('date_to') || todayKey();
    const groupByParam = url.searchParams.get('group_by') || 'day';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      return json({ error: 'date_from must be in YYYY-MM-DD format' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return json({ error: 'date_to must be in YYYY-MM-DD format' }, { status: 400 });
    }
    if (dateFrom > dateTo) {
      return json({ error: 'date_from must be earlier than or equal to date_to' }, { status: 400 });
    }

    if (!['day', 'week', 'month'].includes(groupByParam)) {
      return json({ error: 'group_by must be day, week, or month' }, { status: 400 });
    }

    return json(
      financeTransactionDb.getCashflow({
        date_from: dateFrom,
        date_to: dateTo,
        group_by: groupByParam as 'day' | 'week' | 'month'
      })
    );
  } catch (error) {
    console.error('Error fetching finance cashflow report:', error);
    return json({ error: 'Failed to fetch finance cashflow report' }, { status: 500 });
  }
};
