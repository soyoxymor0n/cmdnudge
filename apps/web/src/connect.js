// Sign-in hand-off for hosted sync (#18). Opened by the app as /connect?state=<hex>.
// 1. Ask /api/link whether account sync is open (503 = not yet) and for the Clerk key.
// 2. Load Clerk from the instance's own Frontend API, sign in if needed.
// 3. Trade the short-lived session token for a device link token (POST /api/link).
// 4. Hand it to the app: cmdnudge://link?token=…&state=… (the app checks the state it sent).
const status = document.querySelector('[data-step="status"]');
const say = (t) => (status.textContent = t);
const state = new URLSearchParams(location.search).get('state') ?? '';

/** pk_live_<base64("clerk.example.com$")> -> "clerk.example.com" */
export function frontendApi(pk) {
  const m = /^pk_(test|live)_(.+)$/.exec(pk ?? '');
  if (!m) return null;
  const host = atob(m[2]).replace(/\$$/, '');
  return /^[a-z0-9.-]+$/i.test(host) ? host : null;
}

function loadClerk(pk, host) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://${host}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.dataset.clerkPublishableKey = pk;
    s.onload = () => resolve(window.Clerk);
    s.onerror = () => reject(new Error('could not load sign-in'));
    document.head.append(s);
  });
}

async function main() {
  if (!/^[0-9a-f]{32}$/.test(state)) return say('Open this page from the cmdnudge app: Settings → Your other computers → Sync with an account.');
  const cfg = await fetch('/api/link', { cache: 'no-store' }).catch(() => null);
  if (!cfg || !cfg.ok) return say('Sync with an account is not open yet. Folder sync works today: Settings → Your other computers.');
  const { clerkPublishableKey: pk } = await cfg.json();
  const host = frontendApi(pk);
  if (!host) return say('Sign-in is not configured correctly. Please try again later.');
  const Clerk = await loadClerk(pk, host);
  await Clerk.load();
  if (!Clerk.user) {
    say('Sign in to continue.');
    Clerk.mountSignIn(document.getElementById('sign-in'), { forceRedirectUrl: location.href, signUpForceRedirectUrl: location.href });
    Clerk.addListener(({ user }) => user && location.reload());
    return;
  }
  say(`Signed in as ${Clerk.user.primaryEmailAddress?.emailAddress ?? 'you'}. Linking the app…`);
  const session = await Clerk.session.getToken();
  const res = await fetch('/api/link', { method: 'POST', headers: { authorization: `Bearer ${session}` } });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}));
    return say(`Could not link the app: ${error ?? res.status}.`);
  }
  const { token } = await res.json();
  const url = `cmdnudge://link?token=${encodeURIComponent(token)}&state=${state}`;
  document.querySelector('[data-open]').href = url;
  document.querySelector('[data-step="again"]').hidden = false;
  say('Done. cmdnudge opens and starts syncing. You can close this tab.');
  location.href = url;
}

main().catch(() => say('Something went wrong. Please try again from the app.'));
