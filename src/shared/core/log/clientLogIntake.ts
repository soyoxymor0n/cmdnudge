// GENERATED from packages/core/src/log/clientLogIntake.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
import type { Request, RequestHandler, Response } from 'express';
import type { LogDetails, LogLevel } from './CentralLogger.js';

/**
 * Browser log intake - the ONE handler behind `POST /api/log`.
 *
 * The template used to inline this route, and every module generated from it
 * inherited the same shape: public (a visitor has no session when the landing
 * page logs an event), no rate limit, and `await logger.info(...)` - which
 * means every anonymous POST wrote one row into the SHARED cross-project
 * `global_logs` DB and held the serverless function for up to the logger's 5 s
 * write timeout before answering. That is the per-request-row shape the
 * logging-discipline skill forbids, reachable by anyone with curl, on ~25
 * apps at once (fleet review 2026-11-09).
 *
 * This handler keeps the endpoint public (the landing page and the tour need
 * it) but makes it proportionate:
 *
 * - **Rate limited per caller** (signed-in user id, else the client IP): the
 *   default allows a burst of real events and refuses a flood with 429. The
 *   limiter is injected so the host passes `checkRateLimit` from
 *   `ratelimit/upstash.ts` (Redis when configured; fails open without it, so
 *   a keyless dev server behaves as before).
 * - **Fire-and-forget**: the response goes out as soon as the payload is
 *   valid; the DB write runs in the background and its failure is already
 *   swallowed by CentralLogger. A client beacon has nothing to wait for.
 * - **Bounded payload**: message <= 500 chars, at most `maxExtraKeys` extra
 *   fields, each a short scalar. Anything else is dropped, not rejected: the
 *   row still says what happened, and CentralLogger caps the serialised size.
 * - **Levels**: `error` and `warn` pass through, everything else is `info`.
 *   `debug` is never accepted from a browser - it would not persist anyway.
 *
 * `req.ip` is only the real client address when the host trusts its proxy
 * (`app.set('trust proxy', true)` behind Vercel); without that, every caller
 * behind the platform shares ONE bucket. The template sets it.
 */

export interface ClientLogIntakeOptions {
  /** The host's CentralLogger (or anything with the same three methods). */
  logger: Pick<Record<'info' | 'warn' | 'error', (msg: string, details?: LogDetails) => Promise<void>>, 'info' | 'warn' | 'error'>;
  /** `checkRateLimit` from ratelimit/upstash.ts, or a stub in tests. Omit = no limit. */
  rateLimit?: (identifier: string, opts: { prefix: string; limit: number; windowSec: number }) => Promise<{ success: boolean }>;
  /** Limiter key prefix; use the app slug so the shared Redis is namespaced (e.g. `myapp_clientlog`). */
  prefix?: string;
  /** Events allowed per caller per window. Default 30. */
  limit?: number;
  /** Window in seconds. Default 60. */
  windowSec?: number;
  /** Who is calling: a user id when signed in, else null (the handler falls back to the IP). */
  identify?: (req: Request) => string | null | undefined;
  /** Hard cap on extra detail fields kept from the body. Default 12. */
  maxExtraKeys?: number;
}

export const CLIENT_LOG_MAX_MESSAGE = 500;
const MAX_EXTRA_VALUE = 200;
// The first group is the row's own envelope; the second is the columns CentralLogger fills from the AI cascade on the
// server (model, timing, retry count, failure code). A browser must not be able to set those: a forged error_code would
// show up in the ops error views as a provider failure (blueprint#210; the hub's inline /log strips them too).
const RESERVED = new Set([
  'level', 'message', 'event', 'source', 'project', 'ts', 'id',
  'error_code', 'error_msg', 'model', 'duration_ms', 'attempt',
]);

/** The level a browser may ask for. Anything but warn/error is info. */
export function clientLogLevel(level: unknown): Extract<LogLevel, 'info' | 'warn' | 'error'> {
  return level === 'error' || level === 'warn' ? level : 'info';
}

/**
 * Keep only short scalar extras under their own (non-reserved) keys. Exported
 * for the tests; the handler is the caller.
 */
export function sanitizeClientLogExtra(extra: unknown, maxKeys = 12): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return out;
  let n = 0;
  for (const [key, value] of Object.entries(extra as Record<string, unknown>)) {
    if (n >= maxKeys) break;
    if (RESERVED.has(key) || key.length > 40) continue;
    if (typeof value === 'string') out[key] = value.slice(0, MAX_EXTRA_VALUE);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'boolean') out[key] = value;
    else continue;
    n++;
  }
  return out;
}

export function createClientLogHandler(opts: ClientLogIntakeOptions): RequestHandler {
  const { logger, rateLimit, prefix = 'app_clientlog', limit = 30, windowSec = 60, identify, maxExtraKeys = 12 } = opts;
  return async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { level, message, event, ...extra } = body;
    if (typeof message !== 'string' || message.length === 0 || message.length > CLIENT_LOG_MAX_MESSAGE) {
      res.status(400).json({ error: 'Invalid log payload' });
      return;
    }
    if (rateLimit) {
      const who = identify?.(req) || req.ip || 'anon';
      const verdict = await rateLimit(`clientlog:${who}`, { prefix, limit, windowSec });
      if (!verdict.success) {
        res.status(429).json({ error: 'Too many log events' });
        return;
      }
    }
    const lvl = clientLogLevel(level);
    // Answer first; the write is background work whose failure CentralLogger
    // already swallows. A beacon must never wait on the logs DB.
    res.json({ ok: true });
    void logger[lvl](message, {
      event: typeof event === 'string' && event.length <= 80 ? event : 'client_event',
      source: 'browser',
      ...sanitizeClientLogExtra(extra, maxExtraKeys),
    }).catch(() => {});
  };
}
