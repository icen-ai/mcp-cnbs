# CNBS MCP 服务器

中国国家统计局 + 主要国际统计数据库的 MCP 服务器。全部对接真实 API，无任何模拟数据。

## 数据源

| 数据源 | 认证 | 覆盖范围 |
|--------|------|---------|
| **国家统计局 (NBS)** (data.stats.gov.cn) | 无需 | 国内月度/季度/年度/分省全量数据 |
| **世界银行** (api.worldbank.org) | 无需 | 200+ 国家，GDP/贸易/人口/FDI/基尼系数等 |
| **IMF DataMapper** | 无需 | WEO 预测：GDP增速/通胀/政府债务/经常账户等 |
| **OECD SDMX** | 无需 | 成员国季度GDP/就业/综合先行指标/贸易 |
| **BIS Statistics** | 无需 | 有效汇率/信贷缺口/住宅房价/跨境银行统计 |
| **FRED（美联储）** | `X-Fred-Api-Key` 请求头 | 美国利率/人民币汇率/原油/黄金/标普500/M2 |
| **NBS 普查数据** | 无需 | 人口普查（2020）/经济普查（2018）/农业普查（2016） |
| **NBS 部门统计** | 无需 | 财政/工业/商务/农业/货币金融/社保/房地产/能源 |

> **FRED API Key：** 在 https://fred.stlouisfed.org/docs/api/api_key.html 免费申请，通过 `X-Fred-Api-Key` 请求头传入（HTTP 模式），或设置 `FRED_API_KEY` 环境变量（stdio 模式）。

---

## 安装使用

### npx 直接运行（推荐）

```bash
npx mcp-cnbs
```

### HTTP 模式

```bash
npx mcp-cnbs --port 12345
```

### 全局安装

```bash
npm install -g mcp-cnbs
mcp-cnbs
```

---

## MCP 客户端配置

### stdio 模式（npx）

**支持的客户端：** Claude Desktop、Cursor、Windsurf、Cherry Studio、Trae、Continue 等所有支持 MCP 的客户端。

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

带 FRED 支持：

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

### HTTP 模式（远程访问）

**支持的客户端：** Trae、Cherry Studio 等支持 HTTP transport 的客户端。

**魔搭免费演示（不含 FRED）：**
```json
{
  "mcpServers": {
    "cnbs": {
      "url": "https://mcp.api-inference.modelscope.net/c2ca6ece4e9946/mcp"
    }
  }
}
```

**HTTP 模式含 FRED 支持** — 在请求头中携带 API Key：
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

