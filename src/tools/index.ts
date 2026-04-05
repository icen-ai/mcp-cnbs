import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CnbsModernClient } from '../services/api.js';
import { CnbsCategory } from '../types/index.js';
import { CnbsDataHelper } from '../services/data.js';
import { CNBS_REGIONS, CNBS_CATEGORY_INFO, searchRegions, getRegionByCode, getRegionByName } from '../constants/index.js';
import { z } from 'zod';

const cnbsModernClient = new CnbsModernClient();

const LLMS_TXT_CONTENT = `# mcp_cnbs - 中国国家统计局数据 MCP 服务器

## 🚀 核心原则（必读）

⚠️ 最重要：优先使用 cnbs_search 获取数据
- 搜索接口返回的 value 字段有值
- cnbs_fetch_series 返回的 value 字段可能为空（API限制）

## 推荐工作流程

场景一：只需最新值（最常见）
→ cnbs_search(keyword="GDP") → 直接获取 value = 最新数据值

场景二：需要历史时间序列
→ cnbs_search(keyword="GDP") → 获取 cid 和 indic_id
→ cnbs_fetch_series(setId, metricIds, periods) → 获取历史数据

场景三：浏览分类体系
→ cnbs_fetch_nodes(category="3") → 递归下钻 → isLeaf=true 的节点可查数据

场景四：批量查询多指标
→ cnbs_batch_search(keywords=["GDP", "CPI", "人口"]) → 一次获取多个指标

场景五：地区/时间对比
→ cnbs_compare(keyword="GDP", regions=["北京", "上海"]) → 地区对比结果

## 📊 数据分类代码

| 代码 | 分类 | 典型数据 |
|------|------|---------|
| 1 | 月度数据 | CPI、PPI、工业增加值 |
| 2 | 季度数据 | GDP季度值、PMI |
| 3 | 年度数据 | GDP年度值、人口数据 |
| 5 | 分省季度 | 各省GDP季度值 |
| 6 | 分省年度 | 各省人口、GDP年度值 |

## ⏰ 时间格式

年度：2024YY, 范围 ["2020YY-2024YY"]
季度：2024A/B/C/D (A=Q1, B=Q2, C=Q3, D=Q4), 快捷范围 LAST6/LAST12/LAST18
月度：202401MM, 范围 ["202301MM-202412MM"]

## 🗺️ 地区代码

使用 cnbs_get_regions 获取完整列表。常用：
- 全国：000000000000
- 北京：110000000000
- 上海：310000000000
- 广东：440000000000

## 🛠️ 工具速查

| 工具 | 功能 | 关键参数 |
|------|------|---------|
| cnbs_search | 搜索指标+最新值（推荐） | keyword |
| cnbs_fetch_nodes | 获取分类树节点 | category, parentId |
| cnbs_fetch_metrics | 获取指标列表 | setId |
| cnbs_fetch_series | 获取时间序列 | setId, metricIds, periods |
| cnbs_fetch_end_nodes | 递归获取叶子节点 | category |
| cnbs_batch_search | 批量搜索多指标 | keywords |
| cnbs_compare | 地区/时间对比 | keyword, regions/years |
| cnbs_get_regions | 获取地区代码 | keyword |
| cnbs_get_categories | 获取分类信息 | - |

## ⚠️ 重要提示

1. cnbs_fetch_series 的 value 可能为空 → 这是API限制，优先用 cnbs_search
2. 搜索结果的 cid = setId, indic_id = metricId
3. isLeaf=true 的节点是叶子节点，可查数据

## 📝 常见查询示例

cnbs_search(keyword="GDP")          // GDP
cnbs_search(keyword="CPI")          // CPI
cnbs_search(keyword="出生率")       // 人口出生率
cnbs_search(keyword="65岁人口")     // 老龄化人口
cnbs_fetch_nodes(category="3")      // 年度数据分类
cnbs_batch_search(keywords=["GDP", "CPI", "人口"])  // 批量查询
cnbs_compare(keyword="GDP", regions=["北京", "上海"], compareType="region")  // 地区对比
cnbs_get_regions(keyword="广东")    // 获取地区代码

## 🔧 辅助工具

cnbs_get_guide | cnbs_get_cache_stats | cnbs_format_number
cnbs_transform_unit | cnbs_compute_stats`;

export function registerCnbsTools(server: McpServer) {
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
}
