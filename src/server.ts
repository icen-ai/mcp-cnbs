import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCnbsTools } from './tools/index.js';
import { cnbsCacheHub } from './services/cache.js';

const CNBS_VERSION = '1.1.0';

export interface CnbsServerConfig {
  /** FRED API Key，优先级高于 FRED_API_KEY 环境变量。通过 X-Fred-Api-Key 请求头传入。 */
  fredApiKey?: string;
}

export function createCnbsServer(config?: CnbsServerConfig) {
  const server = new McpServer({
    name: 'mcp-cnbs',
    version: CNBS_VERSION,
    description: '中国国家统计局数据 MCP 服务器，支持 NBS 常规统计、普查、世界银行、IMF、OECD、BIS、FRED 等多源数据'
  });

  (server as any).instructions = `
# 中国国家统计局 + 国际多源统计数据 MCP 服务器 v${CNBS_VERSION}

支持 NBS 国内数据、世界银行、IMF、OECD、BIS、FRED（美联储）、NBS 普查和部门统计，全部对接真实 API。

## 数据源
- NBS 常规数据：月度/季度/年度/分省（cnbs_* 工具）
- 世界银行：200+ 国家 GDP/贸易/人口等（ext_world_bank*）
- IMF DataMapper：WEO 预测/政府债务等（ext_imf*）
- OECD SDMX：季度GDP/就业/先行指标（ext_oecd*）
- BIS：有效汇率/信贷缺口/房价（ext_bis*）
- FRED：美国利率/汇率/大宗商品（ext_fred* | 需 X-Fred-Api-Key 请求头）
- NBS 普查：人口/经济/农业普查（ext_cn_census）
- NBS 部门：财政/工信/商务/农业/央行/社保/房地产/能源（ext_cn_department*）

## FRED 使用说明
在 MCP 客户端配置中添加请求头 X-Fred-Api-Key: <your_key>
API Key 免费申请：https://fred.stlouisfed.org/docs/api/api_key.html

## 推荐工作流
- 国内最新值：cnbs_search(keyword="GDP")
- 国际对比：ext_world_bank(indicator="GDP_GROWTH", countries=["CHN","USA","DEU"])
- 中美双源核验：ext_global_compare(wbIndicator="GDP_GROWTH", imfIndicator="GDP_GROWTH", countries=["CHN","USA"])
- 调用 cnbs_get_guide() 获取完整工具指南
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
              description: '中国国家统计局 + 国际多源统计数据 MCP 服务器',
              capabilities: {
                dataSources: ['cnbs', 'world_bank', 'imf', 'oecd', 'bis', 'fred', 'census', 'department'],
                fredEnabled: !!(config?.fredApiKey || process.env.FRED_API_KEY),
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

  registerCnbsTools(server, config);
  return server;
}
