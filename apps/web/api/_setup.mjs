// Shared wiring for the hosted sync functions (#18). Files starting with "_" are not routes.
// Env per Vercel environment (env-isolation: previews use the preview database):
//   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN   the sync database
//   CLERK_JWT_KEY                          Clerk's PEM public key: session tokens checked locally
//   CLERK_PUBLISHABLE_KEY                  for the sign-in page (src/connect.html)
//   CLERK_AUTHORIZED_PARTIES               optional, comma-separated accepted `azp` origins
// Until the first four exist both endpoints answer 503, so nothing half-configured takes data.
import { readFileSync } from 'node:fs';
import { createSyncHandler, knownFrom, sqlStore } from '../server/sync.mjs';
import { createLinkHandler, linkVerifier } from '../server/link.mjs';
import { clerkVerifier } from '../server/clerk-token.mjs';
import { tursoHttp } from '../server/turso-http.mjs';

let ready = null;

function setup() {
  const env = process.env;
  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: token, CLERK_JWT_KEY: pem, CLERK_PUBLISHABLE_KEY: pk } = env;
  if (!url || !token || !pem || !pk) return null;
  ready ??= (async () => {
    // The build copies the library next to the site; vercel.json includes it in the functions.
    const library = JSON.parse(readFileSync(new URL('../dist/library.json', import.meta.url), 'utf8'));
    const store = sqlStore(tursoHttp(url, token));
    await store.init();
    const parties = (env.CLERK_AUTHORIZED_PARTIES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const verifySession = clerkVerifier(pem.replace(/\\n/g, '\n'), { authorizedParties: parties });
    return {
      sync: createSyncHandler({ verify: linkVerifier(store), store, known: knownFrom(library) }),
      link: createLinkHandler({ verifySession, store, publishableKey: pk }),
    };
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

const unavailable = (msg) => Response.json({ error: msg }, { status: 503, headers: { 'cache-control': 'no-store' } });

export async function serve(which, request) {
  const s = setup();
  if (!s) return unavailable('hosted sync is not set up yet');
  try {
    return (await s)[which](request);
  } catch {
    return unavailable('sync is unavailable, try again later');
  }
}
