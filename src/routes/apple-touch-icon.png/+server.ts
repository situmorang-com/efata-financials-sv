import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	return Response.redirect(new URL('/favicon.svg', url), 307);
};
