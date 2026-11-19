// GENERATED from packages/ui/src/entity-links/entityLinks.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
/**
 * Cross-module entity links (blueprint#23, standard: docs/standards/cross-module-links-instruction.md).
 *
 * The contract this resolver reads is regops-suite#95:
 *   https://<module-origin>/e/<kind>/<id>?from=<module>:<return-path>
 * - the URL carries NO org id; the org is the session's, and the target module
 *   re-authorises every request (a link is only a pointer);
 * - `from` is the optional back-context: `<module>:<path>`, parsed against the
 *   configured peers only, so it cannot be an open redirect;
 * - a peer that is not configured or not entitled resolves to `null` and the
 *   caller renders plain text (no dead link, no advert).
 *
 * Pure functions here; the hook and component live in EntityLink.tsx.
 */

/** First-pass entity kinds (regops-suite#95). Open-ended: any string a project's owner table lists. */
export type EntityKind =
  | 'product'
  | 'device-class'
  | 'assessment'
  | 'obligation'
  | 'standard'
  | 'document'
  | 'plan-item'
  | 'consultation'
  | 'member'
  | 'submission'
  | (string & {});

/**
 * Owner id of the classification / assessment module, RegLine (owner decision
 * 2026-09-30): the module that holds "why is this device class IIb". It has no
 * catalogue entry or entitlement key yet - deliberately not in `MODULE_IDS`,
 * that would invent a priced key. A link needs a configured, entitled peer of
 * this name, so every screen renders the class as plain text until a peer
 * called `regline` is passed in `peers`.
 */
export const CLASSIFICATION_MODULE = 'regline';

/**
 * The stopgap owner table: ONLY what is decided. A product is a central hub
 * entity and its id is the hub central product id (regops-suite#95 may replace
 * this); a device class is owned by the classification module (placeholder id
 * above). Every other kind's owner is #95's call - pass it in `owners`.
 */
export const DEFAULT_ENTITY_OWNERS: Readonly<Record<string, string>> = {
  product: 'hub',
  'device-class': CLASSIFICATION_MODULE,
};

export interface PeerModule {
  /** Origin only, e.g. `https://regeval.regops.systems`. */
  origin: string;
  /** Display name for the label and the back link. */
  name?: string;
  /** False = the org is not entitled: the peer is treated as absent. Default true. */
  entitled?: boolean;
}

/** What a hub resolver returns for `(kind, id)`; `allowed:false` and missing both mean "no link". */
export interface HubLinkResult {
  href: string;
  label?: string;
  allowed: boolean;
  /** When the hub says which org the target belongs to, a mismatch refuses the link. */
  orgId?: string;
}

export interface EntityLinkConfig {
  /** This module's id, used for `from` and to skip the back-context on same-module links. */
  currentModule: string;
  /** Path (and query) to return to; defaults to `location.pathname + location.search`. */
  getCurrentPath?: () => string;
  /** The session's org. A ref carrying a different `orgId` never links. */
  orgId?: string;
  peers: Record<string, PeerModule>;
  owners?: Record<string, string>;
  /** Optional hub resolver `(kind,id)`; when present it wins over the owner table. */
  resolver?: (kind: string, id: string) => Promise<HubLinkResult | null>;
}

export interface EntityRef {
  kind: EntityKind;
  id: string;
  /** Only for refs that carry their org (imported data, cached hits). */
  orgId?: string;
}

export interface ResolvedLink {
  href: string;
  label: string;
  /** Module that owns the target. */
  module: string | null;
}

/**
 * C19 `obligation` id: the C1 key `<instrument>#<clause>` (regops-suite contract 13.1). RegMap builds it as
 * `${StandardRef.key}#${clause}`, e.g. `iso:13485:2016#4.2.4`. The instrument keeps its own spelling (CELEX is
 * upper-case, a standard key may carry `+`), so this checks the SHAPE only; the owner's canonical match decides
 * the rest. The clause is RegMap's own charset: a letter or digit, then letters, digits, `.` or `-`, at most 50.
 * `#` is allowed here; the URL encodes it like every id, so it never becomes a fragment.
 */
export const OBLIGATION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:+._-]{0,119}#[A-Za-z0-9][A-Za-z0-9.-]{0,49}$/;

/** Per-kind id grammar (#379). A kind listed here must match its own pattern. */
const ENTITY_ID_RES: Readonly<Record<string, RegExp>> = { obligation: OBLIGATION_ID_RE };

/**
 * Whether an id is well-formed for its kind. A kind without its own grammar keeps the plain check (non-empty, at
 * most 200 characters): the owner decides what its ids mean. Malformed means no link, on the owner table and on a
 * hub answer alike.
 */
