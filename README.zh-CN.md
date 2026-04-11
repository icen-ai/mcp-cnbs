# CNBS MCP 服务器

中国国家统计局 + 主要国际统计数据库的 MCP 服务器。全部对接真实 API，无任何模拟数据。

## 数据源

| 数据源 | 认证 | 覆盖范围 |
|--------|------|---------|
| **国家统计局 (NBS)** (data.stats.gov.cn) | 无需 | 国内月度/季度/年度/分省全量数据 |
| **世界银行** (api.worldbank.org) | 无需 | 200+ 国家，GDP/贸易/人口/FDI/基尼系数等 18 个指标 |
| **IMF DataMapper** | 无需 | WEO 预测：GDP增速/通胀/政府债务/经常账户等 14 个指标 |
| **OECD SDMX** | 无需 | 成员国季度GDP/就业/综合先行指标/贸易 |
| **BIS Statistics** | 无需 | 有效汇率/信贷缺口/住宅房价/债务偿还比率/跨境银行统计 |
| **FRED（美联储）** | `X-Fred-Api-Key` 请求头 | 美国利率/人民币汇率/原油/黄金/标普500/M2 |
| **NBS 普查数据** | 无需 | 人口普查（2020）/经济普查（2018）/农业普查（2016） |
| **NBS 部门统计** | 无需 | 财政/工业/商务/农业/货币金融/社保/房地产/能源 |

> **FRED API Key：** 在 https://fred.stlouisfed.org/docs/api/api_key.html 免费申请，然后在 MCP 客户端配置中通过 `X-Fred-Api-Key` 请求头传入（见下方配置示例）。stdio 模式下也支持 `FRED_API_KEY` 环境变量作为兜底。

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

### NPX 模式（本地运行）

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

带 FRED 支持（stdio 模式 — 环境变量兜底）：

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

