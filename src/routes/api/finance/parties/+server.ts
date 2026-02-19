import { json } from '@sveltejs/kit';
import { financePartyDb } from '$lib/server/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const partyType = url.searchParams.get('party_type');
    if (partyType === 'member' || partyType === 'donor' || partyType === 'vendor' || partyType === 'other') {
      return json(financePartyDb.getAll(partyType));
    }
    return json(financePartyDb.getAll());
  } catch (error) {
    console.error('Error fetching finance parties:', error);
    return json({ error: 'Failed to fetch finance parties' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data = await request.json();
    if (!data.name || !data.party_type) {
      return json({ error: 'name and party_type are required' }, { status: 400 });
    }
    if (!['member', 'donor', 'vendor', 'other'].includes(data.party_type)) {
      return json({ error: 'invalid party_type' }, { status: 400 });
    }

    const party = financePartyDb.create({
      name: String(data.name).trim(),
      party_type: data.party_type,
      whatsapp: data.whatsapp,
      email: data.email,
      notes: data.notes
    });

    return json(party, { status: 201 });
  } catch (error) {
    console.error('Error creating finance party:', error);
    return json({ error: 'Failed to create finance party' }, { status: 500 });
  }
};
