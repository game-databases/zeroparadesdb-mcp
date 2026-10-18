# zeroparadesdb-mcp

Read ZERO PARADES: For Dead Spies records from [zeroparadesdb.com](https://zeroparadesdb.com) over MCP stdio. Requires Node.js 22 or later. Public requests need neither an account nor a key.

## Tools

| Tool | Inputs and answer |
| --- | --- |
| `lookup` | A `term` returns the best matching records with canonical page slugs, URLs and preview facts. |
| `search` | A `query`, optional `kind`, `page` and `locale` use the site's search over records, checks and dialogue. Results contain stable ids, names and canonical page slugs/URLs. |
| `get_record` | A `kind` and stable `id` from search return actual game fields, a localized page projection and preview facts. |
| `list_entities` | A `kind`, optional `page` and `locale` browse published page projections, 50 per page. Continue with `nextPage` until it is null. |
| `planner_link` | Validated thought ids/phases and an optional focus skill produce a prefilled planner URL without saving a build. |

`locale` is optional and defaults to `en`. Other values are `es-419`, `de`, `ru` and `zh-cn`. `get_record` and `list_entities` use these kinds:

```text
skill, item, character, task, thought, status-effect, achievement,
persona, progression-unit, district, waypoint, location,
interior-location, lore
```

Search also covers checks and dialogue, as well as editorial and tool pages. It returns 50 results per page; use its `pages` value to continue with `page`. A query with no match returns empty results. An invalid page, unknown record or failed HTTP request returns an MCP tool error with readable text. Every successful result is present in MCP text content.

## Read record values

Use stable `id` for lookup, not the page slug. Cold Read is id `affect`, while its English page slug is `cold-read`. In German the same record has the page name Cold Reading and slug `cold-reading`.

Raw `fields` can contain English names and internal enum labels even on a localized request. Use `page.name`, `page.description` and `card` for localized wording. A null `page` means that the API publishes no page for that record in that language; the server preserves the null rather than inventing a translation or link.

Keep modifier types and their affected fields separate. An item's list `cost` does not establish the paid price in a dialogue transaction, and a co-occurring character is not necessarily a vendor. The server reports only what the public API exposes.

```json
{"name":"search","arguments":{"query":"Cold Read","kind":"skill"}}
```

```json
{"name":"get_record","arguments":{"kind":"skill","id":"affect","locale":"de"}}
```

## Run

From this directory:

```sh
npm install
node src/server.mjs
```

After npm publication, configure an MCP client with:

```json
{
  "mcpServers": {
    "zeroparadesdb": {
      "command": "npx",
      "args": ["-y", "zeroparadesdb-mcp"]
    }
  }
}
```

Before publication, use `node` with an absolute path to `src/server.mjs`, or install a local package tarball and use its `zeroparadesdb-mcp` executable. There is no compilation step.

Set `ZEROPARADES_BASE` only to test another HTTP origin. Returned page links retain the production origin. Ordinary clients leave it unset.

## License

MIT. See [LICENSE](LICENSE).
