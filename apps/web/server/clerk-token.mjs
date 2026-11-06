// Verifies a Clerk session token (#18) without the Clerk SDK and without a network call:
// Clerk signs session tokens with RS256; its public key ("JWKS Public Key" / CLERK_JWT_KEY in
// the Clerk dashboard → API keys) checks the signature locally ("networkless verification").
// Returns the user id (`sub`) or null. Never throws on bad input.
import { createPublicKey, createVerify } from 'node:crypto';

const b64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * @param {string} pem         CLERK_JWT_KEY (PEM public key)
 * @param {object} [opts]
 * @param {string[]} [opts.authorizedParties]  accepted `azp` values (empty = any)
 * @param {() => number} [opts.now]            seconds since epoch
 * @param {number} [opts.skew]                 clock skew allowed, seconds
 */
export function clerkVerifier(pem, { authorizedParties = [], now = () => Math.floor(Date.now() / 1000), skew = 5 } = {}) {
  const key = createPublicKey(pem);
  return async function verify(token) {
    try {
      const parts = String(token).split('.');
      if (parts.length !== 3) return null;
      const [h, p, sig] = parts;
      const header = JSON.parse(b64url(h).toString('utf8'));
      if (header.alg !== 'RS256') return null;
      const v = createVerify('RSA-SHA256');
      v.update(`${h}.${p}`);
      if (!v.verify(key, b64url(sig))) return null;
      const claims = JSON.parse(b64url(p).toString('utf8'));
      const t = now();
      if (typeof claims.exp !== 'number' || claims.exp + skew < t) return null;
      if (typeof claims.nbf === 'number' && claims.nbf - skew > t) return null;
      if (authorizedParties.length && claims.azp && !authorizedParties.includes(claims.azp)) return null;
      return typeof claims.sub === 'string' && claims.sub ? claims.sub : null;
    } catch {
      return null;
    }
  };
}