export function isWellFormedEntityId(kind: string, id: string): boolean {
  if (!id || id.length > 200) return false;
  const re = Object.prototype.hasOwnProperty.call(ENTITY_ID_RES, kind) ? ENTITY_ID_RES[kind] : undefined;
  return re ? re.test(id) : true;
}

/** Modules use https; plain http is tolerated on localhost only (dev). */
function parseOrigin(o: string): URL | null {
  try {
    const u = new URL(o);
    if (u.protocol === 'https:') return u;
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return u;
    return null;
  } catch {
    return null;
  }
}

/** A return path must be a same-origin absolute path: no `//host`, no scheme, no backslash, no control chars. */
export function isSafeReturnPath(p: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^\/(?![/\\])[^\\\x00-\x1f\s]*$/.test(p);
}

export function encodeBackContext(module: string, path: string): string | null {
  if (!module || module.includes(':') || !isSafeReturnPath(path)) return null;
  return `${module}:${path}`;
}

function entitledPeer(cfg: EntityLinkConfig, module: string | undefined): PeerModule | null {
  if (!module) return null;
  const peer = cfg.peers[module];
  if (!peer || peer.entitled === false || !parseOrigin(peer.origin)) return null;
  return peer;
}

function defaultPath(cfg: EntityLinkConfig): string {
  if (cfg.getCurrentPath) return cfg.getCurrentPath();
  return typeof location === 'undefined' ? '/' : location.pathname + location.search;
}

function withFrom(cfg: EntityLinkConfig, url: URL, targetModule: string | null): string {
  if (targetModule !== cfg.currentModule) {
    const from = encodeBackContext(cfg.currentModule, defaultPath(cfg));
    if (from) url.searchParams.set('from', from);
  }
  return url.toString();
}

function crossOrg(cfg: EntityLinkConfig, orgId: string | undefined): boolean {
  return !!cfg.orgId && !!orgId && cfg.orgId !== orgId;
}

/** Sync resolution from the owner table. `null` = render plain text. */
export function resolveEntityLink(cfg: EntityLinkConfig, ref: EntityRef): ResolvedLink | null {
  if (!ref.kind || !isWellFormedEntityId(ref.kind, ref.id) || crossOrg(cfg, ref.orgId)) return null;
  const module = { ...DEFAULT_ENTITY_OWNERS, ...cfg.owners }[ref.kind];
  const peer = entitledPeer(cfg, module);
  if (!peer || !module) return null;
  const url = new URL(`/e/${encodeURIComponent(ref.kind)}/${encodeURIComponent(ref.id)}`, peer.origin);
  return { href: withFrom(cfg, url, module), label: `Open in ${peer.name ?? module}`, module };
}

/**
 * Validate a hub answer: refused unless `allowed`, unless the href sits on a
 * configured, entitled peer origin (a hub answer is data, not a redirect
 * authority), and unless it is the same org.
 */
export function fromHubResult(cfg: EntityLinkConfig, ref: EntityRef, r: HubLinkResult | null): ResolvedLink | null {
  if (!r || !r.allowed || !isWellFormedEntityId(ref.kind, ref.id) || crossOrg(cfg, r.orgId) || crossOrg(cfg, ref.orgId)) return null;
  let url: URL;
  try {
    url = new URL(r.href);
  } catch {
    return null;
  }
  const entry = Object.entries(cfg.peers).find(([, p]) => {
    const o = parseOrigin(p.origin);
    return o && o.origin === url.origin && p.entitled !== false;
  });
  if (!entry) return null;
  const [module, peer] = entry;
  return { href: withFrom(cfg, url, module), label: r.label ?? `Open in ${peer.name ?? module}`, module };
}

export interface BackContext {
  module: string;
  label: string;
  href: string;
}

/**
 * The target side: read `?from=` and return where "back to <module>" goes, or
 * `null` (unknown module, not entitled, unsafe path - all silently ignored).
 * The returned href is always `<configured peer origin><safe path>`.
 */
export function parseBackContext(cfg: EntityLinkConfig, search: string): BackContext | null {
  const raw = new URLSearchParams(search).get('from');
  if (!raw) return null;
  const i = raw.indexOf(':');
  if (i <= 0) return null;
  const module = raw.slice(0, i);
  const path = raw.slice(i + 1);
  const peer = entitledPeer(cfg, module);
  if (!peer || !isSafeReturnPath(path)) return null;
  return { module, label: peer.name ?? module, href: new URL(path, peer.origin).toString() };
}
