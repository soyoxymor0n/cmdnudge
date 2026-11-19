// GENERATED from packages/core/src/eurlex/fetch.ts — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
/**
 * EUR-Lex / CELLAR fetcher (blueprint#365, extracted from RegSense's
 * src/server/review/eurlex.ts). Fetch only: no cache, no HTML parsing. A caller
 * keeps its own store and text extraction on top of `fetchEuAct`.
 *
 * Why CELLAR first: EUR-Lex answers automated clients with an AWS WAF challenge
 * (HTTP 202 or an empty body). The Publications Office's CELLAR repository serves
 * the same XHTML by content negotiation, so it is the primary source and EUR-Lex
 * HTML the fallback. A challenge is its own error, never parsed as an empty act.
 *
 * Consolidated versions are the way amendments are compared, so `fetchEuAct`
 * accepts a consolidated CELEX (02024R1689-20260727) as well as a base one.
 */

/** 32024R1689 (as adopted) or 02024R1689-20260727 (consolidated). */
export const CELEX = /^(?:[0-9]{5}[A-Z]{1,2}[0-9]{4}|0[0-9]{4}[A-Z]{1,2}[0-9]{4}-[0-9]{8})$/;
/** A base act as adopted, 3YYYY... : the only form that has a consolidated listing. */
export const BASE_CELEX = /^3[0-9]{4}[A-Z]{1,2}[0-9]{4}$/;
export const CELLAR_SPARQL = 'https://publications.europa.eu/webapi/rdf/sparql';
export const EU_FETCH_USER_AGENT = 'eu-legal-fetch/1';

export type TextSource = 'cellar' | 'eurlex';

/**
 * What a fetch answered. A fetcher may also return a bare string (a 200 body).
 * `bytes`, `contentType` and `url` are set by the real transport; a fake may leave them out.
 */
export interface FetchResult {
  status: number;
  /** The body decoded as UTF-8. A binary body (a zip) is read from `bytes`, never from here. */
  body: string;
  /** The raw response bytes, exactly as sent. */
  bytes?: Uint8Array;
  /** The Content-Type header, '' when there is none. */
  contentType?: string;
  /** The URL that served the response, after redirects. */
  url?: string;
}

/** What the real transport answers: every field set. */
export interface TransportResult extends FetchResult {
  bytes: Uint8Array;
  contentType: string;
  url: string;
}

export type HtmlFetcher = (url: string, headers?: Record<string, string>) => Promise<string | FetchResult>;
export type TransportFetcher = (url: string, headers?: Record<string, string>) => Promise<TransportResult>;

/** The site answered with a bot challenge instead of the document. */
export class EurlexChallengeError extends Error {
  readonly code = 'waf_challenge';
  constructor(message: string) {
    super(message);
    this.name = 'EurlexChallengeError';
  }
}

/** Neither CELLAR nor EUR-Lex has this document. */
export class EurlexNoDocumentError extends Error {
  readonly code = 'no_document';
  constructor(message: string) {
    super(message);
    this.name = 'EurlexNoDocumentError';
  }
}

/** Neither EUR-Lex's ALL page nor the CELLAR SPARQL endpoint could list the versions. */
export class ConsolidatedListingUnavailableError extends Error {
  readonly code = 'consolidated_listing_unavailable';
  constructor(message: string) {
    super(message);
    this.name = 'ConsolidatedListingUnavailableError';
  }
}

/**
 * The 24 official EU languages, keyed by ISO 639-1 (the caller's `lang`, as RegNorth's CELLAR_LANG keys it).
 * The value is the ISO 639-2/B code CELLAR negotiates on. A Map, so a key such as "__proto__" is a plain miss.
 */
const CELLAR_LANG = new Map<string, string>([
  ['bg', 'bul'], ['cs', 'ces'], ['da', 'dan'], ['de', 'deu'], ['el', 'ell'], ['en', 'eng'], ['es', 'spa'], ['et', 'est'],
  ['fi', 'fin'], ['fr', 'fra'], ['ga', 'gle'], ['hr', 'hrv'], ['hu', 'hun'], ['it', 'ita'], ['lt', 'lit'], ['lv', 'lav'],
  ['mt', 'mlt'], ['nl', 'nld'], ['pl', 'pol'], ['pt', 'por'], ['ro', 'ron'], ['sk', 'slk'], ['sl', 'slv'], ['sv', 'swe'],
]);