> 这是阿里云 ModelScope 提供的免费公共演示，无需认证。  
> 正式使用建议自行部署：[在魔搭免费部署](https://modelscope.cn/mcp/servers/thatcoder/cnbs)

---

## 端点说明

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` 或 `/mcp` | POST | Streamable HTTP — 初始化会话或发送请求 |
| `/` 或 `/mcp` | GET | SSE 通知流（需携带 `Mcp-Session-Id` 请求头） |
| `/` 或 `/mcp` | DELETE | 终止会话（需携带 `Mcp-Session-Id` 请求头） |
| `/sse` | GET | 旧版 SSE 模式 |
| `/message` | POST | 旧版 SSE 消息 |

---

## 工具列表

### 国家统计局核心查询

| 工具 | 功能 |
|------|------|
| `cnbs_search` | 关键词搜索，返回最新数据值 — **优先使用** |
| `cnbs_batch_search` | 批量搜索多个关键词 |
| `cnbs_economic_snapshot` | 一次获取 10 项核心宏观指标最新值（GDP、CPI、PPI、PMI、失业率、工业增加值、社零、固投、进出口、M2） |
| `cnbs_compare` | 地区对比 / 时间对比 |
| `cnbs_fetch_nodes` | 获取分类树节点 — 支持同时传入多个分类代码 |
| `cnbs_fetch_metrics` | 获取数据集指标列表 — 支持同时传入多个 setId |
| `cnbs_fetch_series` | 获取历史时间序列 |
| `cnbs_fetch_end_nodes` | 递归获取所有叶子节点 |

### NBS 辅助

| 工具 | 功能 |
|------|------|
| `cnbs_get_guide` | 获取完整工具指南（适合 LLM 自我定向） |
| `cnbs_get_regions` | 获取地区代码和名称（GB/T 2260） |
| `cnbs_get_categories` | 获取所有 NBS 分类代码 |
| `cnbs_list_data_sources` | 列出所有可用数据源及工具映射 |
| `cnbs_fetch_data_from_source` | 从指定数据源获取数据 |
| `cnbs_get_source_categories` | 获取数据源分类信息 |
| `cnbs_search_in_source` | 在指定数据源中搜索 |

### 世界银行

| 工具 | 功能 |
|------|------|
| `ext_world_bank` | 查询单个指标，支持多国/多年 |
| `ext_world_bank_multi` | 同时查询多指标，跨国批量对比 |
| `ext_world_bank_indicators` | 列出所有预置世界银行指标 |

### IMF

| 工具 | 功能 |
|------|------|
| `ext_imf` | 查询 IMF WEO 数据 — 支持同时传入多个指标 |
| `ext_imf_indicators` | 列出预置 IMF 指标 |
| `ext_imf_all_indicators` | 获取 IMF DataMapper 完整指标目录 |

### OECD

| 工具 | 功能 |
|------|------|
| `ext_oecd` | 查询 OECD SDMX 数据 |
| `ext_oecd_datasets` | 列出预置 OECD 数据集 |

### BIS

| 工具 | 功能 |
|------|------|
| `ext_bis` | 查询 BIS 统计 — 支持同时传入多个国家 |
| `ext_bis_datasets` | 列出 BIS 数据集及键模板 |

### FRED（美联储）

| 工具 | 功能 |
|------|------|
| `ext_fred` | 查询 FRED 系列 — 支持同时传入多个系列 |
| `ext_fred_series` | 列出所有预置 FRED 系列 |

### 国内扩展数据源

| 工具 | 功能 |
|------|------|
| `ext_cn_census` | 查询 NBS 普查数据（人口/经济/农业普查） |
| `ext_cn_department` | 按部门查询 NBS 统计指标 |
| `ext_cn_department_list` | 列出所有部门分类及指标关键词 |

### 跨源对比

| 工具 | 功能 |
|------|------|
| `ext_global_compare` | 同时从世界银行和 IMF 获取同一指标，快速多国横向对比 |

---

## 快速示例

### 中国宏观经济速览

```
// 一次获取所有核心宏观指标
cnbs_economic_snapshot()

// 单个指标最新值
cnbs_search(keyword="GDP")

// 批量查询
cnbs_batch_search(keywords=["GDP", "CPI", "出生率", "城镇化率"])

// 地区对比
cnbs_compare(keyword="GDP", regions=["北京", "上海", "广东"], compareType="region")

// 历史时间序列（先搜索获取 cid/indic_id）
cnbs_search(keyword="GDP")
cnbs_fetch_series(setId="...", metricIds=["..."], periods=["2015YY-2024YY"])
```

### 国际数据

```
// G7+中国 GDP 增速对比
ext_world_bank(indicator="GDP_GROWTH", countries=["CHN","USA","DEU","JPN","GBR","FRA","ITA","CAN"], startYear=2015)

// 中国多指标批量查询
ext_world_bank_multi(indicators=["GDP_GROWTH","CPI","UNEMPLOYMENT","FDI_INFLOWS"], countries=["CHN"], startYear=2010)

// IMF 单指标
ext_imf(indicators="GDP_GROWTH", countries=["CHN","USA","JPN","DEU"], periods=["2022","2023","2024","2025"])

// IMF 多指标一次查询
ext_imf(indicators=["GDP_GROWTH","CPI_INFLATION","GOVT_DEBT"], countries=["CHN","USA"], periods=["2020","2021","2022","2023","2024"])

// 世界银行 + IMF 双源交叉验证
ext_global_compare(wbIndicator="GDP_GROWTH", imfIndicator="GDP_GROWTH", countries=["CHN","USA","DEU","JPN","IND"], startYear=2015)
```

### BIS & FRED

```
// BIS 单国
ext_bis(dataset="EER", countries="CN", lastNObservations=36)

// BIS 多国一次查询
ext_bis(dataset="EER", countries=["CN","US","DE","JP"], lastNObservations=24)

// 信贷缺口（系统性金融风险早期预警）
ext_bis(dataset="CREDIT_GAP", countries=["CN","US"], lastNObservations=20)

// FRED 单系列
ext_fred(series="OIL_PRICE_WTI", limit=100, sortOrder="desc")

// FRED 多系列一次查询
ext_fred(series=["FED_FUNDS","CNY_USD","OIL_PRICE_WTI","GOLD_PRICE"], limit=30, sortOrder="desc")

// 人民币兑美元汇率（2020年至今）
ext_fred(series="CNY_USD", observationStart="2020-01-01")
```

### NBS 普查与部门

```
// 第七次全国人口普查
ext_cn_census(type="population")

// 央行货币金融数据
ext_cn_department(department="monetary", indicator="M2货币供应量")

// 财政收支
ext_cn_department(department="finance", indicator="财政收入")

// 查看所有部门分类
ext_cn_department_list()
```

---

## NBS 分类代码

| 代码 | 分类 | 典型指标 |
|------|------|---------|
| 1 | 月度数据 | CPI、PPI、工业增加值、PMI |
| 2 | 季度数据 | GDP季度增速 |
| 3 | 年度数据 | GDP年度值、人口、城镇化率 |
| 5 | 分省季度 | 各省GDP季度值 |
| 6 | 分省年度 | 各省GDP、人口年度值 |
| 7 | 其他/调查 | 居民调查、专项调查 |

## NBS 时间格式

- 年度：`2024YY`，范围 `["2020YY-2024YY"]`
- 季度：`2024A/B/C/D`（A=Q1, B=Q2, C=Q3, D=Q4），快捷 `LAST6/LAST12/LAST18`
- 月度：`202401MM`，范围 `["202301MM-202412MM"]`

## NBS 地区代码

遵循 GB/T 2260 标准，使用 `cnbs_get_regions` 获取完整列表。

| 地区 | 代码 |
|------|------|
| 全国 | `000000000000` |
| 北京 | `110000000000` |
| 上海 | `310000000000` |
| 广东 | `440000000000` |
| 浙江 | `330000000000` |
| 江苏 | `320000000000` |

---

## 鉴权配置

默认无需鉴权。可通过 Bearer Token 启用：

### stdio / HTTP 模式

```bash
npx mcp-cnbs --port 12345 --auth-token your-secret-token
# 或环境变量
MCP_CNBS_AUTH_TOKEN=your-secret-token npx mcp-cnbs --port 12345
```

启用后请求需包含：
```
Authorization: Bearer your-secret-token
```

### Cloudflare Workers

```bash
npx wrangler secret put MCP_CNBS_AUTH_TOKEN
```

---

## 开发

```bash
npm install
npm run build
npm run start
```

## 环境要求

- Node.js >= 18.0.0
- 网络可访问：`data.stats.gov.cn`、`api.worldbank.org`、`www.imf.org`、`sdmx.oecd.org`、`stats.bis.org`、`api.stlouisfed.org`

## 许可证

MIT
