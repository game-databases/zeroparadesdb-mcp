#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient, DATASETS, LOCALES, SITE } from "./zeroparades.mjs";

const base = process.env.ZEROPARADES_BASE ?? SITE;
const client = createClient({ base });
const server = new McpServer({ name: "zeroparadesdb", version: "0.1.1", websiteUrl: SITE });
const READ_ONLY = { readOnlyHint: true, openWorldHint: true };
const locale = z.enum(LOCALES).optional().describe("Answer language: en (default), es-419, de, ru or zh-cn. Page projections carry localized names and links; raw fields may remain English.");
const answer = result => ({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });

function publicUrl(value) {
  const url = new URL(value, base);
  return new URL(`${url.pathname}${url.search}${url.hash}`, SITE).href;
}

function withPage(record) {
  const address = record.url ?? record.page?.url;
  if (!address) return { ...record, slug: null, url: null };
  const url = publicUrl(address);
  const slug = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1));
  return {
    ...record,
    slug,
    url,
    ...(record.page ? { page: { ...record.page, url } } : {}),
    ...(record.card?.icon ? { card: { ...record.card, icon: publicUrl(record.card.icon) } } : {}),
  };
}

function requireFound(result) {
  if (!result.found) throw new Error(`${result.reason ?? "Entity not found."} Use search to find a published name and id.`);
  return result;
}

function tool(name, definition, run) {
  server.registerTool(name, { ...definition, annotations: READ_ONLY }, async args => {
    try {
      return answer(await run(args));
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
      };
    }
  });
}

tool("lookup", {
  title: "Look up a Zero Parades term",
  description: "The best-matching records for a named skill, thought, item, character, task or place, with canonical page slugs, URLs and preview facts. Use search for dialogue passages. A missing term is a tool error with a search suggestion.",
  inputSchema: { term: z.string().trim().min(2), locale },
}, async ({ term, locale }) => {
  const result = requireFound(await client.lookup(term, { locale }));
  return { ...result, entries: result.entries.map(withPage) };
});

tool("search", {
  title: "Search Zero Parades",
  description: "The site's search over records, checks and dialogue, 50 results per page. Results include name, kind, stable id, canonical page slug and production URL. Checks include difficulty; passage URLs retain their fragment. Use page 2 and later up to pages to continue.",
  inputSchema: { query: z.string().trim().min(2), kind: z.string().optional(), page: z.number().int().positive().optional(), locale },
}, async ({ query, kind, page, locale }) => {
  const result = await client.search(query, { kind: kind ?? null, page: page ?? 1, locale });
  if (!result.results) requireFound(result);
  return { ...result, results: result.results.map(withPage) };
});

tool("get_record", {
  title: "Get a Zero Parades record",
  description: "One record by kind and stable id from search or lookup. Returns raw game fields, localized page projection and preview facts, plus canonical page slug and URL. A null page means no published page in that language. Missing ids are tool errors; use search rather than guessing ids from slugs.",
  inputSchema: { kind: z.enum(Object.keys(DATASETS)), id: z.string().trim().min(1), locale },
}, async ({ kind, id, locale }) => withPage(requireFound(await client.record(kind, id, { locale }))));

tool("list_entities", {
  title: "Browse a Zero Parades collection",
  description: "Published page projections for one record kind and language, 50 per page. Null-page records are excluded rather than given invented links. Continue with nextPage; an out-of-range page is a tool error.",
  inputSchema: { kind: z.enum(Object.keys(DATASETS)), page: z.number().int().positive().default(1), locale },
}, async ({ kind, page, locale = "en" }) => {
  const prefix = locale === "en" ? "" : `/${locale}`;
  const response = await fetch(new URL(`${prefix}/data/zp/${DATASETS[kind]}.json`, base), {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`The ${kind} collection returned HTTP ${response.status}. Use search to find a published entry.`);
  const body = await response.json();
  const rows = (Array.isArray(body) ? body : body.rows).filter(row => row.page);
  const pages = Math.ceil(rows.length / 50);
  if (page > Math.max(1, pages)) throw new Error(`Result page not found. This collection has ${pages} pages in ${locale}.`);
  return {
    kind, locale, page, pages,
    nextPage: page < pages ? page + 1 : null,
    entries: rows.slice((page - 1) * 50, page * 50).map(row => withPage({
      id: row.id, kind, name: row.page.name, description: row.page.description, url: row.page.url,
    })),
  };
});

tool("planner_link", {
  title: "Build planner link",
  description: "The site's planner prefilled with thoughts and a focus skill, after validating their ids. Thought phases are reinforced, unconditioned, suppressed or dissonant. Unknown ids are tool errors. This returns a link; it does not change a saved build.",
  inputSchema: {
    thoughts: z.array(z.object({ id: z.string().min(1), phase: z.enum(["reinforced", "unconditioned", "suppressed", "dissonant"]).optional() })).optional(),
    skill: z.string().min(1).optional(), locale,
  },
}, async ({ thoughts, skill, locale }) => {
  const result = requireFound(await client.plannerLink({ thoughts: thoughts ?? [], skill: skill ?? null, locale }));
  return { ...result, url: publicUrl(result.url) };
});

await server.connect(new StdioServerTransport());
