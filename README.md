# x-search-mcp

[![npm](https://img.shields.io/npm/v/@sensef/x-search-mcp)](https://www.npmjs.com/package/@sensef/x-search-mcp)

Real-time search over X (Twitter) for any MCP client. One tool, `x_search`, backed by xAI's
server-side [X Search](https://docs.x.ai/developers/tools/x-search).

```
> x_search({ query: "reactions to the Opus 5 launch", from_date: "2026-07-24" })

Claude Opus 5 is generating a lot of discussion on X. Official posts from @claudeai describe it
as "thoughtful and proactive"...[[1]](https://x.com/i/status/2080699495453528290)

**Sources:**
- https://x.com/i/status/2080699495453528290
- https://x.com/danshipper/status/2080700057892815114
```

## Requirements

- Node.js 20+
- An xAI API key from [console.x.ai](https://console.x.ai) (X Search is billed per token plus per
  tool invocation, see [pricing](https://docs.x.ai/developers/pricing#tools-pricing))

## Install

No install needed, `npx` fetches it on demand:

```bash
XAI_API_KEY=xai-... npx @sensef/x-search-mcp --smoke "what is xAI shipping today?"
```

## Client setup

### Droid

```bash
droid mcp add x-search --env XAI_API_KEY=xai-... -- npx -y @sensef/x-search-mcp
```

### Codex

```bash
codex mcp add x-search --env XAI_API_KEY=xai-... -- npx -y @sensef/x-search-mcp
```

### Claude Code

```bash
claude mcp add x-search --env XAI_API_KEY=xai-... -- npx -y @sensef/x-search-mcp
```

### Claude Desktop

No CLI, edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "x-search": {
      "command": "npx",
      "args": ["-y", "@sensef/x-search-mcp"],
      "env": { "XAI_API_KEY": "xai-..." }
    }
  }
}
```

## The `x_search` tool

| Argument | Type | Description |
| --- | --- | --- |
| `query` | string, required | Natural language question about X content |
| `allowed_handles` | string[] | Only search these handles (max 20) |
| `excluded_handles` | string[] | Ignore these handles (max 20) |
| `from_date` | `YYYY-MM-DD` | Inclusive start of the date range |
| `to_date` | `YYYY-MM-DD` | Inclusive end of the date range |
| `understand_media` | boolean | Also analyze images and videos in posts |
| `inline_citations` | boolean | Embed `[[1]](url)` markers, default true |
| `model` | string | Override the Grok model for this call |

`allowed_handles` and `excluded_handles` are mutually exclusive. A leading `@` is accepted and
stripped. The result is markdown: the answer, then a `**Sources:**` list of every cited post.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `XAI_API_KEY` | required | xAI API key |
| `XAI_MODEL` | `grok-4.5` | Grok model driving the search |
| `XAI_BASE_URL` | `https://api.x.ai/v1` | Override for gateways and proxies |
| `X_SEARCH_TIMEOUT_MS` | `180000` | Agentic search is slow; raise for broad queries |
| `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` | unset | Honored automatically, unlike Node's bare `fetch` |

## Development

```bash
npm install
npm run build
npm run typecheck
node dist/index.js --smoke "what are people saying about MCP?"
```

## License

MIT
