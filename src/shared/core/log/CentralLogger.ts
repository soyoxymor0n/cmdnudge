// GENERATED from packages/core/src/log/CentralLogger.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
/**
 * CentralLogger — Canonical Source (v3, blueprint edition)
 * Shared across all projects. The blueprint's packages/core is now the single
 * source of truth — projects receive it via the synced src/shared/core copy.
 *
 * Key design decisions:
 * - message is stored in extra_json (not a separate column) for schema compatibility
 * - All DB writes are awaited with a 5s timeout — safe for serverless environments
 * - initTable uses the same timeout to avoid cold-start hangs
 * - Always logs to console regardless of DB availability
 * - v3: log levels (debug/info/warn/error). LOG_LEVEL env (default 'info') gates
 *   which levels are persisted to the DB so everyday usage stays proportionate.
 *   Console output is gated one level looser (debug prints only when LOG_LEVEL=debug).
 *
 * DISCIPLINE (logging-discipline skill): NEVER wire this into per-request or
 * per-route middleware. A middleware mistake once wrote 32,000 spam rows to the
 * shared analytics DB. DB-backed logging is for meaningful, low-frequency events
 * (pipeline steps, failures, quota hits) — use console.debug for traffic noise.
 *
 * NO `any`, NO ESLINT DISABLES: the libsql client is typed by the two-method slice
 * this file calls (`LogDbClient`), so a Next.js consumer (eslint-config-next enforces
 * no-explicit-any with no exceptions) can take this file byte-identically instead of
 * hand-editing it after every re-copy, the same reasoning as portability/descriptor.ts.
 */
export interface LogDetails {
    event?: string;
    model?: string;
    duration_ms?: number;
    attempt?: number;
    error_code?: string;
    error_msg?: string;
    /** Generic reference id (row/job/entity the event belongs to). */
    refId?: string;
    [key: string]: unknown;
}

/** The slice of a libsql client this logger calls. `createClient` from `@libsql/client` (or `/web`) fits it. */
export interface LogDbClient {
    execute(stmt: string | { sql: string; args: Array<string | number | null> }): Promise<unknown>;
}

/** What to pass as `createClientFn`: libsql's `createClient`, or a test double. */
export type LogClientFactory = (config: { url: string; authToken: string }) => LogDbClient;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

// global_logs is shared central storage across every project in the workspace,
// and some callers reach logToDb from an unauthenticated intake route - cap the
// serialised payload so one call cannot fill shared storage with an oversized
// row. Kept well under the request body limit on purpose.
const MAX_PAYLOAD_CHARS = 4000;

const DB_TIMEOUT_MS = 5000;

/**
 * The DB call, or a rejection after DB_TIMEOUT_MS - whichever comes first. The
 * timer is CLEARED when the call settles: a bare `Promise.race` against a
 * `setTimeout` left a live 5 s timer behind every log line, which kept a Node
 * process (a CLI, a test runner, a long-running server shutting down) alive
 * for five more seconds per logged event, and under vitest surfaced as "a
 * timer is still pending" noise. The behaviour on a slow DB is unchanged.
 */
