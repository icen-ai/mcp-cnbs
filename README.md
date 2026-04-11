# CNBS MCP Server

MCP server for querying China National Bureau of Statistics (NBS) data and major international statistical databases. All data is fetched from real APIs — no mock data.

## Data Sources

| Source | Auth | Coverage |
|--------|------|----------|
| **China NBS** (data.stats.gov.cn) | None | Monthly/Quarterly/Yearly/Provincial domestic data |
| **World Bank** (api.worldbank.org) | None | 200+ countries — GDP, CPI, trade, population, FDI, Gini, etc. |
| **IMF DataMapper** | None | WEO forecasts — GDP growth, inflation, government debt, current account |
| **OECD SDMX** | None | Member-country quarterly GDP, employment, leading indicators |
| **BIS Statistics** | None | Effective exchange rates, credit gaps, property prices, cross-border banking |
| **FRED** (Federal Reserve) | `X-Fred-Api-Key` request header | US rates, CNY/USD, oil, gold, S&P 500, M2 |
| **NBS Census** | None | Population (2020), Economic (2018), Agriculture (2016) censuses |
| **NBS Departments** | None | Finance, Industry, Trade, Agriculture, PBoC monetary, Social Security, Housing, Energy |

> **FRED API Key:** Free registration at https://fred.stlouisfed.org/docs/api/api_key.html
> Add it to your MCP client config as the `X-Fred-Api-Key` request header (see configuration examples below).
> For stdio mode, `FRED_API_KEY` environment variable is supported as a fallback.

---

## Installation

### Use with npx (Recommended)

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

### NPX mode (local)

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

With FRED support (stdio mode — env var fallback):

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

### HTTP mode (remote access)

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

**HTTP mode with FRED support** — pass your key as a request header:
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
| `/` | POST | Streamable HTTP — initialize session or send requests |
| `/` | GET | SSE notification stream (requires `Mcp-Session-Id` header) |
| `/` | DELETE | Terminate session (requires `Mcp-Session-Id` header) |
| `/sse` | GET | Legacy SSE mode |
| `/message` | POST | Legacy SSE messages |

---

## Tools

### NBS Core Query

| Tool | Description |
|------|-------------|
| `cnbs_search` | Search by keyword, returns latest value — **use this first** |
| `cnbs_batch_search` | Batch search multiple keywords at once |
| `cnbs_fetch_nodes` | Get category tree nodes |
| `cnbs_fetch_metrics` | Get indicator list for a dataset |
| `cnbs_fetch_series` | Get time series data (value may be empty — use `cnbs_search` for latest) |
| `cnbs_fetch_end_nodes` | Recursively get all leaf nodes |
| `cnbs_compare` | Compare data across regions or time periods |

### NBS Reference & Sync

| Tool | Description |
|------|-------------|
| `cnbs_get_regions` | Get region codes and names |
| `cnbs_get_categories` | Get all NBS category codes |
| `cnbs_sync_data` | Sync data from NBS API |
| `cnbs_get_sync_status` | Get sync status |
| `cnbs_check_data_freshness` | Check data freshness for a dataset |
| `cnbs_list_data_sources` | List all available data sources |
| `cnbs_fetch_data_from_source` | Fetch data from any named source |
| `cnbs_get_source_categories` | Get categories for a source |
| `cnbs_search_in_source` | Search within a specific source |

### World Bank

| Tool | Description |
|------|-------------|
| `ext_world_bank` | Query a single indicator across countries and years |
| `ext_world_bank_multi` | Query multiple indicators at once for cross-country comparison |
| `ext_world_bank_indicators` | List all supported World Bank indicators |

### IMF

| Tool | Description |
|------|-------------|
| `ext_imf` | Query IMF WEO indicator data by country and period |
| `ext_imf_indicators` | List supported IMF indicators |
| `ext_imf_all_indicators` | Fetch the full IMF DataMapper indicator catalog |

### OECD

| Tool | Description |
|------|-------------|
| `ext_oecd` | Query OECD SDMX data by dataset and key |
| `ext_oecd_datasets` | List supported OECD datasets |

### BIS

| Tool | Description |
|------|-------------|
| `ext_bis` | Query BIS statistics (exchange rates, credit gaps, property prices, etc.) |
| `ext_bis_datasets` | List supported BIS datasets with key templates |

### FRED (Federal Reserve)

| Tool | Description |
|------|-------------|
| `ext_fred` | Query FRED series (rates, FX, commodities, US macro) |
| `ext_fred_series` | List all supported FRED series |

### China Extended Sources

| Tool | Description |
|------|-------------|
| `ext_cn_census` | Query NBS census data (population, economic, agriculture) |
| `ext_cn_department` | Query NBS department statistics by ministry |
| `ext_cn_department_list` | List all department categories and their indicator keywords |

### Cross-Source Comparison

| Tool | Description |
|------|-------------|
| `ext_global_compare` | Simultaneously query World Bank + IMF for the same indicator across countries |

### Data Analysis

| Tool | Description |
|------|-------------|
| `cnbs_analyze_trend` | Trend direction, change amount, slope |
| `cnbs_analyze_correlation` | Pearson correlation between two series |
| `cnbs_detect_anomalies` | Outlier detection (std-dev threshold) |
| `cnbs_analyze_statistics` | Mean, median, std dev, min, max |
| `cnbs_analyze_time_series` | Trend + seasonality decomposition |
| `cnbs_predict_data` | Linear extrapolation for future values |
| `cnbs_assess_data_quality` | Completeness, accuracy, consistency |
| `cnbs_generate_summary` | Summary of a data array |

