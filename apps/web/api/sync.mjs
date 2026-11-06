// POST/DELETE /api/sync (#18). Logic and tests: ../server/sync.mjs. Wiring: ./_setup.mjs.
import { serve } from './_setup.mjs';

const handle = (request) => serve('sync', request);
export const POST = handle;
export const DELETE = handle;
