# CNBS MCP Server

MCP server for querying China National Bureau of Statistics (NBS) data and major international statistical databases. All data is fetched from real APIs — no mock data.

## Data Sources

| Source | Auth | Coverage |
|--------|------|----------|
| **China NBS** (data.stats.gov.cn) | None | Monthly / Quarterly / Yearly / Provincial domestic data |
| **World Bank** (api.worldbank.org) | None | 200+ countries — GDP, CPI, trade, population, FDI, Gini, etc. |
| **IMF DataMapper** | None | WEO forecasts — GDP growth, inflation, government debt, current account |
| **OECD SDMX** | None | Member-country quarterly GDP, employment, leading indicators |
| **BIS Statistics** | None | Effective exchange rates, credit gaps, property prices, cross-border banking |
| **FRED** (Federal Reserve) | `X-Fred-Api-Key` request header | US rates, CNY/USD, oil, gold, S&P 500, M2 |
| **NBS Census** | None | Population (2020), Economic (2018), Agriculture (2016) censuses |
| **NBS Departments** | None | Finance, Industry, Trade, Agriculture, PBoC monetary, Social Security, Housing, Energy |

> **FRED API Key:** Free registration at https://fred.stlouisfed.org/docs/api/api_key.html  
> Pass it as the `X-Fred-Api-Key` request header (HTTP mode) or set `FRED_API_KEY` env var (stdio mode).

---

## Installation

### npx (Recommended)

```bash
npx mcp-cnbs
```

### HTTP transport

```bash
npx mcp-cnbs --port 12345
```

### Install globally

```bash
npm install -g mcp-cnbs
mcp-cnbs
```

---

## MCP Client Configuration

### stdio mode (npx)

**Supported clients:** Claude Desktop, Cursor, Windsurf, Cherry Studio, Trae, Continue, and all MCP-compatible clients.

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

With FRED support:

```json
{
  "mcpServers": {
    "cnbs": {
      "command": "npx",
      "args": ["mcp-cnbs"],
      "env": {
        "FRED_API_KEY": "your_fred_api_key"
      }
    }
  }
}
```

### HTTP mode (remote)

**Supported clients:** Trae, Cherry Studio, and other clients with HTTP transport support.

**Free demo on ModelScope (no FRED):**
```json
{
  "mcpServers": {
    "cnbs": {
      "url": "https://mcp.api-inference.modelscope.net/c2ca6ece4e9946/mcp"
    }
  }
}
```

**HTTP mode with FRED:**
```json
{
  "mcpServers": {
    "cnbs": {
      "url": "https://your-cnbs-server/mcp",
      "headers": {
        "X-Fred-Api-Key": "your_fred_api_key"
      }
    }
  }
}
```

