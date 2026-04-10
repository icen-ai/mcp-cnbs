import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCnbsTools } from './tools/index.js';
import { cnbsCacheHub } from './services/cache.js';

const CNBS_VERSION = '1.1.0';

export function createCnbsServer() {
  const server = new McpServer({
    name: 'mcp-cnbs',
    version: CNBS_VERSION,
    description: '中国国家统计局数据 MCP 服务器，支持常规统计数据、普查数据、国际数据和部门数据'
  });

  (server as any).instructions = `
# 中国国家统计局数据 MCP 服务器

该服务用于查询中国国家统计局的统计数据，支持多种数据源和丰富的数据处理功能。

## 数据源

- **常规统计数据**：国家统计局发布的月度、季度、年度数据
- **普查数据**：人口普查、经济普查、农业普查数据
- **国际数据**：世界银行、IMF、OECD 等国际组织数据
- **部门数据**：财政部、工信部、商务部等部门数据

## 核心工具

### 数据查询工具
- **cnbs_search**: 关键词搜索统计数据（推荐优先使用）
- **cnbs_fetch_nodes**: 浏览分类树结构
- **cnbs_fetch_metrics**: 获取数据集下的所有指标
- **cnbs_fetch_series**: 获取时间序列数据
- **cnbs_batch_search**: 批量搜索多个关键词
- **cnbs_compare**: 地区或时间对比分析

### 数据源扩展工具
- **cnbs_list_data_sources**: 列出所有可用数据源
- **cnbs_fetch_data_from_source**: 从特定数据源获取数据
- **cnbs_get_source_categories**: 获取数据源分类
- **cnbs_search_in_source**: 在特定数据源中搜索

### 数据同步工具
- **cnbs_sync_data**: 同步国家统计局数据
- **cnbs_get_sync_status**: 获取同步状态
- **cnbs_check_data_freshness**: 检查数据新鲜度

### 数据处理工具
- **cnbs_format_number**: 格式化数据值
- **cnbs_transform_unit**: 单位转换
- **cnbs_compute_stats**: 计算统计信息
- **cnbs_get_cache_stats**: 获取缓存使用情况

## 时间格式
- 月度: YYYYMM, 如 202501, 后缀 MM
- 季度: YYYYQ, 如 20254, 后缀 SS
- 年度: YYYY, 如 2025, 后缀 YY
- 范围: Start-End, 如 202501MM-202503MM

## 地区代码
- 000000000000 = 全国
- 使用 cnbs_get_regions 获取完整地区列表

## 最佳实践
1. 优先使用 cnbs_search 获取最新数据
2. 需要历史数据时使用 cnbs_fetch_series
3. 批量查询使用 cnbs_batch_search
4. 对比分析使用 cnbs_compare
5. 定期使用 cnbs_sync_data 保持数据新鲜

---
版本: ${CNBS_VERSION}
`;

  // 注册健康检查资源
  server.registerResource(
    'health',
    '/health',
    {},
    async (uri, extra) => {
      return {
        contents: [
          {
            uri: uri.toString(),
            text: JSON.stringify({
              status: 'ok',
              timestamp: new Date().toISOString(),
              version: CNBS_VERSION,
              cacheStatus: cnbsCacheHub.getAllStats()
            }),
            mimeType: 'application/json'
          }
        ]
      };
    }
  );

  // 注册服务器信息资源
  server.registerResource(
    'info',
    '/info',
    {},
    async (uri, extra) => {
      return {
        contents: [
          {
            uri: uri.toString(),
            text: JSON.stringify({
              name: 'mcp-cnbs',
              version: CNBS_VERSION,
              description: '中国国家统计局数据 MCP 服务器',
              capabilities: {
                dataSources: ['cnbs', 'census', 'international', 'department'],
                tools: 20 // 工具数量
              },
              uptime: process.uptime(),
              timestamp: new Date().toISOString()
            }),
            mimeType: 'application/json'
          }
        ]
      };
    }
  );

  registerCnbsTools(server);
  return server;
}