/**
 * The two codes a language needs: CELLAR's Accept-Language (639-2/B) and EUR-Lex's path code (the 639-1 code, upper case).
 * Anything else throws, so a caller-supplied language never reaches a header or a URL.
 */
function euLanguage(lang: string): { cellar: string; eurlex: string } {
  const cellar = CELLAR_LANG.get(lang);
  if (!cellar) throw new Error(`not an EU language: ${JSON.stringify(lang)}`);
  return { cellar, eurlex: lang.toUpperCase() };
}

/** The EUR-Lex HTML page of one act in one of the 24 languages (English by default). */
export function eurlexUrl(celex: string, lang = 'en'): string {
  return `https://eur-lex.europa.eu/legal-content/${euLanguage(lang).eurlex}/TXT/HTML/?uri=CELEX:${celex}`;
}

export function cellarUrl(celex: string, scheme: 'https' | 'http' = 'https'): string {
  return `${scheme}://publications.europa.eu/resource/celex/${celex}`;
}

/**
 * AWS WAF's challenge page: its interstitial script, HTTP 202, or an empty body.
 * A 404 with an empty body is a missing document, not a challenge.
 */
export function isChallenge(r: FetchResult): boolean {
  if (r.status === 202) return true;
  if (/awswaf|AwsWafIntegration|gokuProps|challenge\.js|captcha-sdk/i.test(r.body.slice(0, 20_000))) return true;
  if (r.status === 404) return false;
  return !r.body.trim();
}

const asResult = (r: string | FetchResult): FetchResult => (typeof r === 'string' ? { status: 200, body: r } : r);

/**
 * The real transport: redirects followed, one retry on a network error (a challenge
 * is not retried, it will not go away in 500 ms). The caller names its user agent.
 */
export function createEuFetcher(opts: { userAgent?: string } = {}): TransportFetcher {
  const userAgent = opts.userAgent ?? EU_FETCH_USER_AGENT;
  return async (url, headers) => {
    let last: Error = new Error('no attempt made');
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      try {
        const res = await fetch(url, {
          redirect: 'follow',
          signal: controller.signal,
          headers: { Accept: 'text/html', 'User-Agent': userAgent, ...headers },
        });
        // Bytes first: a Formex zip or any binary body must not pass through a text decode. `body` is the UTF-8 view of the same bytes.
        const bytes = new Uint8Array(await res.arrayBuffer());
        return { status: res.status, body: new TextDecoder().decode(bytes), bytes, contentType: res.headers.get('content-type') ?? '', url: res.url || url };
      } catch (e) {
        last = e instanceof Error ? e : new Error(String(e));
      } finally {
        clearTimeout(timer);
      }
    }
    throw last;
  };
}

export const defaultEuFetcher: HtmlFetcher = createEuFetcher();

type Attempt = { source: TextSource; url: string; headers?: Record<string, string> };
type Tried = { ok: true; body: string } | { ok: false; challenged: boolean; missing: boolean; why: string };

/** One source: the body on success, or why not. */
async function tryFetch(fetcher: HtmlFetcher, a: Attempt): Promise<Tried> {
  let r: FetchResult;
  try {
    r = asResult(await fetcher(a.url, a.headers));
  } catch (e) {
    return { ok: false, challenged: false, missing: false, why: `${a.url}: ${(e as Error).message}` };
  }
  if (isChallenge(r)) return { ok: false, challenged: true, missing: false, why: `${a.url}: bot challenge (HTTP ${r.status})` };
  if (r.status === 404 || /The requested document does not exist/i.test(r.body)) return { ok: false, challenged: false, missing: true, why: `${a.url}: no such document` };
  if (r.status < 200 || r.status >= 300) return { ok: false, challenged: false, missing: false, why: `${a.url}: HTTP ${r.status}` };
  return { ok: true, body: r.body };
}

export interface EuActFetch {
  celex: string;
  /** Which source served the text. */
  source: TextSource;
  /** The URL that actually served the text. */
  url: string;
  /** The page a PERSON should open: always EUR-Lex, whichever source served the text. */
  viewUrl: string;
  /** The raw document body (XHTML from CELLAR, or HTML from EUR-Lex). */
  body: string;
}

/**
 * The text of one act (or one consolidated version): CELLAR over https, then over
 * http, then EUR-Lex. `opts.lang` is the ISO 639-1 language of the text (`en` by default);
 * CELLAR is asked for it by Accept-Language and the EUR-Lex fallback is that language's page.
 * Throws EurlexNoDocumentError when nothing has the document,
 * EurlexChallengeError when every source answered with a challenge.
 */
