# CNBS MCP Server

MCP server for querying China National Bureau of Statistics data.

## Installation

### Use with npx (Recommended)

```bash
npx mcp-cnbs
```

### Use with HTTP transport

```bash
npx mcp-cnbs --port 12345
```

### Install globally

```bash
npm install -g mcp-cnbs
mcp-cnbs
```

## MCP Client Configuration

### NPX Mode (Local)

**Supported clients:** Claude Desktop, Cursor, Windsurf, Cherry Studio, Trae, Continue, and other MCP clients.

Add to your MCP client configuration file:

```json
{
  "mcpServers": {
    "cnbs": {
      "command": "npx",
      "args": ["mcp-cnbs"]
    }
  }
}
```

### HTTP Mode (Remote Access)

**Supported clients:** Trae, Cherry Studio, and other MCP clients with HTTP transport support.

**Free Demo on ModelScope (recommended):**
```json
{
  "mcpServers": {
    "cnbs": {
      "url": "https://mcp.api-inference.modelscope.net/c2ca6ece4e9946/mcp"
    }
  }
}
```

> **Note:** This is a free public demo provided by Alibaba Cloud ModelScope. No authentication required.
>
> Since free services may change, we recommend deploying your own instance: [Deploy on ModelScope](https://modelscope.cn/mcp/servers/thatcoder/cnbs)

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
npx mcp-cnbs --port 12345 --auth-token your-secret-token

# Using environment variable
MCP_CNBS_AUTH_TOKEN=your-secret-token npx mcp-cnbs --port 12345
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