> 这是阿里云 ModelScope 提供的免费公共演示，无需认证，但不含 FRED 功能。
> 建议正式使用时自行部署：[在魔搭免费部署](https://modelscope.cn/mcp/servers/thatcoder/cnbs)

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

---

## 端点说明

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | POST | Streamable HTTP — 初始化会话或发送请求 |
| `/` | GET | SSE 通知流（需携带 `Mcp-Session-Id` 请求头） |
| `/` | DELETE | 终止会话（需携带 `Mcp-Session-Id` 请求头） |
| `/sse` | GET | 旧版 SSE 模式 |
| `/message` | POST | 旧版 SSE 消息 |

---

## 工具列表

### 国家统计局核心查询

| 工具 | 功能 |
|------|------|
| `cnbs_search` | 关键词搜索，返回最新数据值 — **优先使用** |
| `cnbs_batch_search` | 批量搜索多个关键词 |
| `cnbs_fetch_nodes` | 获取分类树节点 |
| `cnbs_fetch_metrics` | 获取数据集指标列表 |
| `cnbs_fetch_series` | 获取历史时间序列（value 可能为空，最新值用 `cnbs_search`） |
| `cnbs_fetch_end_nodes` | 递归获取所有叶子节点 |
| `cnbs_compare` | 地区对比 / 时间对比 |

### NBS 辅助与同步

| 工具 | 功能 |
|------|------|
| `cnbs_get_regions` | 获取地区代码和名称 |
| `cnbs_get_categories` | 获取所有 NBS 分类代码 |
| `cnbs_sync_data` | 同步 NBS 分类数据 |
| `cnbs_get_sync_status` | 获取同步状态 |
| `cnbs_check_data_freshness` | 检查数据集新鲜度 |
| `cnbs_list_data_sources` | 列出所有可用数据源 |
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
| `ext_imf` | 查询 IMF WEO 指标，按国家和年份 |
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
| `ext_bis` | 查询 BIS 统计（汇率/信贷缺口/房价/跨境银行） |
| `ext_bis_datasets` | 列出 BIS 数据集及键模板 |

### FRED（美联储）

| 工具 | 功能 |
|------|------|
| `ext_fred` | 查询 FRED 系列（利率/汇率/大宗商品/美国宏观） |
| `ext_fred_series` | 列出所有预置 FRED 系列 |

### 国内扩展数据源

| 工具 | 功能 |
|------|------|
| `ext_cn_census` | 查询 NBS 普查数据（人口/经济/农业普查） |
| `ext_cn_department` | 按部门查询 NBS 统计指标 |
| `ext_cn_department_list` | 列出所有部门及指标关键词 |

### 跨源对比

| 工具 | 功能 |
|------|------|
| `ext_global_compare` | 同时从世界银行和 IMF 获取同一指标，快速多国对比 |

### 数据分析

| 工具 | 功能 |
|------|------|
| `cnbs_analyze_trend` | 趋势方向、变化量、斜率 |
| `cnbs_analyze_correlation` | 两组数据的皮尔逊相关系数 |
| `cnbs_detect_anomalies` | 异常值检测（标准差阈值法） |
| `cnbs_analyze_statistics` | 均值、中位数、标准差、极值 |
| `cnbs_analyze_time_series` | 趋势 + 季节性分解 |
| `cnbs_predict_data` | 线性外推预测未来值 |
| `cnbs_assess_data_quality` | 完整性、准确性、一致性评估 |
| `cnbs_generate_summary` | 数据数组摘要 |

### 数据转换

| 工具 | 功能 |
|------|------|
| `cnbs_normalize_data` | Min-Max 归一化到 [0, 1] |
| `cnbs_standardize_data` | Z-score 标准化 |
| `cnbs_moving_average` | 简单移动平均 |
| `cnbs_exponential_smoothing` | 指数平滑 |

### 可视化

| 工具 | 功能 |
|------|------|
| `cnbs_generate_chart` | 生成 ECharts / Chart.js / D3.js 图表配置 |

支持图表类型：`line`（折线）`bar`（柱状）`pie`（饼图）`scatter`（散点）`radar`（雷达）`heatmap`（热力图）`treemap`（树图）`gauge`（仪表盘）

### 格式化与工具

| 工具 | 功能 |
|------|------|
| `cnbs_get_guide` | 获取完整工具指南 |
| `cnbs_get_cache_stats` | 缓存命中统计 |
| `cnbs_format_number` | 数字格式化 |
| `cnbs_enhanced_format_number` | 增强格式化（固定小数/紧凑/百分比） |
| `cnbs_transform_unit` | 单位转换 |
| `cnbs_compute_stats` | 数组基本统计 |
| `cnbs_validate_data` | 数据清洗/验证 |

---

## 快速示例

### 国内数据查询

```
// 最新 GDP 值
cnbs_search(keyword="GDP")

// 最新 CPI
cnbs_search(keyword="CPI")

// 批量查询
cnbs_batch_search(keywords=["GDP", "CPI", "出生率", "城镇化率"])

// 地区对比
cnbs_compare(keyword="GDP", regions=["北京", "上海", "广东"], compareType="region")

// 历史时间序列（先搜索获取 cid/indic_id，再查 series）
cnbs_search(keyword="GDP")
cnbs_fetch_series(setId="...", metricIds=["..."], periods=["2015YY-2024YY"])
```

### 世界银行

```
// 中国 GDP 增速（2010年至今）
ext_world_bank(indicator="GDP_GROWTH", countries=["CHN"], startYear=2010)

// G7+中国 人均 GDP 对比
ext_world_bank(indicator="GDP_PER_CAPITA", countries=["CHN","USA","DEU","JPN","GBR","FRA","ITA","CAN"], startYear=2015)

// 中国多指标批量
ext_world_bank_multi(indicators=["GDP_GROWTH","CPI","UNEMPLOYMENT","FDI_INFLOWS"], countries=["CHN"], startYear=2010)

// 查看贸易相关指标
ext_world_bank_indicators(keyword="trade")
```

### IMF

```
// GDP 增速预测（含 2024/2025 年展望）
ext_imf(indicator="GDP_GROWTH", countries=["CHN","USA","JPN","DEU"], periods=["2022","2023","2024","2025"])

// 政府债务/GDP 对比
ext_imf(indicator="GOVT_DEBT", countries=["CHN","USA","JPN","DEU","ITA","GBR"])

// 查看所有 IMF 指标
ext_imf_all_indicators()
```

### BIS

```
// 中国实际有效汇率（近 3 年）
ext_bis(dataset="EER", country="CN", lastNObservations=36)

// 信贷缺口（系统性金融风险早期预警）
ext_bis(dataset="CREDIT_GAP", country="CN", lastNObservations=20)

// 住宅房价指数
ext_bis(dataset="PROPERTY_PRICES", country="CN", lastNObservations=20)

// 跨境银行统计（外部敞口）
ext_bis(dataset="CROSS_BORDER_BANKING", country="CN", lastNObservations=16)
```

### FRED（需在请求头携带 X-Fred-Api-Key）

```
// WTI 原油价格（最近 100 天）
ext_fred(series="OIL_PRICE_WTI", limit=100, sortOrder="desc")

// 人民币兑美元汇率（2020年至今）
ext_fred(series="CNY_USD", observationStart="2020-01-01")

// 美联储基准利率历史
ext_fred(series="FED_FUNDS", limit=60)

// 黄金价格
ext_fred(series="GOLD_PRICE", limit=60, sortOrder="desc")

// 美元指数
ext_fred(series="DOLLAR_INDEX", limit=60, sortOrder="desc")

// VIX 恐慌指数
ext_fred(series="VIX", limit=30, sortOrder="desc")
```

### 跨源联合对比

```
// 世界银行 + IMF 双源 GDP 增速对比（数据交叉验证）
ext_global_compare(
  wbIndicator="GDP_GROWTH",
  imfIndicator="GDP_GROWTH",
  countries=["CHN","USA","DEU","JPN","IND"],
  startYear=2015
)
```

### NBS 普查与部门

```
// 第七次全国人口普查数据
ext_cn_census(type="population")

// 经济普查
ext_cn_census(type="economic")

// 央行货币金融数据（M2、社会融资规模等）
ext_cn_department(department="monetary", indicator="M2货币供应量")

// 财政收支数据
ext_cn_department(department="finance", indicator="财政收入")

// 获取财政部所有指标
ext_cn_department(department="finance", fetchAll=true)

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

## 注意事项

1. **NBS 数据**：`cnbs_search` 的 `value` 字段有值；`cnbs_fetch_series` 的 `value` 可能为空（API 限制），最新值请用 `cnbs_search`
2. **FRED**：需在 MCP 客户端配置中设置 `X-Fred-Api-Key` 请求头（免费申请）；stdio 模式可用 `FRED_API_KEY` 环境变量作为兜底，否则调用报错
3. **BIS / OECD**：返回 SDMX-JSON 格式，解析后为 `{period, value, dimensions}` 数组
4. **全部数据源**均有本地 LRU 缓存，重复查询自动命中缓存，TTL 由各源独立配置

---

## 鉴权配置

默认无需鉴权。可通过 Bearer Token 启用：

### 本地 / HTTP 模式

```bash
# 命令行参数
npx mcp-cnbs --port 12345 --auth-token your-secret-token

# 环境变量
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

### 带鉴权的 MCP 客户端配置

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

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run build

# 运行
npm run start

# 开发模式（监听文件变化）
npm run dev
```

## 环境要求

- Node.js >= 18.0.0
- 网络可访问：`data.stats.gov.cn`、`api.worldbank.org`、`www.imf.org`、`sdmx.oecd.org`、`stats.bis.org`、`api.stlouisfed.org`

## 许可证

MIT
