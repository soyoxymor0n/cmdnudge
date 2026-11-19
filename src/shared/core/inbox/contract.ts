// GENERATED from packages/core/src/inbox/contract.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
/**
 * THE INBOX CONTRACT, version 1 (C22 in regops-module-contracts.md).
 *
 * Producers (RegPlan, RegStance, ...) push `InboxEventV1` to the hub; the hub
 * answers `InboxEmitResultV1`; a producer that resolves its own item sends
 * `InboxResolveV1`. The types here are the wire shape. The parsers are the
 * RECEIVING side's defence: they NEVER THROW, they clamp, strip markup, map an
 * unknown category to `system` and an unknown entity kind to `null`, so a
 * dropped notification (the failure this feature exists to prevent) is the
 * last outcome we choose. The one thing that is refused outright is a
 * `contractVersion` we do not speak: that answers 422 and the producer falls
 * back to its own email (spec R8).
 *
 * Optional keys may be ADDED to a version. Anything breaking needs version 2.
 */

export const INBOX_CONTRACT_VERSION = 1 as const;

/** Field limits. The hub enforces them again on ingest; the producer should not rely on that. */
export const INBOX_LIMITS = {
  recipientIds: 50,
  idempotencyKey: 200,
  title: 140,
  excerpt: 280,
  groupKey: 200,
  entityId: 200,
  actorId: 200,
  orgId: 200,
  /** A note body, sent to the hub's notes route (not part of the producer contract). */
  noteBodyMin: 10,
  noteBodyMax: 2000,
  noteSubject: 140,
} as const;

export const INBOX_TYPES = ['notification', 'todo'] as const;
export type InboxEventType = (typeof INBOX_TYPES)[number];

export const INBOX_CATEGORIES = ['mention', 'assignment', 'review', 'due', 'status', 'system'] as const;
export type InboxCategory = (typeof INBOX_CATEGORIES)[number];

/** `message` is reserved for notes, which use their own route and are never produced by a module. */
export const INBOX_ITEM_TYPES = ['notification', 'todo', 'message'] as const;
export type InboxItemType = (typeof INBOX_ITEM_TYPES)[number];

export const INBOX_URGENCIES = ['normal', 'urgent'] as const;
export type InboxUrgency = (typeof INBOX_URGENCIES)[number];

export const INBOX_RESOLUTIONS = ['done', 'cancelled'] as const;
export type InboxResolution = (typeof INBOX_RESOLUTIONS)[number];

/**
 * C19 entity kinds the inbox may link to. Open-ended in the entity-links module;
 * the inbox only needs the set it is told is owned. A parser given a different
 * list (a host with its own owner table) uses that list instead.
 */
export const INBOX_ENTITY_KINDS = [
  'product',
  'device-class',
  'assessment',
  'obligation',
  'standard',
  'document',
  'plan-item',
  'consultation',
  'member',
  'submission',
  'stance',
  'peer-case',
] as const;

export interface InboxEntityRef {
  kind: string;
  id: string;
}

/** A module's event: one fact about one or more people, addressed in one org. */
export interface InboxEventV1 {
  contractVersion: 1;
  /** Unique per (token's module, recipient, idempotencyKey). Re-sending changes nothing. */
  idempotencyKey: string;
  /** Required for every module. null is refused unless the token is the hub's own. */
  orgId: string | null;
  /** Suite user ids resolved by the producer. The hub re-checks org membership; non-members are dropped. */
  recipientIds: string[];
  type: InboxEventType;
  category: InboxCategory;
  urgency: InboxUrgency;
  title: string;
  excerpt: string | null;
  actorId: string | null;
  /** ISO instant, or null. */
  dueAt: string | null;
  /** C19 kinds only; an unknown kind arrives as null. */
  entity: InboxEntityRef | null;
  groupKey: string | null;
  /** ISO instant on the producer's clock. The hub stores its own created_at too. */
  occurredAt: string;
}

/** The hub's answer to an emit. `accepted` = stored (or already stored). */
export interface InboxEmitResultV1 {
  contractVersion: 1;
  accepted: string[];
  dropped: string[];
}

/** Resolve the items a producer's own event created. No recipientId = every recipient of that key. */
export interface InboxResolveV1 {
  contractVersion: 1;
  orgId: string | null;
  items: { idempotencyKey: string; recipientId?: string; as: InboxResolution }[];
}

/** Why a payload was refused. Only these two; everything else is clamped or defaulted. */
export type InboxRefusal = 'unsupported-version' | 'invalid';

export type InboxParse<T> = { ok: true; value: T } | { ok: false; reason: InboxRefusal };

export interface InboxParseOptions {
  /** The entity kinds this host owns. Defaults to INBOX_ENTITY_KINDS. */
  entityKinds?: readonly string[];
}

/** Remove tags and control characters, collapse whitespace, trim, then clamp. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const plain = value
    .replace(/<[^>]*>/g, ' ')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? plain.slice(0, max).trimEnd() : plain;
}

function idOrNull(value: unknown, max: number): string | null {
  const id = cleanText(value, max);
  return id ? id : null;
}

function isoInstant(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Read an emit payload. Never throws. Unknown `category` -> `system`; unknown
 * `type` -> `notification` (both keep the item visible); unknown `urgency` ->
 * `normal`; unknown entity kind -> `entity: null`; over-long text is clamped;
 * markup is stripped; recipients are trimmed, de-duplicated and capped.
 * Refused: a version we do not speak, or a payload missing what identifies it
 * (idempotency key, title, a valid occurredAt, a recipients array, an orgId
 * that is neither a string nor null).
 */
