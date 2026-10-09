# zeroparadesdb-mcp

MCP server for ZERO PARADES: For Dead Spies. It answers from https://zeroparadesdb.com in English, Latin American Spanish, German, Russian and Simplified Chinese, and every answer carries the page link of its record.

## Tools

| Tool | Answer |
|---|---|
| `lookup` | The skills, thoughts, items, characters, tasks, status effects, achievements, personas, districts, waypoints, interiors or glossary terms a name matches, each with its page and the site's preview card |
| `search` | The site's search over records, skill checks (with difficulty) and dialogue, 50 results a page |
| `get_record` | Every game field of one record, its page in the chosen language and its preview card |
| `planner_link` | The site's build planner with chosen thoughts, each in a phase, and a focus skill |

An unknown id or term answers `found: false` with the reason.

## Install

From this directory:

```sh
npm install
node src/server.mjs
```

Once published on npm:

```sh
npx -y zeroparadesdb-mcp
```

Client configuration:

```json
{ "mcpServers": { "zeroparadesdb": { "command": "npx", "args": ["-y", "zeroparadesdb-mcp"] } } }
```

`ZEROPARADES_BASE` points the server at another copy of the site.
