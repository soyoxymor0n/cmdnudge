// GENERATED from packages/ui/src/entity-links/EntityLink.tsx — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { tooltip, SHORT_SAME } from '../overlay/Tooltip.js';
import {
  fromHubResult,
  parseBackContext,
  resolveEntityLink,
  type EntityKind,
  type EntityLinkConfig,
  type ResolvedLink,
} from './entityLinks.js';

const Ctx = createContext<EntityLinkConfig | null>(null);

type Resolver = NonNullable<EntityLinkConfig['resolver']>;
const MEMO_MAX = 500;

/**
 * One hub call per `(kind, id)` for the provider's lifetime (blueprint#187). Without it every rendered
 * `<EntityLink>` fired its own proxied hub call: a 50-row table was 50 calls, StrictMode doubled them, and a
 * re-render or a second link to the same entity asked again. Concurrent asks share the in-flight promise; a
 * rejection is forgotten so the next render may retry; the memo is bounded (cleared past MEMO_MAX keys).
 */
export function memoResolver(resolver: Resolver, max = MEMO_MAX): Resolver {
  const memo = new Map<string, ReturnType<Resolver>>();
  return (kind, id) => {
    const key = `${kind}|${id}`;
    const hit = memo.get(key);
    if (hit) return hit;
    if (memo.size >= max) memo.clear();
    const p = resolver(kind, id);
    memo.set(key, p);
    p.catch(() => {
      if (memo.get(key) === p) memo.delete(key);
    });
    return p;
  };
}

/** Mount once near the root. Without it every EntityLink is plain text. */
export function EntityLinkProvider({ config, children }: { config: EntityLinkConfig | null; children: ReactNode }) {
  // The resolver is wrapped once per config object, so N links to one entity are one hub call.
  const value = useMemo(() => (config?.resolver ? { ...config, resolver: memoResolver(config.resolver) } : config), [config]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntityLinkConfig(): EntityLinkConfig | null {
  return useContext(Ctx);
}

/**
 * `{href, label} | null` for an entity. `null` (no provider, peer absent or not
 * entitled, other org, hub says no) means: render plain text.
 */
export function useEntityLink(kind: EntityKind, id: string | null | undefined, orgId?: string): ResolvedLink | null {
  const cfg = useContext(Ctx);
  const sync = useMemo(
    () => (cfg && id && !cfg.resolver ? resolveEntityLink(cfg, { kind, id, orgId }) : null),
    [cfg, kind, id, orgId],
  );
  const key = `${kind}|${id ?? ''}`;
  const [remote, setRemote] = useState<{ key: string; link: ResolvedLink | null } | null>(null);
  useEffect(() => {
    if (!cfg?.resolver || !id) return;
    let live = true;
    cfg.resolver(kind, id).then(
      (r) => live && setRemote({ key, link: fromHubResult(cfg, { kind, id, orgId }, r) }),
      () => live && setRemote({ key, link: null }),
    );
    return () => {
      live = false;
    };
  }, [cfg, kind, id, orgId, key]);
  if (!cfg || !id) return null;
  if (cfg.resolver) return remote?.key === key ? remote.link : null;
  return sync;
}

export interface EntityLinkProps {
  kind: EntityKind;
  id: string | null | undefined;
  orgId?: string;
  /** The visible value. It is also the plain-text fallback, so always pass it. */
  children: ReactNode;
  className?: string;
  /** Overrides the tooltip (i18n). */
  title?: string;
}

/**
 * A displayed entity: a same-tab link to the module that owns a page about it,
 * or the bare text when there is none (v1 is a plain link; hover card later).
 */
export function EntityLink({ kind, id, orgId, children, className, title }: EntityLinkProps) {
  const link = useEntityLink(kind, id, orgId);
  if (!link) return <>{children}</>;
  return (
    <a
      href={link.href}
      className={className ?? 'underline decoration-dotted underline-offset-2 hover:decoration-solid'}
      {...tooltip(title ?? link.label, { short: SHORT_SAME })}
      data-entity-kind={kind}
    >
      {children}
    </a>
  );
}

/** Target side: "back to <module>" from `?from=`; `null` when absent or refused. */
export function useBackContext(search?: string) {
  const cfg = useContext(Ctx);
  return useMemo(() => {
    if (!cfg) return null;
    return parseBackContext(cfg, search ?? (typeof location === 'undefined' ? '' : location.search));
  }, [cfg, search]);
}

/** A product picked in `ProductPicker` is a link target: its ref is the hub central product id. */
export function productEntityRef(p: { id: string }) {
  return { kind: 'product' as const, id: p.id };
}
