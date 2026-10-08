#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient, DATASETS, LOCALES, SITE } from "./zeroparades.mjs";

const READ_ONLY = { readOnlyHint: true, openWorldHint: true };
const locale = z.enum(LOCALES).optional().describe("Answer language: en (default), es-419, de, ru or zh-cn. Names, descriptions and page links follow it.");
const answer = (result) => ({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });

function createServer(client = createClient()) {
  const server = new McpServer({ name: "zeroparadesdb", version: "0.1.0", websiteUrl: SITE });

  server.registerTool("lookup", {
    title: "Look up a Zero Parades term",
    description: "What a named skill, thought, item, character, task, status effect, achievement, persona, district, waypoint, interior or glossary term is: the best-matching records (never lines of dialogue) with their page url and the site's preview card (facts and description, the game's own text). found: false means the site has no such record.",
    inputSchema: { term: z.string().min(2), locale },
    annotations: READ_ONLY,
  }, async ({ term, locale }) => answer(await client.lookup(term, { locale })));

  server.registerTool("search", {
    title: "Search Zero Parades",
    description: "The site's own search over records, skill checks and dialogue, 50 results a page, exact name matches first. A check has its difficulty and skill; a dialogue or check url ends in the card's #fragment. counts gives hits per kind; narrow with kind (check, dialogue, skill, item, character, task, thought, status-effect, achievement, persona, progression-unit, district, waypoint, interior-location, lore, game-over, guide, news, tool).",
    inputSchema: { query: z.string().min(2), kind: z.string().optional(), page: z.number().int().positive().optional(), locale },
    annotations: READ_ONLY,
  }, async ({ query, kind, page, locale }) => answer(await client.search(query, { kind: kind ?? null, page: page ?? 1, locale })));

  server.registerTool("get_record", {
    title: "Get a Zero Parades record",
    description: "One record by kind and id (ids come from lookup or search): every game field (costs, modifiers, conditions, loc keys), its page { url, name, description } in that language or null when it has no page there, and its preview card. found: false names the missing id.",
    inputSchema: { kind: z.enum(Object.keys(DATASETS)), id: z.string().min(1), locale },
    annotations: READ_ONLY,
  }, async ({ kind, id, locale }) => answer(await client.record(kind, id, { locale })));

  server.registerTool("planner_link", {
    title: "Build planner link",
    description: "The site's build planner prefilled with thoughts, each in a phase (reinforced, unconditioned, suppressed or dissonant), and a focus skill. Ids are checked first; found: false names any unknown id or phase.",
    inputSchema: {
      thoughts: z.array(z.object({ id: z.string().min(1), phase: z.enum(["reinforced", "unconditioned", "suppressed", "dissonant"]).optional() })).optional(),
      skill: z.string().min(1).optional(), locale,
    },
    annotations: READ_ONLY,
  }, async ({ thoughts, skill, locale }) => answer(await client.plannerLink({ thoughts: thoughts ?? [], skill: skill ?? null, locale })));

  return server;
}

const base = process.env.ZEROPARADES_BASE;
await createServer(createClient(base ? { base } : {})).connect(new StdioServerTransport());