> Free public demo by Alibaba Cloud ModelScope. No auth required.  
> For production use, [deploy your own instance](https://modelscope.cn/mcp/servers/thatcoder/cnbs).

---

## HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` or `/mcp` | POST | Streamable HTTP — initialize session or send requests |
| `/` or `/mcp` | GET | SSE notification stream (requires `Mcp-Session-Id` header) |
| `/` or `/mcp` | DELETE | Terminate session (requires `Mcp-Session-Id` header) |
| `/sse` | GET | Legacy SSE mode |
| `/message` | POST | Legacy SSE messages |

---

## Tools

### NBS Core Query

| Tool | Description |
|------|-------------|
| `cnbs_search` | Search by keyword, returns latest value — **start here** |
| `cnbs_batch_search` | Batch search multiple keywords in one call |
| `cnbs_economic_snapshot` | One-shot snapshot of 10 key Chinese macro indicators (GDP, CPI, PPI, PMI, unemployment, industrial output, retail sales, fixed investment, trade, M2) |
| `cnbs_compare` | Compare data across regions or time periods |
| `cnbs_fetch_nodes` | Get category tree nodes — accepts one or multiple categories |
| `cnbs_fetch_metrics` | Get indicator list — accepts one or multiple `setIds` |
| `cnbs_fetch_series` | Get time series data |
| `cnbs_fetch_end_nodes` | Recursively get all leaf nodes |

### NBS Reference

| Tool | Description |
|------|-------------|
| `cnbs_get_guide` | Full tool guide (useful for LLMs to self-orient) |
| `cnbs_get_regions` | Region codes and names (GB/T 2260) |
| `cnbs_get_categories` | NBS category codes |
| `cnbs_list_data_sources` | All available data sources with tool mappings |
| `cnbs_fetch_data_from_source` | Fetch data from any named source |
| `cnbs_get_source_categories` | Categories for a given source |
| `cnbs_search_in_source` | Search within a specific source |

### World Bank

| Tool | Description |
|------|-------------|
| `ext_world_bank` | Query a single indicator across countries and years |
| `ext_world_bank_multi` | Query multiple indicators at once |
| `ext_world_bank_indicators` | List all supported World Bank indicators |

### IMF

| Tool | Description |
|------|-------------|
| `ext_imf` | Query IMF WEO data — accepts one or multiple indicators |
| `ext_imf_indicators` | List supported IMF indicators |
| `ext_imf_all_indicators` | Full IMF DataMapper indicator catalog |

### OECD

| Tool | Description |
|------|-------------|
| `ext_oecd` | Query OECD SDMX data by dataset and key |
| `ext_oecd_datasets` | List supported OECD datasets |

### BIS

| Tool | Description |
|------|-------------|
| `ext_bis` | Query BIS statistics — accepts one or multiple countries |
| `ext_bis_datasets` | List supported BIS datasets with key templates |

### FRED (Federal Reserve)

| Tool | Description |
|------|-------------|
| `ext_fred` | Query FRED series — accepts one or multiple series |
| `ext_fred_series` | List all supported FRED series |

### China Extended Sources

| Tool | Description |
|------|-------------|
| `ext_cn_census` | NBS census data (population, economic, agriculture) |
| `ext_cn_department` | NBS department statistics by ministry |
| `ext_cn_department_list` | All department categories and indicator keywords |

### Cross-Source Comparison

| Tool | Description |
|------|-------------|
| `ext_global_compare` | Simultaneously query World Bank + IMF for the same indicator across countries |

---

## Quick Examples

### China Economy At a Glance

```
// Full macro snapshot in one call
cnbs_economic_snapshot()

// Latest single indicator
cnbs_search(keyword="GDP")

// Batch indicators
cnbs_batch_search(keywords=["GDP", "CPI", "城镇化率", "出生率"])

// Regional comparison
cnbs_compare(keyword="GDP", regions=["北京", "上海", "广东"], compareType="region")

// Time series
cnbs_fetch_series(setId="...", metricIds=["..."], periods=["2015YY-2024YY"])
```

### International Comparison

```
// China GDP growth vs peers (World Bank)
ext_world_bank(indicator="GDP_GROWTH", countries=["CHN","USA","DEU","JPN","IND"], startYear=2015)

// Multiple indicators for China
ext_world_bank_multi(indicators=["GDP_GROWTH","CPI","UNEMPLOYMENT"], countries=["CHN"], startYear=2010)

// IMF: single indicator
ext_imf(indicators="GDP_GROWTH", countries=["CHN","USA","JPN"], periods=["2022","2023","2024","2025"])

// IMF: multiple indicators in one call
ext_imf(indicators=["GDP_GROWTH","CPI_INFLATION","GOVT_DEBT"], countries=["CHN","USA"], periods=["2020","2021","2022","2023","2024"])

// World Bank + IMF side-by-side
ext_global_compare(wbIndicator="GDP_GROWTH", imfIndicator="GDP_GROWTH", countries=["CHN","USA","DEU","JPN"])
```

### BIS & FRED

```
// BIS: single country
ext_bis(dataset="EER", countries="CN", lastNObservations=36)

// BIS: multiple countries in one call
ext_bis(dataset="EER", countries=["CN","US","DE","JP"], lastNObservations=24)

// BIS: credit gap
ext_bis(dataset="CREDIT_GAP", countries=["CN","US"], lastNObservations=20)

// FRED: single series
ext_fred(series="OIL_PRICE_WTI", limit=100, sortOrder="desc")

// FRED: multiple series in one call
ext_fred(series=["FED_FUNDS","CNY_USD","OIL_PRICE_WTI","GOLD_PRICE"], limit=30, sortOrder="desc")
```

### NBS Census & Departments

```
// 2020 Population census
ext_cn_census(type="population")

// PBoC M2 monetary data
ext_cn_department(department="monetary", indicator="M2货币供应量")

// All finance ministry indicators
ext_cn_department(department="finance", fetchAll=true)
```

---

## NBS Category Codes

| Code | Category | Typical Indicators |
|------|----------|--------------------|
| 1 | Monthly | CPI, PPI, Industrial Output, PMI |
| 2 | Quarterly | GDP quarterly growth |
| 3 | Annual | GDP, population, urbanization rate |
| 5 | Provincial Quarterly | Provincial GDP by quarter |
| 6 | Provincial Annual | Provincial GDP, population by year |
| 7 | Other / Surveys | Household surveys, special surveys |

## NBS Time Format

- Annual: `2024YY`, range `["2020YY-2024YY"]`
- Quarterly: `2024A/B/C/D` (A=Q1, B=Q2, C=Q3, D=Q4), shortcuts `LAST6/LAST12/LAST18`
- Monthly: `202401MM`, range `["202301MM-202412MM"]`

## NBS Region Codes

Follows GB/T 2260 standard. Use `cnbs_get_regions` for the full list.

| Region | Code |
|--------|------|
| National | `000000000000` |
| Beijing | `110000000000` |
| Shanghai | `310000000000` |
| Guangdong | `440000000000` |
| Zhejiang | `330000000000` |
| Jiangsu | `320000000000` |

---

## Authentication

No authentication required by default. Enable Bearer token auth:

### stdio / HTTP mode

```bash
npx mcp-cnbs --port 12345 --auth-token your-secret-token
# or via env var
MCP_CNBS_AUTH_TOKEN=your-secret-token npx mcp-cnbs --port 12345
```

Requests must then include:
```
Authorization: Bearer your-secret-token
```

### Cloudflare Workers

```bash
npx wrangler secret put MCP_CNBS_AUTH_TOKEN
```

---

## Development

```bash
npm install
npm run build
npm run start
```

## Requirements

- Node.js >= 18.0.0
- Network access to `data.stats.gov.cn`, `api.worldbank.org`, `www.imf.org`, `sdmx.oecd.org`, `stats.bis.org`, `api.stlouisfed.org`

## License

MIT
