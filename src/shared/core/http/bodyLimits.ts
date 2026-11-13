// GENERATED from packages/core/src/http/bodyLimits.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';

/**
 * Request body parsers with a SMALL global limit and a larger one only on named upload routes.
 *
 * The template used to mount `express.json({ limit: '10mb' })` (and urlencoded) for EVERY
 * request, before auth. Any anonymous caller could then make the server buffer and JSON.parse
 * 10 MB per request on any path, including ones that read two fields - a cheap memory and
 * CPU lever on a serverless function (regnorth, regcheck#135, blueprint review 2026-11-09).
 *
 * Now every body is capped at 256 KB (`DEFAULT_BODY_LIMIT`), and a route that really carries
 * a payload (a screenshot as a data URL, an import file) names its own limit:
 *
 *   app.use(bodyParsers({ uploads: { '/api/feature-request': '2mb' } }));
 *
 * Paths are matched against `req.path` at the level the middleware is mounted, so mount it on
 * `app` and name full `/api/...` paths (a trailing slash is ignored). A body over the limit gets
 * body-parser's 413, before any handler or auth code runs.
 *
 * A path may be a PATTERN, for routes with an id in them (blueprint#208):
 *
 *   app.use(bodyParsers({ uploads: {
 *     '/api/feature-request': '2mb',               // exact
 *     '/api/items/:id/attachments': '10mb',        // `:name` = exactly one path segment
 *     '/api/import/*': '5mb',                      // `*` = exactly one segment
 *     '/api/docs/**': '8mb',                       // `**` as the last segment = anything below
 *   } }));
 *
 * An exact path wins over a pattern; patterns are tried in the order written, so list the narrower
 * one first. Patterns match case-insensitively like Express routes do, so a route is never reachable
 * under a spelling that gets a different limit than the one you wrote. `:id` never matches an empty
 * segment, and `*` never crosses a `/`.
 */
export const DEFAULT_BODY_LIMIT = '256kb';

export interface BodyParserOptions {
  /** The limit for every request not named in `uploads`. Default 256 KB. */
  limit?: string;
  /** Path (exact, or a pattern with `:id` / `*` / trailing `/**`) -> larger limit, e.g. `{ '/api/feature-request': '2mb' }`. */
  uploads?: Record<string, string>;
}

type Pair = [RequestHandler, RequestHandler];

const pair = (limit: string): Pair => [express.json({ limit }), express.urlencoded({ extended: true, limit })];

const norm = (p: string) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A pattern (`:id`, `*`, trailing `/**`) as a regexp, or null when the path has no wildcard (then it is matched exactly). */
export function compilePathPattern(pattern: string): RegExp | null {
  const segs = norm(pattern).split('/');
  if (!segs.some((s) => s === '*' || s === '**' || s.startsWith(':'))) return null;
  let tail = '';
  const parts = segs.map((seg, i) => {
    if (seg === '**' && i === segs.length - 1) {
      tail = '(?:/.*)?';
      return null;
    }
    if (seg === '*' || seg.startsWith(':')) return '[^/]+';
    return escapeRe(seg);
  });
  return new RegExp(`^${parts.filter((x) => x !== null).join('/')}${tail}$`, 'i');
}

/** The limit `uploads` names for this request path, or undefined for the default. Exact first, then patterns in order. */
export function uploadLimitFor(path: string, uploads: Record<string, string>): string | undefined {
  const p = norm(path);
  const exact = Object.entries(uploads).find(([k]) => norm(k) === p && compilePathPattern(k) === null);
  if (exact) return exact[1];
  for (const [k, limit] of Object.entries(uploads)) {
    if (compilePathPattern(k)?.test(p)) return limit;
  }
  return undefined;
}

/** One middleware: JSON + urlencoded parsing with the limit for this request's path. */
export function bodyParsers({ limit = DEFAULT_BODY_LIMIT, uploads = {} }: BodyParserOptions = {}): RequestHandler {
  const fallback = pair(limit);
  const byLimit = new Map<string, Pair>();
  const pairFor = (l: string) => byLimit.get(l) ?? (byLimit.set(l, pair(l)), byLimit.get(l)!);
  for (const l of Object.values(uploads)) pairFor(l);
  return (req: Request, res: Response, next: NextFunction) => {
    const named = uploadLimitFor(req.path, uploads);
    const [json, form] = named === undefined ? fallback : pairFor(named);
    json(req, res, (err?: unknown) => (err ? next(err) : form(req, res, next)));
  };
}
