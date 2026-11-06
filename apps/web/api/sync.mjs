// POST/DELETE /api/sync (#18): the hosted sync endpoint on Vercel.
// Wiring only; the logic and its tests live in ../server/sync.mjs.
//
// Env (per environment, env-isolation: previews use the preview database):
//   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN   the sync database
//   CLERK_JWT_KEY                          Clerk's PEM public key, verifies session tokens locally
//   CLERK_AUTHORIZED_PARTIES               optional, comma-separated accepted `azp` origins
// Until those exist the endpoint answers 503, so nothing half-configured accepts data.
import { readFileSync } from 'node:fs';
import { createSyncHandler, knownFrom, sqlStore } from '../server/sync.mjs';
import { clerkVerifier } from '../server/clerk-token.mjs';
import { tursoHttp } from '../server/turso-http.mjs';

let ready = null;
function handler() {
  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: token, CLERK_JWT_KEY: pem, CLERK_AUTHORIZED_PARTIES: azp } = process.env;
  if (!url || !token || !pem) return null;
  ready ??= (async () => {
    // The build copies the library next to the site; vercel.json includes it in the function.
    const library = JSON.parse(readFileSync(new URL('../dist/library.json', import.meta.url), 'utf8'));
    const store = sqlStore(tursoHttp(url, token));
    await store.init();
    const verify = clerkVerifier(pem.replace(/\\n/g, '\n'), { authorizedParties: (azp ?? '').split(',').map((s) => s.trim()).filter(Boolean) });
    return createSyncHandler({ verify, store, known: knownFrom(library) });
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

async function serve(request) {
  const h = handler();
  if (!h) {
    return Response.json({ error: 'hosted sync is not set up yet' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  try {
    return (await h)(request);
  } catch {
    return Response.json({ error: 'sync is unavailable, try again later' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}

export const POST = serve;
export const DELETE = serve;
