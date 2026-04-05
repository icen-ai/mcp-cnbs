# CNBS MCP Server

MCP server for querying China National Bureau of Statistics data.

## Installation

### Use with npx (Recommended)

```bash
npx @icen.ai/mcp-cnbs
```

### Use with HTTP transport

```bash
npx @icen/mcp-cnbs --port 12345
```

### Install globally

```bash
npm install -g @icen/mcp-cnbs
mcp-cnbs
```

## MCP Client Configuration

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cnbs": {
      "command": "npx",
      "args": ["@icen/mcp-cnbs"]
    }
  }
}
```

### Cursor / Windsurf

```json
{
  "mcpServers": {
    "cnbs": {
      "command": "npx",
      "args": ["@icen/mcp-cnbs"]
    }
  }
}
```

### HTTP Mode (for remote access)

**Streamable HTTP (recommended):**
```json
{
  "mcpServers": {
    "cnbs": {
      "url": "http://cnbs.mcp.icen.ai"
    }
  }
}
```

**Legacy SSE (for older clients):**
```json
{
  "mcpServers": {
    "cnbs": {
      "url": "http://cnbs.mcp.icen.ai/sse"
    }
  }
}
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | POST | Streamable HTTP (recommended) |
| `/` | GET | SSE stream for notifications |
| `/sse` | GET | Legacy SSE mode |
| `/message` | POST | Legacy SSE messages |

## Tools

### Data Query

| Tool | Description |
|------|-------------|
| `cnbs_search` | Search by keyword, returns latest data value |
| `cnbs_fetch_nodes` | Get category tree nodes |
| `cnbs_fetch_metrics` | Get indicator list for a dataset |
| `cnbs_fetch_series` | Get time series data |
| `cnbs_fetch_end_nodes` | Recursively get all leaf nodes |
| `cnbs_batch_search` | Batch search multiple keywords |
| `cnbs_compare` | Compare data across regions or time periods |

### Reference Data

| Tool | Description |
|------|-------------|
| `cnbs_get_regions` | Get available region codes and names |
| `cnbs_get_categories` | Get all data category information |

### Utilities

| Tool | Description |
|------|-------------|
| `cnbs_get_guide` | Get usage guide |
| `cnbs_get_cache_stats` | Get cache statistics |
| `cnbs_format_number` | Format numbers |
| `cnbs_transform_unit` | Unit conversion |
| `cnbs_compute_stats` | Compute statistics |

## Quick Examples

```
// Search GDP
cnbs_search(keyword="GDP")

// Search birth rate
cnbs_search(keyword="出生率")

// Batch search
cnbs_batch_search(keywords=["GDP", "CPI", "人口"])

// Compare regions
cnbs_compare(keyword="GDP", regions=["北京", "上海"], compareType="region")

// Get region codes
cnbs_get_regions(keyword="广东")
```

## Notes

`cnbs_search` returns `value` field with data. `cnbs_fetch_series` may return empty `value` - this is an API limitation.

For latest values, use `cnbs_search`.

## Category Codes

| Code | Category |
|------|----------|
| 1 | Monthly |
| 2 | Quarterly |
| 3 | Yearly |
| 5 | Provincial Quarterly |
| 6 | Provincial Yearly |
| 7 | Other |
| 8 | Major Cities Yearly |
| 9 | Hong Kong/Macau/Taiwan Monthly |
| 10 | Hong Kong/Macau/Taiwan Yearly |

## Time Format

- Yearly: `2024YY`, range `["2020YY-2024YY"]`
- Quarterly: `2024A/B/C/D`, shortcuts `LAST6/LAST12/LAST18`
- Monthly: `202401MM`, range `["202301MM-202412MM"]`

## Region Codes

Region codes follow GB/T 2260 standard. Use `cnbs_get_regions` to get the full list.

Examples:
- Beijing: `110000000000`
- Shanghai: `310000000000`
- Guangdong: `440000000000`

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
npm run start

# Development mode with watch
npm run dev
```

## Authentication

By default, no authentication is required. You can enable authentication using Bearer token.

### Local / HTTP Mode

```bash
# Using command line argument
npx @icen/mcp-cnbs --port 12345 --auth-token your-secret-token

# Using environment variable
MCP_CNBS_AUTH_TOKEN=your-secret-token npx @icen/mcp-cnbs --port 12345
```

When authentication is enabled, requests must include:
```
Authorization: Bearer your-secret-token
```

### Cloudflare Workers

Set `MCP_CNBS_AUTH_TOKEN` in Cloudflare dashboard secrets:

```bash
# Deploy with secret
npx wrangler secret put MCP_CNBS_AUTH_TOKEN
# Enter your token when prompted

# Or use wrangler.toml
# (secrets cannot be set in wrangler.toml for security)
```

### MCP Client Configuration with Auth

```json
{
  "mcpServers": {
    "cnbs": {
      "command": "npx",
      "args": ["mcp-cnbs", "--port", "12345", "--auth-token", "your-secret-token"]
    }
  }
}
```

## Requirements

- Node.js >= 18.0.0
- Network access to `data.stats.gov.cn`

## License

MIT
