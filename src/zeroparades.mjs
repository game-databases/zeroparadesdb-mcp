// Client of the zeroparadesdb.com public JSON API, shared by the Skill, the MCP
// server and the browser extension. Each artifact carries a byte-identical copy;
// `node distribution/core/sync.mjs` writes them and `--check` compares them.

export const SITE = "https://zeroparadesdb.com";
export const LOCALES = ["en", "es-419", "de", "ru", "zh-cn"];

/** Kinds that have a page and a dataset, as the site's search names them. */
export const DATASETS = {
  skill: "skills", item: "items", character: "characters", task: "tasks", thought: "thoughts",
  "status-effect": "status-effects", achievement: "achievements", persona: "personas",
  "progression-unit": "progression-units", district: "districts", waypoint: "waypoints",
  location: "locations", "interior-location": "interior-locations", lore: "glossary",
};
/** Kinds whose links carry a preview card on the site. */
const CARD_KINDS = new Set(["skill", "item", "thought", "status-effect", "character", "task", "achievement",
  "persona", "district", "waypoint", "interior-location", "game-over"]);
/** Search kinds that are passages of dialogue rather than records. */
const PASSAGES = new Set(["dialogue", "check"]);

/** The game's language closest to a browser or user language tag; English otherwise. */
export function gameLocale(tag) {
  const lower = String(tag ?? "").toLowerCase();
  if (lower.startsWith("es")) return "es-419";
  if (lower.startsWith("zh")) return "zh-cn";
  return LOCALES.find((code) => lower === code || lower.startsWith(`${code}-`)) ?? "en";
}

export function createClient({ base = SITE, fetch: fetchImpl = globalThis.fetch } = {}) {
  const origin = base.replace(/\/$/, "");
  const prefix = (locale) => (locale === "en" ? "" : `/${locale}`);
  const cache = new Map();

  async function json(path, { cached = true } = {}) {
    if (cached && cache.has(path)) return cache.get(path);
    const pending = fetchImpl(`${origin}${path}`, { headers: { accept: "application/json" } })
      .then(async (res) => ({ status: res.status, body: res.status === 200 || res.status === 404 ? await res.json() : null }));
    if (cached) cache.set(path, pending);
    const out = await pending;
    if (out.body === null) {
      cache.delete(path);
      throw new Error(`${path} answered ${out.status}`);
    }
    return out;
  }

  const pagePath = (href) => decodeURI(new URL(href, origin).pathname);
  const absolute = (href) => new URL(encodeURI(href), origin).href;

  /** The site's own search, in one language; `kind` narrows it to one search kind. */
  async function search(term, { locale = "en", kind = null, page = 1 } = {}) {
    const query = new URLSearchParams({ search: term });
    if (kind) query.set("searchKind", kind);
    if (page !== 1) query.set("searchPage", String(page));
    const { status, body } = await json(`${prefix(locale)}/data/zp/search-index?${query}`, { cached: false });
    if (status === 404) return { found: false, term, reason: "no such result page", pages: body.pages };
    return {
      found: body.total > 0, term, locale, total: body.total, page: body.page, pages: body.pages,
      counts: body.counts,
      results: body.rows.map((row) => ({
        kind: row.kind, id: row.id.slice(row.kind.length + 1), name: row.name, ...(row.sub ? { detail: row.sub } : {}),
        ...(row.dc ? { difficulty: row.dc } : {}), url: absolute(row.href),
      })),
    };
  }

  /** The preview card the site shows for a page link, or null when the kind has none. */
  async function card(kind, url, locale = "en") {
    if (!CARD_KINDS.has(kind)) return null;
    const { body } = await json(`/api/previews/${locale}/${kind}`);
    const found = body[pagePath(url)];
    return found ? { ...found, ...(found.icon ? { icon: absolute(found.icon) } : {}) } : null;
  }

  /** The records a selected or typed term names: game records first, never passages of dialogue. */
  async function lookup(term, { locale = "en", limit = 3 } = {}) {
    const text = String(term ?? "").trim();
    if (text.length < 2) return { found: false, term: text, reason: "a term needs at least two characters" };
    const result = await search(text, { locale });
    const records = (result.results ?? []).filter((row) => !PASSAGES.has(row.kind)).slice(0, limit);
    if (!records.length) return { found: false, term: text, locale, searchUrl: `${origin}${prefix(locale) || "/"}?${new URLSearchParams({ search: text })}` };
    const entries = await Promise.all(records.map(async (row) => ({ ...row, card: await card(row.kind, row.url, locale) })));
    return { found: true, term: text, locale, entries };
  }

  /** One record by kind and id: the game's own fields and its page in that language. */
  async function record(kind, id, { locale = "en" } = {}) {
    const dataset = DATASETS[kind];
    if (!dataset) return { found: false, kind, id, reason: `unknown kind; kinds: ${Object.keys(DATASETS).join(", ")}` };
    const { body } = await json(`${prefix(locale)}/data/zp/${dataset}.json`);
    const rows = Array.isArray(body) ? body : body.rows;
    const row = rows.find((entry) => entry.id === id);
    if (!row) return { found: false, kind, id, reason: `no ${kind} has the id ${id}` };
    const { page, provenance, ...fields } = row;
    return { found: true, kind, id, locale, page: page ?? null,
      card: page ? await card(kind, page.url, locale) : null, fields };
  }

  /** The site's build planner prefilled with thoughts (each with its phase) and a focus skill, after checking every id. */
  async function plannerLink({ thoughts = [], skill = null, locale = "en" } = {}) {
    const PHASES = { reinforced: "", unconditioned: ":u", suppressed: ":s", dissonant: ":r:d" };
    const known = async (kind) => new Set(((await json(`${prefix(locale)}/data/zp/${DATASETS[kind]}.json`)).body.rows).map((row) => row.id));
    const [thoughtIds, skillIds] = await Promise.all([known("thought"), known("skill")]);
    const unknown = [
      ...thoughts.filter((entry) => !thoughtIds.has(entry.id)).map((entry) => `thought ${entry.id}`),
      ...thoughts.filter((entry) => !Object.hasOwn(PHASES, entry.phase ?? "reinforced")).map((entry) => `phase ${entry.phase}`),
      ...(skill && !skillIds.has(skill) ? [`skill ${skill}`] : []),
    ];
    if (unknown.length) return { found: false, reason: `unknown ${unknown.join(", ")}` };
    const manual = (await fetchImpl(`${origin}${prefix(locale)}/llms.txt`).then((res) => res.text()));
    const planner = manual.match(/^- planner: (\S+)$/m)?.[1];
    if (!planner) throw new Error("llms.txt names no planner address");
    const query = new URLSearchParams();
    if (thoughts.length) query.set("t", [...thoughts].sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => `${entry.id}${PHASES[entry.phase ?? "reinforced"]}`).join(","));
    if (skill) query.set("skill", skill);
    return { found: true, locale, url: `${absolute(decodeURI(new URL(planner).pathname))}${query.size ? `?${query}` : ""}` };
  }

  return { search, lookup, record, card, plannerLink };
}
