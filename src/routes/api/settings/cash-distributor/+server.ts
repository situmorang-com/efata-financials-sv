import { json } from "@sveltejs/kit";
import { getCashDistributor, saveCashDistributor } from "$lib/server/cash-distributor.js";
import type { RequestHandler } from "./$types.js";

export const GET: RequestHandler = async () => {
  return json({ cash_distributor: getCashDistributor() });
};

export const PUT: RequestHandler = async ({ request }) => {
  try {
    const result = saveCashDistributor(await request.json());
    if (typeof result === "string") return json({ error: result }, { status: 400 });
    return json({ cash_distributor: result });
  } catch (error) {
    console.error("Error saving cash distributor:", error);
    return json({ error: "Gagal menyimpan penyalur tunai" }, { status: 500 });
  }
};
