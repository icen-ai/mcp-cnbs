import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCnbsTools } from './tools/index.js';

const CNBS_VERSION = '1.0.0';

export function createCnbsServer() {
  const server = new McpServer({
    name: 'mcp-cnbs',
    version: CNBS_VERSION,
  });

  (server as any).instructions = `
该服务用于查询中国国家统计局的统计数据（基于 UUID 标识符的新版 API）。

数据查询三步走：
1. cnbs_search - 关键词搜索，找到目标数据集的 setId
2. cnbs_fetch_metrics - 根据 setId 获取指标列表，找到 metricId
3. cnbs_fetch_series - 用 setId + metricId + 时间范围查询具体数据

核心工具说明：
- cnbs_search(keyword, sortBy, sortOrder, categories, periodRange): 关键词搜索，支持排序和过滤
- cnbs_fetch_nodes(category, parentId?): 浏览分类树，category=1月度/2季度/3年度/5分省季度/6分省年度/7其他。isEnd=true 的 id 即为 setId
- cnbs_fetch_metrics(setId): 获取某数据集下的所有指标
- cnbs_fetch_series(setId, metricIds, periods, areas?): 核心数据查询接口
- cnbs_fetch_end_nodes(category): 递归获取所有叶子节点（耗时，不建议频繁用）
- cnbs_format_number(value, precision): 格式化数据值，支持设置精度
- cnbs_transform_unit(value, sourceUnit, targetUnit): 在不同单位之间转换数据值
- cnbs_compute_stats(values): 计算数据的基本统计信息
- cnbs_get_cache_stats(): 获取缓存使用情况
- cnbs_flush_caches(): 清除所有缓存数据

时间格式：
- 月度: YYYYMM，如 202501，后缀 MM
- 季度: YYYYQ，如 20254，后缀 SS
- 年度: YYYY，如 2025，后缀 YY
- 范围: Start-End，如 202501MM-202503MM

地区代码：
- 000000000000 = 全国
`;

  registerCnbsTools(server);
  return server;
}
