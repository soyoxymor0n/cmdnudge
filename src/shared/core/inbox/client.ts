// GENERATED from packages/core/src/inbox/client.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
/**
 * The producer side: a module pushes its inbox events to the hub. Generalised
 * from regvoice/src/server/hubPulses.ts, with the same rules: a 4 s timeout,
 * errors swallowed, one log line per failure window, and a no-op when the hub
 * is not configured. An emit never fails the action that caused it (spec 5).
 *
 * The answer is the contract the caller branches on (spec R8, emit-or-email):
 *   - a result with `accepted` containing the person: the hub stored it, so the
 *     module does NOT send its own email for that item;
 *   - `null` (unconfigured, unreachable, refused, or an answer we cannot read):
 *     the module falls back to its existing email, exactly as a standalone
 *     module does today;
 *   - a result with an empty `accepted`: the hub declined everyone; the module
 *     email path still runs.
 */
import { parseInboxEmitResult, parseInboxEvent, parseInboxResolve, type InboxEmitResultV1, type InboxEventV1, type InboxResolveV1 } from './contract.js';

export const EMIT_TIMEOUT_MS = 4000;
/** One log line per window of this length, however many calls fail inside it. */
export const FAILURE_LOG_WINDOW_MS = 10 * 60 * 1000;

export interface InboxClientOptions {
  /** Default: process.env. Injected in tests. */
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  log?: (line: string) => void;
  now?: () => number;
}

interface Resolved {
  hubUrl: string;
  token: string;
  bypass?: string;
}

let lastFailureLoggedAt = Number.NEGATIVE_INFINITY;

/** Tests reset the one-line-per-window state between cases. */
export function resetInboxClientForTests(): void {
  lastFailureLoggedAt = Number.NEGATIVE_INFINITY;
}

function configOf(options: InboxClientOptions): Resolved | null {
  const env = options.env ?? (typeof process !== 'undefined' ? process.env : {});
  const hubUrl = env.HUB_URL?.trim();
  const token = env.HUB_INBOX_TOKEN?.trim();
  if (!hubUrl || !token) return null;
  const bypass = env.HUB_PROTECTION_BYPASS?.trim() || undefined;
  return { hubUrl: hubUrl.replace(/\/+$/, ''), token, bypass };
}

function logFailure(options: InboxClientOptions, reason: string): void {
  const now = (options.now ?? Date.now)();
  if (now - lastFailureLoggedAt < FAILURE_LOG_WINDOW_MS) return;
  lastFailureLoggedAt = now;
  (options.log ?? ((line) => console.warn(line)))(`[inbox] hub unreachable or refused (${reason}); falling back to email`);
}

/** One POST with a 4 s timeout. Retries once on a network error or 5xx, never on a 4xx. */
async function post(
  options: InboxClientOptions,
  config: Resolved,
  path: string,
  body: unknown,
): Promise<unknown | null> {
  const doFetch = options.fetch ?? fetch;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMIT_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        authorization: `Bearer ${config.token}`,
      };
      if (config.bypass) headers['x-vercel-protection-bypass'] = config.bypass;
      const res = await doFetch(`${config.hubUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.ok) return await res.json();
      if (res.status < 500) {
        // A refusal (401, 404, 422 ...) will not change on retry.
        logFailure(options, `http ${res.status}`);
        return null;
      }
      if (attempt === 2) logFailure(options, `http ${res.status}`);
    } catch (err) {
      if (attempt === 2) logFailure(options, err instanceof Error ? err.name : 'error');
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * Push one event. Returns the hub's answer, or null meaning "fall back to your
 * own email". Never throws.
 */
export async function emitInbox(event: unknown, options: InboxClientOptions = {}): Promise<InboxEmitResultV1 | null> {
  const config = configOf(options);
  if (!config) return null;
  const parsed = parseInboxEvent(event);
  if (!parsed.ok) {
    logFailure(options, `local event refused: ${parsed.reason}`);
    return null;
  }
  try {
    const answer = await post(options, config, '/api/inbox/events', parsed.value satisfies InboxEventV1);
    return answer === null ? null : parseInboxEmitResult(answer);
  } catch {
    return null;
  }
}

/** Resolve items this producer created. True when the hub acknowledged. Never throws. */
export async function resolveInbox(input: unknown, options: InboxClientOptions = {}): Promise<boolean> {
  const config = configOf(options);
  if (!config) return false;
  const parsed = parseInboxResolve(input);
  if (!parsed.ok || parsed.value.items.length === 0) return false;
  try {
    const answer = await post(options, config, '/api/inbox/resolve', parsed.value satisfies InboxResolveV1);
    return answer !== null;
  } catch {
    return false;
  }
}

/** True when the hub is configured for this module. Lets a caller decide whether to hide its own cadence UI (R7). */
export function inboxHubConfigured(options: InboxClientOptions = {}): boolean {
  return configOf(options) !== null;
}