### Data Transformation

| Tool | Description |
|------|-------------|
| `cnbs_normalize_data` | Min-max normalization to [0, 1] |
| `cnbs_standardize_data` | Z-score standardization |
| `cnbs_moving_average` | Simple moving average |
| `cnbs_exponential_smoothing` | Exponential smoothing |

### Visualization

| Tool | Description |
|------|-------------|
| `cnbs_generate_chart` | Generate ECharts/Chart.js/D3.js chart config |

Supported chart types: `line` `bar` `pie` `scatter` `radar` `heatmap` `treemap` `gauge`

### Utilities

| Tool | Description |
|------|-------------|
| `cnbs_get_guide` | Get the full tool guide (useful for LLMs) |
| `cnbs_get_cache_stats` | Cache hit/miss statistics |
| `cnbs_format_number` | Format a number with precision |
| `cnbs_enhanced_format_number` | Format as fixed / compact / percent |
| `cnbs_transform_unit` | Unit conversion |
| `cnbs_compute_stats` | Basic statistics for an array |
| `cnbs_validate_data` | Clean/validate a data value |

---

## Quick Examples

### NBS Domestic Data

```
// Latest GDP value
cnbs_search(keyword="GDP")

// Latest CPI
cnbs_search(keyword="CPI")

// Batch search
cnbs_batch_search(keywords=["GDP", "CPI", "出生率", "城镇化率"])

// Regional comparison
cnbs_compare(keyword="GDP", regions=["北京", "上海", "广东"], compareType="region")

// Time series
cnbs_search(keyword="GDP")  // get cid + indic_id first
cnbs_fetch_series(setId="...", metricIds=["..."], periods=["2015YY-2024YY"])
```

### World Bank

```
// China GDP growth
ext_world_bank(indicator="GDP_GROWTH", countries=["CHN"], startYear=2010)

// Multi-country GDP per capita comparison
ext_world_bank(indicator="GDP_PER_CAPITA", countries=["CHN","USA","DEU","JPN","IND"], startYear=2015)

// Multiple indicators for China
ext_world_bank_multi(indicators=["GDP_GROWTH","CPI","UNEMPLOYMENT"], countries=["CHN"], startYear=2010)

// Available indicators
ext_world_bank_indicators(keyword="trade")
```

### IMF

```
// GDP growth forecast (includes projections)
ext_imf(indicator="GDP_GROWTH", countries=["CHN","USA","JPN"], periods=["2022","2023","2024","2025"])

// Government debt comparison
ext_imf(indicator="GOVT_DEBT", countries=["CHN","USA","JPN","DEU","ITA"])

// Full indicator catalog
ext_imf_all_indicators()
```

### BIS

```
// China real effective exchange rate (last 3 years)
ext_bis(dataset="EER", country="CN", lastNObservations=36)

// Credit-to-GDP gap (systemic risk indicator)
ext_bis(dataset="CREDIT_GAP", country="CN", lastNObservations=20)

// Residential property prices
ext_bis(dataset="PROPERTY_PRICES", country="CN", lastNObservations=20)
```

### FRED

```
// WTI oil price (last 100 days)
ext_fred(series="OIL_PRICE_WTI", limit=100, sortOrder="desc")

// CNY/USD exchange rate since 2020
ext_fred(series="CNY_USD", observationStart="2020-01-01")

// Federal funds rate history
ext_fred(series="FED_FUNDS", limit=60)

// 10Y - 2Y yield spread (recession indicator)
ext_fred(series="US_10Y_YIELD", limit=60)
ext_fred(series="US_2Y_YIELD", limit=60)
```

### Cross-Source Comparison

```
// Compare World Bank + IMF GDP growth for G4
ext_global_compare(
  wbIndicator="GDP_GROWTH",
  imfIndicator="GDP_GROWTH",
  countries=["CHN","USA","DEU","JPN"],
  startYear=2015
)
```

### NBS Census & Department

```
// 2020 Population census data
ext_cn_census(type="population")

// PBoC monetary data (M2, credit)
ext_cn_department(department="monetary", indicator="M2货币供应量")

// All finance ministry indicators
ext_cn_department(department="finance", fetchAll=true)

// List all department categories
ext_cn_department_list()
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

No authentication is required by default. Enable Bearer token auth:

### Local / HTTP mode

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

### MCP client with auth

```json
{
  "mcpServers": {
    "cnbs": {
      "command": "npx",
      "args": ["mcp-cnbs", "--auth-token", "your-secret-token"],
      "env": {
        "FRED_API_KEY": "your_fred_api_key"
      },
      "headers": {
        "X-Fred-Api-Key": "your_fred_api_key"
      }
    }
  }
}
```

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
npm run start

# Development mode (watch)
npm run dev
```

## Requirements

- Node.js >= 18.0.0
- Network access to `data.stats.gov.cn`, `api.worldbank.org`, `www.imf.org`, `sdmx.oecd.org`, `stats.bis.org`, `api.stlouisfed.org`

## License

MIT
