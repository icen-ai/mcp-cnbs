import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CnbsModernClient } from '../services/api.js';
import { CnbsCategory } from '../types/index.js';
import { CnbsDataHelper, DataQualityAssessor } from '../services/data.js';
import { CNBS_REGIONS, CNBS_CATEGORY_INFO, searchRegions, getRegionByCode, getRegionByName } from '../constants/index.js';
import {
  dataSourceManager,
  worldBankSource,
  imfSource,
  oecdSource,
  bisSource,
  censusSource,
  departmentSource,
  createFREDSource,
  WorldBankDataSource,
  IMFDataSource,
  OECDDataSource,
  BISDataSource,
  FREDDataSource,
  CensusDataSource,
  DepartmentDataSource,
} from '../services/data-sources.js';
import type { CnbsServerConfig } from '../server.js';
import { dataVisualizationService, dataAnalysisService, dataTransformationService, ChartType } from '../services/visualization.js';
import { CnbsErrorHandler } from '../services/error.js';
import { z } from 'zod';

const cnbsModernClient = new CnbsModernClient();

const LLMS_TXT_CONTENT = `# mcp_cnbs — 中国国家统计局 + 国际多源统计数据 MCP 服务器

## 数据源概览

本服务器同时对接以下真实数据源，全部返回实时 API 数据，无任何模拟数据：

| 数据源 | 工具前缀 | 认证 | 覆盖范围 |
|--------|---------|------|---------|
| 国家统计局 (NBS) | cnbs_* | 无需 | 国内月度/季度/年度/分省数据 |
| 世界银行 (World Bank) | ext_world_bank* | 无需 | 200+ 国家，GDP/贸易/人口/FDI等 |
| IMF DataMapper | ext_imf* | 无需 | WEO预测，经常账户/政府债务等 |
| OECD SDMX | ext_oecd* | 无需 | 成员国季度GDP/就业/先行指标 |
| BIS Statistics | ext_bis* | 无需 | 有效汇率/信贷缺口/房价/跨境银行 |
| FRED (美联储) | ext_fred* | X-Fred-Api-Key 请求头 | 美国利率/汇率/大宗商品/股市 |
| NBS 普查数据 | ext_cn_census | 无需 | 人口/经济/农业普查 |
| NBS 部门统计 | ext_cn_department* | 无需 | 财政/工业/商务/农业/货币/能源等 |

---

## 核心原则（必读）

⚠️ NBS 数据：优先用 cnbs_search 获取最新值
- cnbs_search 返回的 value 字段有数据
- cnbs_fetch_series 的 value 字段可能为空（API 限制）

⚠️ 国际数据：直接调用对应 ext_* 工具
- 所有国际数据均对接真实 API，返回实时数据
- FRED 需在请求头携带 X-Fred-Api-Key（免费申请），stdio 模式兜底读 FRED_API_KEY 环境变量

---

## 推荐工作流程

场景一：国内最新单指标值（最常见）
→ cnbs_search(keyword="GDP") → value 字段即为最新值

场景二：国内历史时间序列
→ cnbs_search(keyword="GDP") → 获取 cid 和 indic_id
→ cnbs_fetch_series(setId, metricIds, periods) → 历史数据

场景三：国内多指标批量
→ cnbs_batch_search(keywords=["GDP","CPI","人口","出生率"])

场景四：国内地区/时间横向对比
→ cnbs_compare(keyword="GDP", regions=["北京","上海","广东"], compareType="region")

场景五：国际单指标多国对比（世界银行）
→ ext_world_bank(indicator="GDP_GROWTH", countries=["CHN","USA","DEU","JPN"], startYear=2015)

场景六：IMF WEO 预测数据
→ ext_imf(indicator="GDP_GROWTH", countries=["CHN","USA"], periods=["2023","2024","2025"])

场景七：中美两国 GDP 增速对比（双源交叉验证）
→ ext_global_compare(wbIndicator="GDP_GROWTH", imfIndicator="GDP_GROWTH", countries=["CHN","USA"])

场景八：BIS 信贷缺口/汇率风险
→ ext_bis(dataset="CREDIT_GAP", country="CN", lastNObservations=20)
→ ext_bis(dataset="EER", country="CN", lastNObservations=24)

场景九：大宗商品/利率/汇率实时数据
→ ext_fred(series="OIL_PRICE_WTI", limit=30)
→ ext_fred(series="CNY_USD", limit=60, sortOrder="desc")
→ ext_fred(series="FED_FUNDS", limit=60)

场景十：NBS 普查/部门数据
→ ext_cn_census(type="population")
→ ext_cn_department(department="monetary", indicator="M2货币供应量")

---

## 国家统计局 (NBS) — 分类代码

| 代码 | 分类 | 典型指标 |
|------|------|---------|
| 1 | 月度数据 | CPI、PPI、工业增加值、PMI |
| 2 | 季度数据 | GDP季度增速 |
| 3 | 年度数据 | GDP年度值、人口、城镇化率 |
| 5 | 分省季度 | 各省GDP季度值 |
| 6 | 分省年度 | 各省GDP、人口年度值 |
| 7 | 其他/调查 | 居民调查、专项调查 |

## NBS 时间格式

年度：2024YY，范围 ["2020YY-2024YY"]
季度：2024A/B/C/D (A=Q1, B=Q2, C=Q3, D=Q4)，快捷 LAST6/LAST12/LAST18
月度：202401MM，范围 ["202301MM-202412MM"]

## NBS 地区代码（常用）

全国：000000000000 | 北京：110000000000 | 上海：310000000000
广东：440000000000 | 浙江：330000000000 | 江苏：320000000000
→ 完整列表：cnbs_get_regions()

---

## 世界银行指标速查

GDP | GDP_GROWTH | GDP_PER_CAPITA | CPI | UNEMPLOYMENT | POPULATION
EXPORTS | IMPORTS | FDI_INFLOWS | GOVT_DEBT | GROSS_SAVINGS
TRADE_PCT_GDP | GINI | LIFE_EXPECTANCY | CO2_EMISSIONS
INTERNET_USERS | INFLATION | CURRENT_ACCOUNT
→ 完整列表：ext_world_bank_indicators()

## IMF 指标速查

GDP_GROWTH | GDP_USD | GDP_PER_CAPITA | CPI_INFLATION | UNEMPLOYMENT
CURRENT_ACCOUNT | GOVT_DEBT | GOVT_BALANCE | GROSS_SAVINGS
INVESTMENT | TRADE_BALANCE | POPULATION | OUTPUT_GAP
→ 完整列表：ext_imf_indicators()

## OECD 数据集

QNA_GDP（季度GDP） | KEI_CPI（综合先行指标） | EMPLOYMENT（就业）| TRADE（贸易）
→ 完整列表：ext_oecd_datasets()

## BIS 数据集

EER（有效汇率） | CREDIT_GAP（信贷缺口） | TOTAL_CREDIT（总信贷）
PROPERTY_PRICES（房价） | DEBT_SERVICE（债务偿还）| CROSS_BORDER_BANKING（跨境银行）
→ 完整列表：ext_bis_datasets()

## FRED 系列速查

US_GDP | US_GDP_GROWTH | FED_FUNDS | US_10Y_YIELD | US_2Y_YIELD
CNY_USD | EUR_USD | US_UNEMPLOYMENT | US_CPI | OIL_PRICE_WTI
GOLD_PRICE | US_M2 | SP500 | VIX | DOLLAR_INDEX | US_TRADE_BALANCE
→ 完整列表：ext_fred_series()

## 部门统计速查

finance（财政） | industry（工业） | trade（商务） | agriculture（农业）
monetary（货币金融/央行）| social_security（社保） | housing（房地产） | energy（能源）
→ 完整列表：ext_cn_department_list()

---

## 全量工具速查

### NBS 核心查询
cnbs_search(keyword)                           // 搜索+最新值（推荐首选）
cnbs_batch_search(keywords)                    // 批量搜索
cnbs_fetch_nodes(category, parentId)           // 分类树
cnbs_fetch_metrics(setId)                      // 指标列表
cnbs_fetch_series(setId, metricIds, periods)   // 时间序列
cnbs_fetch_end_nodes(category)                 // 递归叶子节点
cnbs_compare(keyword, regions/years)           // 横向对比

### NBS 辅助
cnbs_get_regions(keyword)          // 地区代码
cnbs_get_categories()              // 分类代码
cnbs_sync_data(categories)         // 数据同步
cnbs_get_sync_status()             // 同步状态
cnbs_check_data_freshness(setId)   // 数据新鲜度
cnbs_list_data_sources()           // 所有数据源列表

### 国际数据
ext_world_bank(indicator, countries, startYear, endYear)
ext_world_bank_multi(indicators, countries, startYear)
ext_world_bank_indicators(keyword)
ext_imf(indicator, countries, periods)
ext_imf_indicators(keyword)
ext_imf_all_indicators()
ext_oecd(dataset, key, startPeriod, lastNObservations)
ext_oecd_datasets(keyword)
ext_bis(dataset, country, lastNObservations, startPeriod)
ext_bis_datasets(keyword)
ext_fred(series, limit, sortOrder, observationStart)
ext_fred_series(keyword)
ext_global_compare(wbIndicator, imfIndicator, countries, startYear)

### 国内扩展数据
ext_cn_census(type, keyword, pageSize)
ext_cn_department(department, indicator, pageSize, fetchAll)
ext_cn_department_list()

### 数据分析
cnbs_analyze_trend(values)
cnbs_analyze_correlation(data1, data2)
cnbs_detect_anomalies(values, threshold)
cnbs_analyze_statistics(values)
cnbs_analyze_time_series(values, period)
cnbs_predict_data(values, futureSteps)
cnbs_assess_data_quality(data)
cnbs_generate_summary(data)

### 数据转换
cnbs_normalize_data(values)
cnbs_standardize_data(values)
cnbs_moving_average(values, window)
cnbs_exponential_smoothing(values, alpha)

### 可视化
cnbs_generate_chart(type, data, options)   // 生成 ECharts/Chart.js 配置

### 格式化/工具
cnbs_format_number(value, precision)
cnbs_enhanced_format_number(value, precision, format)
cnbs_transform_unit(value, sourceUnit, targetUnit)
cnbs_compute_stats(values)
cnbs_validate_data(value)
cnbs_get_cache_stats()
cnbs_get_guide()

---

## 重要提示

1. NBS cnbs_fetch_series 的 value 可能为空 → 优先用 cnbs_search 获取最新值
2. 搜索结果字段：cid = setId，indic_id = metricId，isLeaf=true 节点才可查数据
3. FRED 数据需在 MCP 客户端配置中设置 X-Fred-Api-Key 请求头（免费申请）；stdio 模式可改用 FRED_API_KEY 环境变量
4. BIS/OECD 使用 SDMX-JSON 格式，返回 {period, value, dimensions} 数组
5. 世界银行和 IMF 返回标准化对象，直接读 data 数组即可
6. 所有数据源均有本地 LRU 缓存，重复查询自动命中缓存`;