export function parseInboxEvent(raw: unknown, options: InboxParseOptions = {}): InboxParse<InboxEventV1> {
  if (!isRecord(raw)) return { ok: false, reason: 'invalid' };
  if (raw.contractVersion !== INBOX_CONTRACT_VERSION) return { ok: false, reason: 'unsupported-version' };

  const idempotencyKey = cleanText(raw.idempotencyKey, INBOX_LIMITS.idempotencyKey);
  const title = cleanText(raw.title, INBOX_LIMITS.title);
  const occurredAt = isoInstant(raw.occurredAt);
  if (!idempotencyKey || !title || !occurredAt) return { ok: false, reason: 'invalid' };
  if (raw.orgId !== null && typeof raw.orgId !== 'string') return { ok: false, reason: 'invalid' };
  if (!Array.isArray(raw.recipientIds)) return { ok: false, reason: 'invalid' };

  const recipientIds = [
    ...new Set(
      raw.recipientIds
        .map((id) => cleanText(id, INBOX_LIMITS.actorId))
        .filter((id) => id.length > 0),
    ),
  ].slice(0, INBOX_LIMITS.recipientIds);

  const kinds = options.entityKinds ?? INBOX_ENTITY_KINDS;
  const entity = isRecord(raw.entity) ? parseEntity(raw.entity, kinds) : null;

  const type = (INBOX_TYPES as readonly string[]).includes(raw.type as string)
    ? (raw.type as InboxEventType)
    : 'notification';
  const category = (INBOX_CATEGORIES as readonly string[]).includes(raw.category as string)
    ? (raw.category as InboxCategory)
    : 'system';
  const urgency = (INBOX_URGENCIES as readonly string[]).includes(raw.urgency as string)
    ? (raw.urgency as InboxUrgency)
    : 'normal';

  return {
    ok: true,
    value: {
      contractVersion: INBOX_CONTRACT_VERSION,
      idempotencyKey,
      orgId: idOrNull(raw.orgId, INBOX_LIMITS.orgId),
      recipientIds,
      type,
      category,
      urgency,
      title,
      excerpt: cleanText(raw.excerpt, INBOX_LIMITS.excerpt) || null,
      actorId: idOrNull(raw.actorId, INBOX_LIMITS.actorId),
      dueAt: isoInstant(raw.dueAt),
      entity,
      groupKey: idOrNull(raw.groupKey, INBOX_LIMITS.groupKey),
      occurredAt,
    },
  };
}

function parseEntity(raw: Record<string, unknown>, kinds: readonly string[]): InboxEntityRef | null {
  const kind = cleanText(raw.kind, 40);
  const id = cleanText(raw.id, INBOX_LIMITS.entityId);
  if (!kind || !id || !kinds.includes(kind)) return null;
  return { kind, id };
}

/**
 * Read a resolve payload. Never throws. Items with an unknown `as` or no key
 * are dropped one by one (the rest still resolve); a version we do not speak is
 * refused.
 */
export function parseInboxResolve(raw: unknown): InboxParse<InboxResolveV1> {
  if (!isRecord(raw)) return { ok: false, reason: 'invalid' };
  if (raw.contractVersion !== INBOX_CONTRACT_VERSION) return { ok: false, reason: 'unsupported-version' };
  if (raw.orgId !== null && typeof raw.orgId !== 'string') return { ok: false, reason: 'invalid' };
  if (!Array.isArray(raw.items)) return { ok: false, reason: 'invalid' };

  const items: InboxResolveV1['items'] = [];
  for (const entry of raw.items) {
    if (!isRecord(entry)) continue;
    const idempotencyKey = cleanText(entry.idempotencyKey, INBOX_LIMITS.idempotencyKey);
    const as = (INBOX_RESOLUTIONS as readonly string[]).includes(entry.as as string)
      ? (entry.as as InboxResolution)
      : null;
    if (!idempotencyKey || !as) continue;
    const recipientId = idOrNull(entry.recipientId, INBOX_LIMITS.actorId);
    items.push(recipientId ? { idempotencyKey, recipientId, as } : { idempotencyKey, as });
  }

  return {
    ok: true,
    value: {
      contractVersion: INBOX_CONTRACT_VERSION,
      orgId: idOrNull(raw.orgId, INBOX_LIMITS.orgId),
      items,
    },
  };
}

/**
 * Read the hub's emit answer. Returns null when the answer is malformed or
 * speaks another version: the producer then treats it as "the hub did not
 * accept", and falls back to its own email (spec R8).
 */
export function parseInboxEmitResult(raw: unknown): InboxEmitResultV1 | null {
  if (!isRecord(raw) || raw.contractVersion !== INBOX_CONTRACT_VERSION) return null;
  if (!Array.isArray(raw.accepted) || !Array.isArray(raw.dropped)) return null;
  const ids = (list: unknown[]) => list.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return { contractVersion: INBOX_CONTRACT_VERSION, accepted: ids(raw.accepted), dropped: ids(raw.dropped) };
}