function withTimeout<T>(work: Promise<T>, code: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(code)), DB_TIMEOUT_MS);
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export class CentralLogger {
    private client: LogDbClient | undefined;
    private project: string;
    private isInitialized = false;
    private isInitializing = false;
    private minDbLevel: LogLevel;

    /**
     * @param project   Unique lowercase slug (e.g. 'newspills', 'mybeats', 'toyfans')
     * @param createClientFn  Pass createClient from '@libsql/client' or '@libsql/client/web'
     * @param url       TURSO_CENTRAL_LOGS_URL env value
     * @param token     TURSO_CENTRAL_LOGS_TOKEN env value
     * @param minDbLevel  Lowest level persisted to the DB (default from LOG_LEVEL env, else 'info')
     */
    constructor(project: string, createClientFn: LogClientFactory, url?: string, token?: string, minDbLevel?: LogLevel) {
        this.project = project;
        const envLevel = (typeof process !== 'undefined' ? process.env?.LOG_LEVEL : undefined) as LogLevel | undefined;
        this.minDbLevel = minDbLevel || (envLevel && envLevel in LEVEL_ORDER ? envLevel : 'info');
        if (url && token) {
            try {
                const cleanUrl = url.replace(/^"|"$/g, '');
                const cleanToken = token.replace(/^"|"$/g, '');
                this.client = createClientFn({ url: cleanUrl, authToken: cleanToken });
            } catch (e) {
                console.error(`[CentralLogger] [${this.project}] Client creation failed:`, e);
            }
        } else {
            console.warn(`[CentralLogger] [${this.project}] Missing URL or Token — DB logging disabled.`);
        }
    }

    private shouldPersist(level: LogLevel): boolean {
        return LEVEL_ORDER[level] >= LEVEL_ORDER[this.minDbLevel];
    }

    private async initTable() {
        if (!this.client || this.isInitialized || this.isInitializing) return;
        this.isInitializing = true;
        try {
            await withTimeout(this.client.execute(`
                    CREATE TABLE IF NOT EXISTS global_logs (
                        id TEXT PRIMARY KEY,
                        ts TEXT DEFAULT (datetime('now')),
                        project TEXT NOT NULL,
                        level TEXT NOT NULL,
                        event TEXT NOT NULL,
                        model TEXT,
                        duration_ms INTEGER,
                        attempt INTEGER,
                        error_code TEXT,
                        error_msg TEXT,
                        extra_json TEXT
                    )
                `), 'INIT_TIMEOUT');
            this.isInitialized = true;
        } catch (e) {
            console.error(`[CentralLogger] [${this.project}] Init failed:`, e instanceof Error ? e.message : String(e));
            this.isInitialized = true; // Treat as initialized — table likely exists from another project
        } finally {
            this.isInitializing = false;
        }
    }

    /** Write a log entry. Awaited with a 5s timeout — safe for serverless. Never throws. */
    public async logToDb(level: LogLevel, message: string, details?: LogDetails) {
        const { event, model, duration_ms, attempt, error_code, error_msg, ...extra } = details || {};

        // Console output: debug only shown when minDbLevel is debug; everything else always
        const consoleMsg = `[${level.toUpperCase()}] [${this.project}] ${message}`;
        if (level === 'error') console.error(consoleMsg, details);
        else if (level === 'warn') console.warn(consoleMsg, details);
        else if (level === 'debug') { if (this.minDbLevel === 'debug') console.debug(consoleMsg, details); }
        else console.log(consoleMsg, details);

        if (!this.client) return;
        if (!this.shouldPersist(level)) return;

        try {
            if (!this.isInitialized) await this.initTable();

            const id = typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : Math.random().toString(36).substring(2, 15);

            // message is stored inside extra_json — compatible with all schema versions
            const fullPayloadJson = JSON.stringify({ message, ...extra });
            // Over the cap, a truncated string would no longer parse as JSON, so
            // swap in a small, valid record that says what happened instead of
            // silently chopping the string - a log viewer must still be able to
            // read the row. The message is shortened too, since a huge message is
            // usually what pushed the payload over the cap in the first place.
            const payloadJson = fullPayloadJson.length > MAX_PAYLOAD_CHARS
                ? JSON.stringify({ message: message.slice(0, 200), truncated: true, originalChars: fullPayloadJson.length }).slice(0, MAX_PAYLOAD_CHARS)
                : fullPayloadJson;

            await withTimeout(this.client.execute({
                    sql: `INSERT INTO global_logs (id, ts, project, level, event, model, duration_ms, attempt, error_code, error_msg, extra_json)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        id, new Date().toISOString(), this.project, level,
                        event || 'generic',
                        model || null, duration_ms || null, attempt || null,
                        error_code || null, error_msg || (level === 'error' ? message : null),
                        payloadJson
                    ]
                }), 'WRITE_TIMEOUT');
        } catch (err) {
            console.error(`[CentralLogger] [${this.project}] DB Write failed:`, err instanceof Error ? err.message : String(err));
        }
    }

    // A bare string as the second arg is interpreted as a refId, NOT an event
    // name — logger.info('Queued', { event: 'queued', refId }) is the full form.
    public debug = (msg: string, details?: LogDetails | string) =>
        this.logToDb('debug', msg, typeof details === 'string' ? { refId: details } : details);

    public info = (msg: string, details?: LogDetails | string) =>
        this.logToDb('info', msg, typeof details === 'string' ? { refId: details } : details);

    public warn = (msg: string, details?: LogDetails | string) =>
        this.logToDb('warn', msg, typeof details === 'string' ? { refId: details } : details);

    public error = (msg: string, details?: LogDetails | string) =>
        this.logToDb('error', msg, typeof details === 'string' ? { refId: details } : details);
}
