// Linking the desktop app to an account (#18).
//
// Clerk session tokens live about a minute, too short for a menu bar app that syncs every few
// minutes. So the sign-in page (src/connect.html) trades a fresh Clerk session token for a
// long-lived, revocable device link token and hands that to the app through the
// cmdnudge://link deep link. The server keeps only the token's SHA-256.
//
//   GET    /api/link                         -> { clerkPublishableKey } (503 until configured)
//   POST   /api/link   Bearer <Clerk token>  -> { token }  (a new link for the signed-in user)
//   DELETE /api/link   Bearer <link token>   -> unlinks this app (sign out)
import { createHash, randomBytes } from 'node:crypto';

export const LINKS_PER_USER = 16;
const TOKEN = /^cn_[A-Za-z0-9_-]{43}$/;

export const hashToken = (t) => createHash('sha256').update(t).digest('hex');
export const newLinkToken = () => `cn_${randomBytes(32).toString('base64url')}`;

/** verify(token) for the sync handler: a link token -> its user id, or null. */
export function linkVerifier(store) {
  return async (token) => (TOKEN.test(token) ? store.userOfLink(hashToken(token)) : null);
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export function createLinkHandler({ verifySession, store, publishableKey, today = () => new Date().toISOString().slice(0, 10) }) {
  return async function handle(req) {
    if (req.method === 'GET') return json(200, { clerkPublishableKey: publishableKey });
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (req.method === 'POST') {
      const userId = token ? await verifySession(token) : null;
      if (!userId) return json(401, { error: 'sign in first' });
      if ((await store.linkCount(userId)) >= LINKS_PER_USER) return json(429, { error: 'too many linked apps; unlink one first' });
      const link = newLinkToken();
      await store.addLink(hashToken(link), userId, today());
      return json(200, { token: link });
    }
    if (req.method === 'DELETE') {
      if (!TOKEN.test(token)) return json(401, { error: 'not linked' });
      await store.removeLink(hashToken(token));
      return json(200, { unlinked: true });
    }
    return json(405, { error: 'GET, POST or DELETE' });
  };
}
