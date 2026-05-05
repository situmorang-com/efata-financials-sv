import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	return Response.redirect('/favicon.svg', 307);
};