export async function fetchEuAct(celex: string, opts: { fetcher?: HtmlFetcher; lang?: string } = {}): Promise<EuActFetch> {
  // The id goes into a URL path: refuse anything that is not a CELEX number before a request is made.
  if (!CELEX.test(celex)) throw new Error(`not a CELEX number: ${celex}`);
  // The language goes into a header and a URL path: the same rule, before any request.
  const lang = opts.lang ?? 'en';
  const { cellar } = euLanguage(lang);
  const fetcher = opts.fetcher ?? defaultEuFetcher;
  const viewUrl = eurlexUrl(celex, lang);
  const cellarHeaders = { Accept: 'application/xhtml+xml', 'Accept-Language': cellar };
  const attempts: Attempt[] = [
    { source: 'cellar', url: cellarUrl(celex, 'https'), headers: cellarHeaders },
    { source: 'cellar', url: cellarUrl(celex, 'http'), headers: cellarHeaders },
    { source: 'eurlex', url: viewUrl },
  ];
  const failures: { challenged: boolean; missing: boolean; why: string }[] = [];
  let cellarMissing = false;
  for (const a of attempts) {
    // CELLAR said "no such document" over https: http is the same repository.
    if (cellarMissing && a.source === 'cellar') continue;
    const r = await tryFetch(fetcher, a);
    if (r.ok) return { celex, source: a.source, url: a.url, viewUrl, body: r.body };
    failures.push(r);
    if (r.missing && a.source === 'cellar') cellarMissing = true;
  }
  if (failures.every((f) => f.missing)) throw new EurlexNoDocumentError(`EUR-Lex has no document ${celex}`);
  if (failures.every((f) => f.challenged || f.missing)) {
    throw new EurlexChallengeError(
      `EUR-Lex and the Publications Office both answered with a bot challenge instead of ${celex}; try again later (${failures.map((f) => f.why).join('; ')})`,
    );
  }
  throw new Error(`could not fetch ${celex}: ${failures.map((f) => f.why).join('; ')}`);
}

/** SPARQL: every consolidated act that consolidates `baseCelex`. The id is quoted into the query, so it is checked first. */
export function consolidatedSparql(baseCelex: string): string {
  if (!BASE_CELEX.test(baseCelex)) throw new Error(`not a base CELEX number: ${baseCelex}`);
  return [
    'PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>',
    'SELECT DISTINCT ?celex WHERE {',
    '  ?act cdm:act_consolidated_consolidates_resource_legal ?base .',
    `  ?base cdm:resource_legal_id_celex "${baseCelex}"^^<http://www.w3.org/2001/XMLSchema#string> .`,
    '  ?act cdm:resource_legal_id_celex ?celex .',
    '}',
  ].join('\n');
}

/**
 * The consolidated versions of a base act, oldest first. EUR-Lex's ALL page first;
 * on a challenge (or any failure) the CELLAR SPARQL endpoint. When both fail,
 * ConsolidatedListingUnavailableError: the caller then asks for the CELEX to be typed in.
 */
export async function consolidatedVersions(baseCelex: string, fetcher: HtmlFetcher = defaultEuFetcher): Promise<string[]> {
  if (!BASE_CELEX.test(baseCelex)) throw new Error(`not a base CELEX number: ${baseCelex}`);
  const base = `0${baseCelex.slice(1)}`;
  const own = new RegExp(`^${base}-[0-9]{8}$`);
  const page = await tryFetch(fetcher, { source: 'eurlex', url: `https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:${baseCelex}` });
  if (page.ok) {
    const found = new Set(page.body.match(new RegExp(`${base}-[0-9]{8}`, 'g')) ?? []);
    return [...found].sort();
  }
  const url = `${CELLAR_SPARQL}?query=${encodeURIComponent(consolidatedSparql(baseCelex))}`;
  const sparql = await tryFetch(fetcher, { source: 'cellar', url, headers: { Accept: 'application/sparql-results+json' } });
  if (sparql.ok) {
    try {
      const json = JSON.parse(sparql.body) as { results?: { bindings?: { celex?: { value?: string } }[] } };
      const found = new Set((json.results?.bindings ?? []).map((b) => b.celex?.value ?? '').filter((v) => own.test(v)));
      return [...found].sort();
    } catch {
      /* fall through */
    }
  }
  throw new ConsolidatedListingUnavailableError(
    `The list of consolidated versions of ${baseCelex} is unavailable right now; enter the consolidated CELEX number (for example ${base}-YYYYMMDD) directly.`,
  );
}