function createToolErrorResult(tool: string, error: unknown) {
  const { message, details } = CnbsErrorHandler.toToolErrorData(error, tool);

  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
    structuredContent: {
      error: {
        tool,
        ...details,
      },
    },
  };
}

function createLegacyToolError(message: string) {
  const error = new Error(message);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('missing ') ||
    normalizedMessage.includes('invalid ') ||
    normalizedMessage.includes('required ') ||
    normalizedMessage.includes('must be ')
  ) {
    error.name = 'ValidationError';
  }

  return error;
}

function normalizeToolResult(tool: string, result: any) {
  const text = result?.content?.[0]?.text;
  const isLegacyPlainError =
    !result?.isError &&
    Array.isArray(result?.content) &&
    result.content.length === 1 &&
    result.content[0]?.type === 'text' &&
    typeof text === 'string' &&
    text.startsWith('Error: ');

  if (!isLegacyPlainError) {
    return result;
  }

  return createToolErrorResult(tool, createLegacyToolError(text.replace(/^Error:\s*/, '')));
}

export function registerCnbsTools(server: McpServer, config?: CnbsServerConfig) {
  // 按会话实例化 FRED 数据源（携带请求头中的 API Key）
  const fredSource = createFREDSource(config?.fredApiKey);
  const seenToolNames = new Set<string>();
  const originalRegisterTool = server.registerTool.bind(server);

  server.registerTool = ((name: string, config: any, handler: any) => {
    if (seenToolNames.has(name)) {
      console.warn(`Skipping duplicate MCP tool registration for ${name}`);
      return;
    }

    seenToolNames.add(name);
    return originalRegisterTool(name, config, async (...args: any[]) => {
      try {
        const result = await handler(...args);
        return normalizeToolResult(name, result);
      } catch (error) {
        return createToolErrorResult(name, error);
      }
    });
  }) as typeof server.registerTool;

  server.registerTool(
    'cnbs_get_guide',
    {
      title: 'Get CNBS MCP Guide',
      description: '获取本 MCP 服务器的使用指南，包括工具列表、使用建议和重要提示。建议首次使用时调用此工具了解如何正确使用其他工具。',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      return {
        content: [{ type: 'text', text: LLMS_TXT_CONTENT }],
        structuredContent: { guide: LLMS_TXT_CONTENT },
      };
    }
  );

  server.registerTool(
    'cnbs_search',
    {
      title: 'Search CNBS Data',
      description: `通过关键词搜索中国国家统计局指标和数据（推荐优先使用）。返回匹配的数据集列表，包含 setId、名称、时间范围等信息。
      
Args:
  - keyword (string): 搜索关键词，如 "GDP"、"CPI"、"人口"
  - pageNum (number): 页码，默认1
  - pageSize (number): 每页数量，默认10
  - sortBy (string): 排序方式，可选 relevance（相关性）或 time（时间）
  - sortOrder (string): 排序顺序，可选 desc（降序）或 asc（升序）
  - categories (string[]): 数据类型过滤，如 ["月度数据", "季度数据"]
  - periodRange (object): 时间范围过滤

Returns:
  匹配的数据集列表，包含 setId、名称、时间范围等信息
`,
      inputSchema: z.object({
        keyword: z.string().describe('搜索关键词，如 "GDP"、"CPI"、"人口"'),
        pageNum: z.number().optional().default(1).describe('页码，默认1'),
        pageSize: z.number().optional().default(10).describe('每页数量，默认10'),
        sortBy: z.string().optional().default('relevance').describe('排序方式，可选 relevance（相关性）或 time（时间）'),
        sortOrder: z.string().optional().default('desc').describe('排序顺序，可选 desc（降序）或 asc（升序）'),
        categories: z.array(z.string()).optional().describe('数据类型过滤，如 ["月度数据", "季度数据"]'),
        periodRange: z.object({
          start: z.string().describe('开始时间，如 "2020" 或 "202001"'),
          end: z.string().describe('结束时间，如 "2025" 或 "202512"'),
        }).optional().describe('时间范围过滤'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const results = await cnbsModernClient.findItems({
          keyword: args.keyword,
          pageNum: args.pageNum ?? 1,
          pageSize: args.pageSize ?? 10,
        });

        return {
          content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
          structuredContent: { results },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  server.registerTool(
    'cnbs_fetch_nodes',
    {
      title: 'Fetch CNBS Nodes',
      description: `获取中国国家统计局分类树节点。category=1月度/2季度/3年度/5分省季度/6分省年度/7其他。isEnd=true 的节点 id 即为 setId。
      
Args:
  - category (string): 分类代码：1月度 2季度 3年度 5分省季度 6分省年度 7其他
  - parentId (string): 父节点ID，空或省略表示从根节点开始

Returns:
  分类树节点列表
`,
      inputSchema: z.object({
        category: z.string().describe('分类代码：1月度 2季度 3年度 5分省季度 6分省年度 7其他'),
        parentId: z.string().optional().describe('父节点ID，空或省略表示从根节点开始'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const nodes = await cnbsModernClient.fetchNodes({
          category: args.category,
          parentId: args.parentId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(nodes, null, 2) }],
          structuredContent: { nodes },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  server.registerTool(
    'cnbs_fetch_metrics',
    {
      title: 'Fetch CNBS Metrics',
      description: `根据数据集ID (setId) 获取所有可用指标列表，包含指标名称、ID、单位等。
      
Args:
  - setId (string): 数据集ID，来自 cnbs_search 或 cnbs_fetch_nodes 的 isEnd=true 节点
  - name (string): 指标名称过滤（可选）

Returns:
  指标列表
`,
      inputSchema: z.object({
        setId: z.string().describe('数据集ID，来自 cnbs_search 或 cnbs_fetch_nodes 的 isEnd=true 节点'),
        name: z.string().optional().describe('指标名称过滤（可选）'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const metrics = await cnbsModernClient.fetchMetrics({
          setId: args.setId,
          name: args.name,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }],
          structuredContent: { metrics },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  server.registerTool(
    'cnbs_fetch_series',
    {
      title: 'Fetch CNBS Series',
      description: `批量获取统计指标数据。支持多个指标ID、多个时间段、多地区。
      
Args:
  - setId (string): 数据集ID
  - metricIds (string[]): 指标ID数组
  - periods (string[]): 时间范围数组，如 ["202501MM-202503MM"] 或 ["2023YY-2025YY"]
  - areas (array): 地区维度，默认全国
  - rootId (string): 根节点ID，月度数据默认为 fc982599aa684be7969d7b90b1bd0e84

Returns:
  统计数据点列表
`,
      inputSchema: z.object({
        setId: z.string().describe('数据集ID'),
        metricIds: z.array(z.string()).describe('指标ID数组'),
        periods: z.array(z.string()).describe('时间范围数组，如 ["202501MM-202503MM"] 或 ["2023YY-2025YY"]'),
        areas: z.array(z.object({
          text: z.string(),
          code: z.string(),
        })).optional().default([{ text: '全国', code: '000000000000' }]).describe('地区维度，默认全国'),
        rootId: z.string().optional().describe('根节点ID，月度数据默认为 fc982599aa684be7969d7b90b1bd0e84'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const series = await cnbsModernClient.fetchSeries({
          setId: args.setId,
          metricIds: args.metricIds,
          periods: args.periods,
          areas: args.areas ?? [{ text: '全国', code: '000000000000' }],
          rootId: args.rootId,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(series, null, 2) }],
          structuredContent: { series },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  server.registerTool(
    'cnbs_fetch_end_nodes',
    {
      title: 'Fetch CNBS End Nodes',
      description: `递归获取指定分类代码下所有叶子节点（setId）。注意：耗时长，不建议频繁使用。
      
Args:
  - category (string): 分类代码：1月度 2季度 3年度 5分省季度 6分省年度 7其他

Returns:
  所有叶子节点列表
`,
      inputSchema: z.object({
        category: z.string().describe('分类代码：1月度 2季度 3年度 5分省季度 6分省年度 7其他'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const endNodes = await cnbsModernClient.fetchAllEndNodes(args.category as CnbsCategory);
        return {
          content: [{ type: 'text', text: JSON.stringify(endNodes, null, 2) }],
          structuredContent: { endNodes },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  server.registerTool(
    'cnbs_get_cache_stats',
    {
      title: 'Get CNBS Cache Stats',
      description: '获取缓存使用情况的统计信息。',
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const stats = cnbsModernClient.getCacheStats();
        return {
          content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
          structuredContent: { stats },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  server.registerTool(
    'cnbs_format_number',
    {
      title: 'Format CNBS Number',
      description: '格式化统计数据值，支持设置精度。',
      inputSchema: z.object({
        value: z.string().describe('要格式化的数据值'),
        precision: z.number().optional().default(2).describe('精度，默认2位小数'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const formattedNumber = CnbsDataHelper.formatNumber(args.value, args.precision);
        return {
          content: [{ type: 'text', text: JSON.stringify({ formattedNumber }, null, 2) }],
          structuredContent: { formattedNumber },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  server.registerTool(
    'cnbs_transform_unit',
    {
      title: 'Transform CNBS Unit',
      description: '在不同单位之间转换统计数据值。',
      inputSchema: z.object({
        value: z.string().describe('要转换的数据值'),
        sourceUnit: z.string().describe('原始单位'),
        targetUnit: z.string().describe('目标单位'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const transformedValue = CnbsDataHelper.transformUnit(args.value, args.sourceUnit, args.targetUnit);
        return {
          content: [{ type: 'text', text: JSON.stringify({ transformedValue }, null, 2) }],
          structuredContent: { transformedValue },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  server.registerTool(
    'cnbs_compute_stats',
    {
      title: 'Compute CNBS Stats',
      description: '计算数据的基本统计信息，包括最小值、最大值、平均值和总和。',
      inputSchema: z.object({
        values: z.array(z.string()).describe('数据值数组'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const computedStats = CnbsDataHelper.computeStats(args.values);
        return {
          content: [{ type: 'text', text: JSON.stringify(computedStats, null, 2) }],
          structuredContent: computedStats,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  server.registerTool(
    'cnbs_get_regions',
    {
      title: 'Get CNBS Regions',
      description: `获取可用的地区列表，用于分省数据查询。返回地区代码和名称列表。
      
Args:
  - keyword (string): 搜索关键词，可选，用于过滤地区
  - level (string): 地区级别过滤，可选：province（省级）、city（市级）、county（县级）

Returns:
  地区列表，包含 code（地区代码）、name（全称）、shortName（简称）
  
示例：
  - 不传参数：返回所有省份
  - keyword="广东"：返回广东省
  - keyword="江"：返回名称包含"江"的省份（江苏、浙江等）
`,
      inputSchema: z.object({
        keyword: z.string().optional().describe('搜索关键词，如 "广东"、"北京"'),
        level: z.enum(['province', 'city', 'county']).optional().describe('地区级别过滤'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        let regions = CNBS_REGIONS;
        
        if (args.keyword) {
          regions = searchRegions(args.keyword);
        }
        
        if (args.level) {
          regions = regions.filter(r => r.level === args.level);
        }
        
        return {
          content: [{ type: 'text', text: JSON.stringify({ regions, count: regions.length }, null, 2) }],
          structuredContent: { regions, count: regions.length },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  server.registerTool(
    'cnbs_get_categories',
    {
      title: 'Get CNBS Categories',
      description: `获取所有数据分类信息，包括分类代码、名称和时间粒度。
      
Returns:
  分类列表，包含代码、名称、时间粒度类型
  
示例返回：
  - 代码 1：月度数据（CPI、PPI等）
  - 代码 2：季度数据（GDP季度值等）
  - 代码 3：年度数据（GDP年度值、人口等）
  - 代码 6：分省年度数据
`,
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const categories = Object.entries(CNBS_CATEGORY_INFO).map(([code, info]) => ({
          code,
          name: info.name,
          dtType: info.dtType,
        }));
        
        return {
          content: [{ type: 'text', text: JSON.stringify({ categories }, null, 2) }],
          structuredContent: { categories },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  server.registerTool(
    'cnbs_batch_search',
    {
      title: 'Batch Search CNBS Data',
      description: `批量搜索多个关键词的统计数据。一次性查询多个指标，提高效率。
      
Args:
  - keywords (string[]): 搜索关键词数组，如 ["GDP", "CPI", "人口"]
  - pageSize (number): 每个关键词返回的结果数量，默认5

Returns:
  按关键词分组的搜索结果
  
示例：
  cnbs_batch_search(keywords=["GDP", "CPI", "出生率"])
  返回三个关键词各自的搜索结果
`,
      inputSchema: z.object({
        keywords: z.array(z.string()).describe('搜索关键词数组'),
        pageSize: z.number().optional().default(5).describe('每个关键词返回的结果数量'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const results = await cnbsModernClient.batchFindItems(args.keywords, args.pageSize);
        
        return {
          content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
          structuredContent: results,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  server.registerTool(
    'cnbs_compare',
    {
      title: 'Compare CNBS Data',
      description: `对比不同地区或不同时间的数据。支持地区对比和时间对比。
      
Args:
  - keyword (string): 搜索关键词
  - regions (string[]): 要对比的地区名称数组，如 ["北京", "上海", "广东"]
  - compareType (string): 对比类型，"region"（地区对比）或 "time"（时间对比）
  - years (string[]): 时间对比时的年份数组，如 ["2022", "2023", "2024"]

Returns:
  对比结果表格
  
示例：
  - 地区对比：cnbs_compare(keyword="GDP", regions=["北京", "上海"], compareType="region")
  - 时间对比：cnbs_compare(keyword="GDP", compareType="time", years=["2022", "2023", "2024"])
`,
      inputSchema: z.object({
        keyword: z.string().describe('搜索关键词'),
        regions: z.array(z.string()).optional().describe('要对比的地区名称数组'),
        compareType: z.enum(['region', 'time']).default('region').describe('对比类型'),
        years: z.array(z.string()).optional().describe('时间对比时的年份数组'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const searchResult = await cnbsModernClient.findItems({ keyword: args.keyword, pageSize: 20 });
        const dataList = searchResult?.data?.data || searchResult?.data || [];
        
        if (!dataList || dataList.length === 0) {
          return {
            content: [{ type: 'text', text: `未找到关键词 "${args.keyword}" 的数据` }],
          };
        }

        if (args.compareType === 'region' && args.regions) {
          const regionCodes = args.regions.map(name => {
            const region = getRegionByName(name);
            return { name, code: region?.code || '000000000000' };
          });
          
          const comparison: any[] = [];
          
          for (const item of dataList) {
            const regionInfo = regionCodes.find(r => 
              r.code === item.da || 
              item.da_name?.includes(r.name) ||
              r.name.includes(item.da_name || '')
            );
            
            if (regionInfo) {
              comparison.push({
                region: item.da_name || regionInfo.name,
                value: item.value,
                unit: item.show_name?.match(/\((.+)\)/)?.[1] || '',
                period: item.dt_name || item.dt,
                indicator: item.show_name,
              });
            }
          }
          
          const groupedByRegion: Record<string, any> = {};
          for (const item of comparison) {
            if (!groupedByRegion[item.region]) {
              groupedByRegion[item.region] = {};
            }
            groupedByRegion[item.region][item.indicator] = {
              value: item.value,
              unit: item.unit,
              period: item.period,
            };
          }
          
          return {
            content: [{ type: 'text', text: JSON.stringify({
              keyword: args.keyword,
              compareType: 'region',
              comparison: groupedByRegion,
              summary: comparison,
            }, null, 2) }],
            structuredContent: {
              keyword: args.keyword,
              compareType: 'region',
              comparison: groupedByRegion,
              summary: comparison,
            },
          };
        }
        
        if (args.compareType === 'time' && args.years) {
          const comparison: any[] = [];
          
          for (const item of dataList) {
            const year = item.dt?.toString();
            if (year && args.years.includes(year)) {
              comparison.push({
                year: item.dt_name || year,
                value: item.value,
                unit: item.show_name?.match(/\((.+)\)/)?.[1] || '',
                region: item.da_name || '全国',
                indicator: item.show_name,
              });
            }
          }
          
          const groupedByYear: Record<string, any> = {};
          for (const item of comparison) {
            if (!groupedByYear[item.year]) {
              groupedByYear[item.year] = {};
            }
            groupedByYear[item.year][item.indicator] = {
              value: item.value,
              unit: item.unit,
              region: item.region,
            };
          }
          
          return {
            content: [{ type: 'text', text: JSON.stringify({
              keyword: args.keyword,
              compareType: 'time',
              comparison: groupedByYear,
              summary: comparison,
            }, null, 2) }],
            structuredContent: {
              keyword: args.keyword,
              compareType: 'time',
              comparison: groupedByYear,
              summary: comparison,
            },
          };
        }
        
        return {
          content: [{ type: 'text', text: JSON.stringify({
            keyword: args.keyword,
            data: dataList.slice(0, 10),
            hint: '请指定 regions 参数（地区对比）或 years 参数（时间对比）',
          }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据同步工具
  server.registerTool(
    'cnbs_sync_data',
    {
      title: 'Sync CNBS Data',
      description: `同步国家统计局数据，确保数据的准确性和时效性。
      
Args:
  - categories (string[]): 要同步的分类代码数组，如 ["1", "2", "3"]
  - forceSync (boolean): 是否强制同步，忽略最近同步时间

Returns:
  同步结果，包括每个分类的同步状态
  
示例：
  cnbs_sync_data(categories=["1", "2"], forceSync=true)
`,
      inputSchema: z.object({
        categories: z.array(z.string()).optional().default(['1', '2', '3', '5', '6']).describe('要同步的分类代码数组'),
        forceSync: z.boolean().optional().default(false).describe('是否强制同步'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const result = await cnbsModernClient.syncData({
          categories: args.categories,
          forceSync: args.forceSync,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 获取同步状态工具
  server.registerTool(
    'cnbs_get_sync_status',
    {
      title: 'Get CNBS Sync Status',
      description: `获取数据同步状态，了解各分类数据的同步情况。
      
Args:
  - category (string): 分类代码，可选，不指定则返回所有分类的状态

Returns:
  同步状态信息，包括最后同步时间、状态等
  
示例：
  cnbs_get_sync_status(category="3")  // 获取年度数据的同步状态
  cnbs_get_sync_status()  // 获取所有分类的同步状态
`,
      inputSchema: z.object({
        category: z.string().optional().describe('分类代码，可选'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const status = cnbsModernClient.getSyncStatus(args.category);
        return {
          content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
          structuredContent: status,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 检查数据新鲜度工具
  server.registerTool(
    'cnbs_check_data_freshness',
    {
      title: 'Check CNBS Data Freshness',
      description: `检查数据集的新鲜度，判断数据是否需要更新。
      
Args:
  - setId (string): 数据集ID

Returns:
  数据新鲜度信息，包括是否新鲜、最后更新时间等
  
示例：
  cnbs_check_data_freshness(setId="some_set_id")
`,
      inputSchema: z.object({
        setId: z.string().describe('数据集ID'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const freshness = await cnbsModernClient.checkDataFreshness(args.setId);
        return {
          content: [{ type: 'text', text: JSON.stringify(freshness, null, 2) }],
          structuredContent: freshness,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 列出数据源工具
  server.registerTool(
    'cnbs_list_data_sources',
    {
      title: 'List CNBS Data Sources',
      description: `列出所有可用的数据源，包括国家统计局数据、普查数据、国际数据等。

Returns:
  数据源列表，包括名称、描述、状态等信息
  
示例：
  cnbs_list_data_sources()
`,
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const dataSources = [
          {
            name: 'cnbs',
            description: '国家统计局常规统计数据（月度/季度/年度/分省）',
            categories: ['1=月度', '2=季度', '3=年度', '5=分省季度', '6=分省年度'],
            status: 'active',
            auth: '无需认证',
            tool: 'cnbs_search / cnbs_fetch_series',
          },
          {
            name: 'world_bank',
            description: '世界银行开放数据 - GDP、CPI、贸易、人口等跨国指标',
            categories: Object.keys(WorldBankDataSource.INDICATORS),
            status: 'active',
            auth: '无需认证',
            tool: 'ext_world_bank',
          },
          {
            name: 'imf',
            description: 'IMF DataMapper - WEO 预测、经常账户、政府债务等',
            categories: Object.keys(IMFDataSource.INDICATORS),
            status: 'active',
            auth: '无需认证',
            tool: 'ext_imf',
          },
          {
            name: 'oecd',
            description: 'OECD SDMX - 季度GDP、就业、先行指标（成员国）',
            categories: Object.keys(OECDDataSource.DATASETS),
            status: 'active',
            auth: '无需认证',
            tool: 'ext_oecd',
          },
          {
            name: 'bis',
            description: 'BIS Statistics - 有效汇率、信贷缺口、跨境银行统计',
            categories: Object.keys(BISDataSource.DATASETS),
            status: 'active',
            auth: '无需认证',
            tool: 'ext_bis',
          },
          {
            name: 'fred',
            description: 'FRED 美联储 - 美国GDP、利率、汇率、大宗商品价格等',
            categories: Object.keys(FREDDataSource.SERIES),
            status: 'active',
            auth: '需在请求头携带 X-Fred-Api-Key（免费申请；stdio 模式可用 FRED_API_KEY 环境变量）',
            tool: 'ext_fred',
          },
          {
            name: 'census',
            description: '国家统计局普查数据（人口/经济/农业普查）',
            categories: Object.keys(CensusDataSource.CENSUS_KEYWORDS),
            status: 'active',
            auth: '无需认证',
            tool: 'ext_cn_census',
          },
          {
            name: 'department',
            description: '各部门统计数据（财政/工信/商务/农业/央行等）',
            categories: Object.keys(DepartmentDataSource.DEPARTMENTS),
            status: 'active',
            auth: '无需认证',
            tool: 'ext_cn_department',
          },
          {
            name: 'international',
            description: '国际统计聚合源（转发至 world_bank / imf / oecd / bis）',
            categories: ['world_bank', 'imf', 'oecd', 'bis'],
            status: 'active',
            auth: '无需认证',
            tool: 'cnbs_fetch_data_from_source(source="international")',
          },
        ];
        return {
          content: [{ type: 'text', text: JSON.stringify({ dataSources, total: dataSources.length }, null, 2) }],
          structuredContent: { dataSources, total: dataSources.length },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 从特定数据源获取数据工具
  server.registerTool(
    'cnbs_fetch_data_from_source',
    {
      title: 'Fetch Data from Specific Source',
      description: `从特定数据源获取数据，支持扩展数据源。
      
Args:
  - source (string): 数据源名称，如 "cnbs"、"census"、"international"、"department"
  - params (object): 数据源特定的参数

Returns:
  数据源返回的数据
  
示例：
  cnbs_fetch_data_from_source(source="cnbs", params={keyword: "GDP"})
  cnbs_fetch_data_from_source(source="census", params={type: "population", year: "2020"})
  cnbs_fetch_data_from_source(source="international", params={source: "world_bank", indicator: "GDP", country: "CHN"})
  cnbs_fetch_data_from_source(source="department", params={department: "finance", indicator: "财政收入", period: "2024Q1"})
`,
      inputSchema: z.object({
        source: z.string().describe('数据源名称'),
        params: z.object({}).passthrough().describe('数据源特定的参数'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        if (args.source === 'cnbs') {
          const keyword = args.params.keyword as string;
          if (keyword) {
            const result = await cnbsModernClient.findItems({ keyword });
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
              structuredContent: result,
            };
          } else {
            return {
              content: [{ type: 'text', text: 'Error: Missing keyword parameter for cnbs source' }],
            };
          }
        } else {
          const result = await dataSourceManager.fetchData(args.source, args.params);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
          };
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 获取数据源分类工具
  server.registerTool(
    'cnbs_get_source_categories',
    {
      title: 'Get Source Categories',
      description: `获取特定数据源的分类信息。
      
Args:
  - source (string): 数据源名称，如 "census"、"international"、"department"

Returns:
  数据源的分类信息
  
示例：
  cnbs_get_source_categories(source="census")
  cnbs_get_source_categories(source="international")
`,
      inputSchema: z.object({
        source: z.string().describe('数据源名称'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const categories = await dataSourceManager.getCategories(args.source);
        return {
          content: [{ type: 'text', text: JSON.stringify({ categories }, null, 2) }],
          structuredContent: { categories },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 在特定数据源中搜索工具
  server.registerTool(
    'cnbs_search_in_source',
    {
      title: 'Search in Specific Source',
      description: `在特定数据源中搜索数据。
      
Args:
  - source (string): 数据源名称，如 "census"、"international"、"department"
  - keyword (string): 搜索关键词

Returns:
  搜索结果
  
示例：
  cnbs_search_in_source(source="census", keyword="人口")
  cnbs_search_in_source(source="international", keyword="GDP")
`,
      inputSchema: z.object({
        source: z.string().describe('数据源名称'),
        keyword: z.string().describe('搜索关键词'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const result = await dataSourceManager.search(args.source, args.keyword);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据质量评估工具
  server.registerTool(
    'cnbs_assess_data_quality',
    {
      title: 'Assess Data Quality',
      description: `评估数据质量，包括完整性、准确性、一致性和及时性。
      
Args:
  - data (array): 要评估的数据数组，每个元素应包含 value 字段

Returns:
  数据质量评估结果，包括各项指标和问题列表
  
示例：
  cnbs_assess_data_quality(data=[{value: "100"}, {value: "200"}, {value: "无数据"}])
`,
      inputSchema: z.object({
        data: z.array(z.object({
          value: z.string().optional(),
          period: z.string().optional(),
          region: z.string().optional(),
        })).describe('要评估的数据数组'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const quality = DataQualityAssessor.assess(args.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(quality, null, 2) }],
          structuredContent: quality,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据摘要生成工具
  server.registerTool(
    'cnbs_generate_summary',
    {
      title: 'Generate Data Summary',
      description: `生成数据摘要，包括总项数、有效项数、缺失项数、数据类型分布和时间范围。
      
Args:
  - data (array): 要分析的数据数组

Returns:
  数据摘要信息
  
示例：
  cnbs_generate_summary(data=[{value: "100", period: "202401MM"}, {value: "200", period: "202402MM"}])
`,
      inputSchema: z.object({
        data: z.array(z.object({
          value: z.string().optional(),
          period: z.string().optional(),
          region: z.string().optional(),
        })).describe('要分析的数据数组'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const summary = CnbsDataHelper.generateDataSummary(args.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
          structuredContent: summary,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 增强的数字格式化工具
  server.registerTool(
    'cnbs_enhanced_format_number',
    {
      title: 'Enhanced Format Number',
      description: `增强的数字格式化，支持多种格式选项。
      
Args:
  - value (string): 要格式化的值
  - precision (number): 小数位数，默认2
  - format (string): 格式类型，可选 fixed（固定小数）、compact（紧凑格式）、percent（百分比）

Returns:
  格式化后的数字
  
示例：
  cnbs_enhanced_format_number(value="123456789", precision=2, format="compact")
  cnbs_enhanced_format_number(value="0.05", precision=1, format="percent")
`,
      inputSchema: z.object({
        value: z.string().describe('要格式化的值'),
        precision: z.number().optional().default(2).describe('小数位数，默认2'),
        format: z.enum(['fixed', 'compact', 'percent']).optional().default('fixed').describe('格式类型'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const formatted = CnbsDataHelper.formatNumber(args.value, args.precision, args.format);
        return {
          content: [{ type: 'text', text: JSON.stringify({ formatted }, null, 2) }],
          structuredContent: { formatted },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据验证和清理工具
  server.registerTool(
    'cnbs_validate_data',
    {
      title: 'Validate and Clean Data',
      description: `验证和清理数据，处理无数据标记、空白字符等。
      
Args:
  - value (string): 要验证和清理的值

Returns:
  清理后的值，无数据返回 null
  
示例：
  cnbs_validate_data(value="  1,234.56  ")
  cnbs_validate_data(value="无数据")
`,
      inputSchema: z.object({
        value: z.string().describe('要验证和清理的值'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const cleaned = CnbsDataHelper.validateAndCleanData(args.value);
        return {
          content: [{ type: 'text', text: JSON.stringify({ cleaned }, null, 2) }],
          structuredContent: { cleaned },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据可视化工具 - 生成图表配置
  server.registerTool(
    'cnbs_generate_chart',
    {
      title: 'Generate Chart Configuration',
      description: `生成数据可视化图表配置，支持多种图表类型。
      
Args:
  - type (string): 图表类型，可选 line、bar、pie、scatter、radar、heatmap、treemap、gauge
  - data (object): 图表数据
  - options (object): 图表配置选项

Returns:
  图表配置对象，可用于前端图表库
  
示例：
  cnbs_generate_chart(type="line", data={series: [{name: "GDP", data: [100, 110, 120, 130, 140]}], xAxis: {data: ["2020", "2021", "2022", "2023", "2024"]}}, options={title: "GDP趋势"})
`,
      inputSchema: z.object({
        type: z.string().describe('图表类型，可选 line、bar、pie、scatter、radar、heatmap、treemap、gauge'),
        data: z.object({}).passthrough().describe('图表数据'),
        options: z.object({}).passthrough().optional().describe('图表配置选项'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const chartType = Object.values(ChartType).find(t => t === args.type) || ChartType.LINE;
        const config = dataVisualizationService.generateChartConfig(args.data, chartType, args.options);
        return {
          content: [{ type: 'text', text: JSON.stringify(config, null, 2) }],
          structuredContent: config,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据分析工具 - 趋势分析
  server.registerTool(
    'cnbs_analyze_trend',
    {
      title: 'Analyze Data Trend',
      description: `分析数据趋势，包括方向、变化量、变化百分比和斜率。
      
Args:
  - values (array): 数据值数组，按时间顺序排列

Returns:
  趋势分析结果
  
示例：
  cnbs_analyze_trend(values=[100, 110, 120, 130, 140])
`,
      inputSchema: z.object({
        values: z.array(z.number()).describe('数据值数组，按时间顺序排列'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const trend = dataAnalysisService.analyzeTrend(args.values);
        return {
          content: [{ type: 'text', text: JSON.stringify(trend, null, 2) }],
          structuredContent: trend,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据分析工具 - 相关性分析
  server.registerTool(
    'cnbs_analyze_correlation',
    {
      title: 'Analyze Data Correlation',
      description: `分析两组数据之间的相关性。
      
Args:
  - data1 (array): 第一组数据值数组
  - data2 (array): 第二组数据值数组

Returns:
  相关性分析结果，包括相关系数和强度
  
示例：
  cnbs_analyze_correlation(data1=[100, 110, 120, 130, 140], data2=[50, 55, 60, 65, 70])
`,
      inputSchema: z.object({
        data1: z.array(z.number()).describe('第一组数据值数组'),
        data2: z.array(z.number()).describe('第二组数据值数组'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const correlation = dataAnalysisService.analyzeCorrelation(args.data1, args.data2);
        return {
          content: [{ type: 'text', text: JSON.stringify(correlation, null, 2) }],
          structuredContent: correlation,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据分析工具 - 异常检测
  server.registerTool(
    'cnbs_detect_anomalies',
    {
      title: 'Detect Anomalies',
      description: `检测数据中的异常值。
      
Args:
  - values (array): 数据值数组
  - threshold (number): 异常检测阈值，默认2（标准差倍数）

Returns:
  异常检测结果，包括异常值列表和统计信息
  
示例：
  cnbs_detect_anomalies(values=[100, 110, 120, 500, 140], threshold=2)
`,
      inputSchema: z.object({
        values: z.array(z.number()).describe('数据值数组'),
        threshold: z.number().optional().default(2).describe('异常检测阈值，默认2（标准差倍数）'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const anomalies = dataAnalysisService.detectAnomalies(args.values, args.threshold);
        return {
          content: [{ type: 'text', text: JSON.stringify(anomalies, null, 2) }],
          structuredContent: anomalies,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据分析工具 - 统计分析
  server.registerTool(
    'cnbs_analyze_statistics',
    {
      title: 'Analyze Statistics',
      description: `计算数据的基本统计信息，包括均值、中位数、标准差等。
      
Args:
  - values (array): 数据值数组

Returns:
  统计分析结果
  
示例：
  cnbs_analyze_statistics(values=[100, 110, 120, 130, 140])
`,
      inputSchema: z.object({
        values: z.array(z.number()).describe('数据值数组'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const statistics = dataAnalysisService.analyzeStatistics(args.values);
        return {
          content: [{ type: 'text', text: JSON.stringify(statistics, null, 2) }],
          structuredContent: statistics,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据分析工具 - 时间序列分析
  server.registerTool(
    'cnbs_analyze_time_series',
    {
      title: 'Analyze Time Series',
      description: `分析时间序列数据，包括趋势、季节性等。
      
Args:
  - values (array): 时间序列数据值数组
  - period (number): 季节性周期，默认12

Returns:
  时间序列分析结果
  
示例：
  cnbs_analyze_time_series(values=[100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220], period=12)
`,
      inputSchema: z.object({
        values: z.array(z.number()).describe('时间序列数据值数组'),
        period: z.number().optional().default(12).describe('季节性周期，默认12'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const timeSeries = dataAnalysisService.analyzeTimeSeries(args.values, { period: args.period });
        return {
          content: [{ type: 'text', text: JSON.stringify(timeSeries, null, 2) }],
          structuredContent: timeSeries,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据分析工具 - 预测分析
  server.registerTool(
    'cnbs_predict_data',
    {
      title: 'Predict Data',
      description: `基于历史数据预测未来值。
      
Args:
  - values (array): 历史数据值数组
  - futureSteps (number): 预测未来步数，默认5

Returns:
  预测结果，包括历史数据和预测值
  
示例：
  cnbs_predict_data(values=[100, 110, 120, 130, 140], futureSteps=3)
`,
      inputSchema: z.object({
        values: z.array(z.number()).describe('历史数据值数组'),
        futureSteps: z.number().optional().default(5).describe('预测未来步数，默认5'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const prediction = dataAnalysisService.predict(args.values, args.futureSteps);
        return {
          content: [{ type: 'text', text: JSON.stringify(prediction, null, 2) }],
          structuredContent: prediction,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据转换工具 - 标准化数据
  server.registerTool(
    'cnbs_normalize_data',
    {
      title: 'Normalize Data',
      description: `将数据标准化到[0, 1]范围。
      
Args:
  - values (array): 数据值数组

Returns:
  标准化后的数据数组
  
示例：
  cnbs_normalize_data(values=[100, 110, 120, 130, 140])
`,
      inputSchema: z.object({
        values: z.array(z.number()).describe('数据值数组'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const normalized = dataTransformationService.normalize(args.values);
        return {
          content: [{ type: 'text', text: JSON.stringify({ normalized }, null, 2) }],
          structuredContent: { normalized },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据转换工具 - 标准化数据（Z-score）
  server.registerTool(
    'cnbs_standardize_data',
    {
      title: 'Standardize Data (Z-score)',
      description: `使用Z-score方法标准化数据。
      
Args:
  - values (array): 数据值数组

Returns:
  标准化后的数据数组
  
示例：
  cnbs_standardize_data(values=[100, 110, 120, 130, 140])
`,
      inputSchema: z.object({
        values: z.array(z.number()).describe('数据值数组'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const standardized = dataTransformationService.standardize(args.values);
        return {
          content: [{ type: 'text', text: JSON.stringify({ standardized }, null, 2) }],
          structuredContent: { standardized },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据转换工具 - 移动平均
  server.registerTool(
    'cnbs_moving_average',
    {
      title: 'Calculate Moving Average',
      description: `计算数据的移动平均值。
      
Args:
  - values (array): 数据值数组
  - window (number): 移动窗口大小，默认3

Returns:
  移动平均后的数据数组
  
示例：
  cnbs_moving_average(values=[100, 110, 120, 130, 140], window=3)
`,
      inputSchema: z.object({
        values: z.array(z.number()).describe('数据值数组'),
        window: z.number().optional().default(3).describe('移动窗口大小，默认3'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const movingAvg = dataTransformationService.movingAverage(args.values, args.window);
        return {
          content: [{ type: 'text', text: JSON.stringify({ movingAvg }, null, 2) }],
          structuredContent: { movingAvg },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );

  // 数据转换工具 - 指数平滑
  server.registerTool(
    'cnbs_exponential_smoothing',
    {
      title: 'Apply Exponential Smoothing',
      description: `对数据应用指数平滑。
      
Args:
  - values (array): 数据值数组
  - alpha (number): 平滑系数，默认0.3

Returns:
  平滑后的数据数组
  
示例：
  cnbs_exponential_smoothing(values=[100, 110, 120, 130, 140], alpha=0.3)
`,
      inputSchema: z.object({
        values: z.array(z.number()).describe('数据值数组'),
        alpha: z.number().optional().default(0.3).describe('平滑系数，默认0.3'),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const smoothed = dataTransformationService.exponentialSmoothing(args.values, args.alpha);
        return {
          content: [{ type: 'text', text: JSON.stringify({ smoothed }, null, 2) }],
          structuredContent: { smoothed },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
        };
      }
    }
  );
  // ─── 外部数据源：世界银行 ───────────────────────────────────────
  server.registerTool(
    'ext_world_bank',
    {
      title: 'World Bank Open Data',
      description: `查询世界银行开放数据。支持 GDP、CPI、贸易、人口、失业率等全球 200+ 国家数据。完全免费，无需认证。

Args:
  - indicator (string): 指标名（如 "GDP"、"CPI"、"UNEMPLOYMENT"）或 WB 指标代码（如 "NY.GDP.MKTP.CD"）
  - countries (string[]): ISO3 国家代码数组，如 ["CHN","USA","JPN"]；默认 ["CHN"]
  - startYear (number): 起始年份，默认 2000
  - endYear (number): 结束年份，默认当前年

常用指标: GDP | GDP_GROWTH | GDP_PER_CAPITA | CPI | UNEMPLOYMENT | POPULATION | EXPORTS | IMPORTS | FDI_INFLOWS | GOVT_DEBT | GINI | LIFE_EXPECTANCY | CO2_EMISSIONS | CURRENT_ACCOUNT
`,
      inputSchema: z.object({
        indicator: z.string().describe('指标名如 "GDP" 或 WB 代码如 "NY.GDP.MKTP.CD"'),
        countries: z.array(z.string()).optional().default(['CHN']).describe('ISO3 代码数组，如 ["CHN","USA"]'),
        startYear: z.number().optional().default(2000).describe('起始年份'),
        endYear: z.number().optional().describe('结束年份，默认当前年'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      const result = await worldBankSource.fetchData({
        indicator: args.indicator,
        countries: args.countries,
        startYear: args.startYear,
        endYear: args.endYear,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  server.registerTool(
    'ext_world_bank_multi',
    {
      title: 'World Bank Multi-Indicator Query',
      description: `同时查询世界银行多个指标，跨国对比。

Args:
  - indicators (string[]): 指标数组，如 ["GDP_GROWTH","CPI","UNEMPLOYMENT"]
  - countries (string[]): ISO3 代码数组，如 ["CHN","USA","DEU"]
  - startYear (number): 起始年份
  - endYear (number): 结束年份
`,
      inputSchema: z.object({
        indicators: z.array(z.string()).describe('指标数组'),
        countries: z.array(z.string()).optional().default(['CHN']).describe('ISO3 代码数组'),
        startYear: z.number().optional().default(2015).describe('起始年份'),
        endYear: z.number().optional().describe('结束年份'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      const result = await worldBankSource.fetchMulti({
        indicators: args.indicators,
        countries: args.countries,
        startYear: args.startYear,
        endYear: args.endYear,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  server.registerTool(
    'ext_world_bank_indicators',
    {
      title: 'List World Bank Indicators',
      description: '列出世界银行数据源支持的所有预置指标及其代码和说明。',
      inputSchema: z.object({
        keyword: z.string().optional().describe('按关键词过滤'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const result = args.keyword
        ? await worldBankSource.search(args.keyword)
        : { indicators: await worldBankSource.getCategories() };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  // ─── 外部数据源：IMF ────────────────────────────────────────────
  server.registerTool(
    'ext_imf',
    {
      title: 'IMF DataMapper Query',
      description: `查询 IMF 世界经济展望 (WEO) 数据。支持 GDP 增速、通胀、失业率、经常账户、政府债务等。完全免费，无需认证。

Args:
  - indicator (string): 指标名如 "GDP_GROWTH"、"CPI_INFLATION" 或 IMF 代码如 "NGDP_RPCH"
  - countries (string[]): ISO 代码数组，如 ["CHN","USA","JPN"]；默认 ["CHN"]
  - periods (string[]): 年份数组，如 ["2020","2021","2022","2023"]；不传则返回全部

常用指标: GDP_GROWTH | GDP_USD | GDP_PER_CAPITA | CPI_INFLATION | UNEMPLOYMENT | CURRENT_ACCOUNT | GOVT_DEBT | GOVT_BALANCE | GROSS_SAVINGS | INVESTMENT | POPULATION
`,
      inputSchema: z.object({
        indicator: z.string().describe('指标名如 "GDP_GROWTH" 或 IMF 代码如 "NGDP_RPCH"'),
        countries: z.array(z.string()).optional().default(['CHN']).describe('ISO 代码数组，如 ["CHN","USA"]'),
        periods: z.array(z.string()).optional().describe('年份数组，如 ["2020","2021","2022"]'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      const result = await imfSource.fetchData({
        indicator: args.indicator,
        countries: args.countries,
        periods: args.periods,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  server.registerTool(
    'ext_imf_indicators',
    {
      title: 'List IMF Indicators',
      description: '列出 IMF DataMapper 支持的所有预置指标。',
      inputSchema: z.object({
        keyword: z.string().optional().describe('按关键词过滤'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const result = args.keyword
        ? await imfSource.search(args.keyword)
        : { indicators: await imfSource.getCategories() };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  server.registerTool(
    'ext_imf_all_indicators',
    {
      title: 'IMF All WEO Indicators',
      description: '获取 IMF DataMapper 完整指标目录（直接调用 IMF API）。',
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      const result = await imfSource.listAllIndicators();
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  // ─── 外部数据源：OECD ───────────────────────────────────────────
  server.registerTool(
    'ext_oecd',
    {
      title: 'OECD SDMX Data Query',
      description: `查询 OECD 统计数据（SDMX-JSON）。支持季度GDP、就业、先行指标等。完全免费，无需认证。

Args:
  - dataset (string): 预置数据集名，如 "QNA_GDP"、"KEI_CPI"、"EMPLOYMENT"
  - key (string): SDMX 维度键，如 "Q.G20.B1GQ....V.N"（可选，默认 "all"，注意数据量可能较大）
  - startPeriod (string): 起始期间，如 "2015-Q1" 或 "2015-01"
  - lastNObservations (number): 返回最近 N 期，默认 20

预置数据集: QNA_GDP | KEI_CPI | EMPLOYMENT | TRADE
`,
      inputSchema: z.object({
        dataset: z.string().describe('预置数据集: QNA_GDP | KEI_CPI | EMPLOYMENT | TRADE，或自定义 agencyId+dataflowId'),
        key: z.string().optional().describe('SDMX 维度键，默认 "all"'),
        agencyId: z.string().optional().describe('自定义 agencyId，与 dataflowId 配合使用'),
        dataflowId: z.string().optional().describe('自定义 dataflowId'),
        startPeriod: z.string().optional().describe('起始期间，如 "2015-Q1"'),
        endPeriod: z.string().optional().describe('结束期间'),
        lastNObservations: z.number().optional().default(20).describe('最近 N 期数据'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      const result = await oecdSource.fetchData({
        dataset: args.dataset,
        key: args.key,
        agencyId: args.agencyId,
        dataflowId: args.dataflowId,
        startPeriod: args.startPeriod,
        endPeriod: args.endPeriod,
        lastNObservations: args.lastNObservations,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  server.registerTool(
    'ext_oecd_datasets',
    {
      title: 'List OECD Datasets',
      description: '列出 OECD 数据源支持的所有预置数据集。',
      inputSchema: z.object({
        keyword: z.string().optional().describe('按关键词过滤'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const result = args.keyword
        ? await oecdSource.search(args.keyword)
        : { datasets: await oecdSource.getCategories() };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  // ─── 外部数据源：BIS ────────────────────────────────────────────
  server.registerTool(
    'ext_bis',
    {
      title: 'BIS Statistics Query',
      description: `查询国际清算银行 (BIS) 统计数据。涵盖有效汇率、信贷缺口、住宅房价、债务偿还比率等金融稳定指标。完全免费，无需认证。

Args:
  - dataset (string): 数据集名，如 "EER"（有效汇率）、"CREDIT_GAP"（信贷缺口）、"PROPERTY_PRICES"（房价）
  - country (string): ISO2 代码，如 "CN"（中国）、"US"（美国）；默认 "CN"
  - lastNObservations (number): 最近 N 期，默认 20
  - startPeriod (string): 起始期间，如 "2015-Q1" 或 "2015-01"

预置数据集: EER | CREDIT_GAP | TOTAL_CREDIT | PROPERTY_PRICES | DEBT_SERVICE | CROSS_BORDER_BANKING
`,
      inputSchema: z.object({
        dataset: z.string().describe('数据集: EER | CREDIT_GAP | TOTAL_CREDIT | PROPERTY_PRICES | DEBT_SERVICE | CROSS_BORDER_BANKING'),
        country: z.string().optional().default('CN').describe('ISO2 国家代码，如 "CN"、"US"、"DE"'),
        key: z.string().optional().describe('覆盖默认键模板（高级用法）'),
        lastNObservations: z.number().optional().default(20).describe('最近 N 期数据'),
        startPeriod: z.string().optional().describe('起始期间，如 "2015-Q1" 或 "2015-01"'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      const result = await bisSource.fetchData({
        dataset: args.dataset,
        country: args.country,
        key: args.key,
        lastNObservations: args.lastNObservations,
        startPeriod: args.startPeriod,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  server.registerTool(
    'ext_bis_datasets',
    {
      title: 'List BIS Datasets',
      description: '列出 BIS 数据源支持的所有预置数据集及键模板。',
      inputSchema: z.object({
        keyword: z.string().optional().describe('按关键词过滤'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const result = args.keyword
        ? await bisSource.search(args.keyword)
        : { datasets: await bisSource.getCategories() };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  // ─── 外部数据源：FRED（美联储）──────────────────────────────────
  server.registerTool(
    'ext_fred',
    {
      title: 'FRED Economic Data (Federal Reserve)',
      description: `查询美联储经济数据库 (FRED)。涵盖美国GDP、利率、汇率、通胀、大宗商品价格等 800,000+ 系列。
⚠️ 需要 FRED API Key：在 MCP 客户端配置中添加请求头 X-Fred-Api-Key: <your_key>（在 https://fred.stlouisfed.org/docs/api/api_key.html 免费申请）。stdio 模式可改用 FRED_API_KEY 环境变量。

Args:
  - series (string): 系列名如 "US_GDP"、"FED_FUNDS"、"CNY_USD" 或 FRED 代码如 "GDP"
  - limit (number): 返回数量，默认 100
  - sortOrder (string): "desc"（最新优先）或 "asc"
  - observationStart (string): 起始日期，如 "2010-01-01"

常用系列: US_GDP | US_GDP_GROWTH | FED_FUNDS | US_10Y_YIELD | US_2Y_YIELD | CNY_USD | EUR_USD | US_UNEMPLOYMENT | US_CPI | OIL_PRICE_WTI | GOLD_PRICE | US_M2 | SP500 | VIX | DOLLAR_INDEX
`,
      inputSchema: z.object({
        series: z.string().describe('系列名如 "US_GDP" 或 FRED 代码如 "GDP"'),
        limit: z.number().optional().default(100).describe('返回数量'),
        sortOrder: z.enum(['asc', 'desc']).optional().default('desc').describe('排序方向'),
        observationStart: z.string().optional().describe('起始日期 YYYY-MM-DD'),
        observationEnd: z.string().optional().describe('结束日期 YYYY-MM-DD'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      const result = await fredSource.fetchData({
        series: args.series,
        limit: args.limit,
        sortOrder: args.sortOrder,
        observationStart: args.observationStart,
        observationEnd: args.observationEnd,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  server.registerTool(
    'ext_fred_series',
    {
      title: 'List FRED Series',
      description: '列出 FRED 数据源支持的所有预置系列（利率、汇率、大宗商品、宏观经济等）。',
      inputSchema: z.object({
        keyword: z.string().optional().describe('按关键词过滤'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const result = args.keyword
        ? await fredSource.search(args.keyword)
        : { series: await fredSource.getCategories() };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  // ─── 外部数据源：国家统计局普查 ────────────────────────────────
  server.registerTool(
    'ext_cn_census',
    {
      title: 'China NBS Census Data',
      description: `查询国家统计局普查数据（人口普查、经济普查、农业普查）。通过 NBS 官方 API 获取真实数据。

Args:
  - type (string): 普查类型 "population"（人口）| "economic"（经济）| "agriculture"（农业）
  - keyword (string): 自定义搜索关键词（可选，覆盖默认）
  - pageSize (number): 返回结果数，默认 20
`,
      inputSchema: z.object({
        type: z.enum(['population', 'economic', 'agriculture']).optional().default('population').describe('普查类型'),
        keyword: z.string().optional().describe('自定义搜索关键词'),
        pageSize: z.number().optional().default(20).describe('返回结果数'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      const result = await censusSource.fetchData({
        type: args.type,
        keyword: args.keyword,
        pageSize: args.pageSize,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  // ─── 外部数据源：各部门统计 ─────────────────────────────────────
  server.registerTool(
    'ext_cn_department',
    {
      title: 'China Department Statistics',
      description: `查询各部门在国家统计局发布的统计数据。涵盖财政、工业、商务、农业、货币金融、社会保障、房地产、能源等。

Args:
  - department (string): 部门键
  - indicator (string): 具体指标关键词（可选，不填则用部门默认首个关键词）
  - pageSize (number): 返回数量，默认 20
  - fetchAll (boolean): 是否获取该部门所有关键词数据（较慢），默认 false

可用部门: finance（财政）| industry（工业）| trade（商务）| agriculture（农业）| monetary（货币金融）| social_security（社保）| housing（房地产）| energy（能源）
`,
      inputSchema: z.object({
        department: z.enum([
          'finance', 'industry', 'trade', 'agriculture',
          'monetary', 'social_security', 'housing', 'energy',
        ]).describe('部门键'),
        indicator: z.string().optional().describe('具体指标关键词，如 "财政收入"'),
        pageSize: z.number().optional().default(20).describe('返回数量'),
        fetchAll: z.boolean().optional().default(false).describe('是否获取该部门所有关键词数据'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      let result;
      if (args.fetchAll) {
        result = await departmentSource.fetchAllKeywordsForDepartment(args.department);
      } else {
        result = await departmentSource.fetchData({
          department: args.department,
          indicator: args.indicator,
          pageSize: args.pageSize,
        });
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );

  server.registerTool(
    'ext_cn_department_list',
    {
      title: 'List Department Categories',
      description: '列出所有可查询的部门及其指标关键词列表。',
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const categories = await departmentSource.getCategories();
      return {
        content: [{ type: 'text', text: JSON.stringify({ departments: categories }, null, 2) }],
        structuredContent: { departments: categories },
      };
    }
  );

  // ─── 跨源对比工具 ───────────────────────────────────────────────
  server.registerTool(
    'ext_global_compare',
    {
      title: 'Global Economic Indicator Comparison',
      description: `同时从世界银行和 IMF 获取同一指标的多国数据，快速进行国际横向对比。

Args:
  - wbIndicator (string): 世界银行指标，如 "GDP_GROWTH"
  - imfIndicator (string): IMF 指标，如 "GDP_GROWTH"
  - countries (string[]): ISO 代码，如 ["CHN","USA","DEU","JPN","IND"]
  - startYear (number): 起始年份
`,
      inputSchema: z.object({
        wbIndicator: z.string().describe('世界银行指标名，如 "GDP_GROWTH"'),
        imfIndicator: z.string().optional().describe('IMF 指标名，如 "GDP_GROWTH"（不填则只查 WB）'),
        countries: z.array(z.string()).optional().default(['CHN', 'USA', 'DEU', 'JPN']).describe('ISO3 代码数组'),
        startYear: z.number().optional().default(2015).describe('起始年份'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      const [wbResult, imfResult] = await Promise.allSettled([
        worldBankSource.fetchData({
          indicator: args.wbIndicator,
          countries: args.countries,
          startYear: args.startYear,
        }),
        args.imfIndicator
          ? imfSource.fetchData({ indicator: args.imfIndicator, countries: args.countries })
          : Promise.resolve(null),
      ]);

      const result = {
        world_bank: wbResult.status === 'fulfilled' ? wbResult.value : { error: (wbResult as any).reason?.message },
        imf: imfResult.status === 'fulfilled' ? imfResult.value : { error: (imfResult as any).reason?.message },
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );
}

// 数据源管理类已在 data-sources.ts 中实现，此处不再重复定义
