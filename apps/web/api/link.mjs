// GET/POST/DELETE /api/link (#18): link the desktop app to an account. Logic: ../server/link.mjs.
import { serve } from './_setup.mjs';

const handle = (request) => serve('link', request);
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
