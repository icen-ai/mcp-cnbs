# CNBS MCP 服务器

国家统计局数据查询的 MCP 服务器。

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

## MCP 客户端配置

### NPX 模式（本地运行）

**支持的客户端：** Claude Desktop、Cursor、Windsurf、Cherry Studio、Trae、Continue 等所有支持 MCP 的客户端。

添加到 MCP 客户端配置文件：

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

### HTTP 模式（远程访问）

**支持的客户端：** Trae、Cherry Studio 等支持 HTTP transport 的客户端。

**魔搭免费演示（推荐）：**
```json
{
  "mcpServers": {
    "cnbs": {
      "url": "https://mcp.api-inference.modelscope.net/c2ca6ece4e9946/mcp"
    }
  }
}
```

> **注意：** 这是阿里云 ModelScope 提供的免费公共演示服务，无需认证。
>
> 由于免费服务可能变更，建议自行部署：[在魔搭免费部署](https://modelscope.cn/mcp/servers/thatcoder/cnbs)

## 端点说明

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | POST | Streamable HTTP（推荐） |
| `/` | GET | SSE 流（通知） |
| `/sse` | GET | 旧版 SSE 模式 |
| `/message` | POST | 旧版 SSE 消息 |

## 工具列表

### 数据查询

| 工具 | 功能 |
|------|------|
| `cnbs_search` | 关键词搜索，返回最新数据值 |
| `cnbs_fetch_nodes` | 获取分类树节点 |
| `cnbs_fetch_metrics` | 获取数据集的指标列表 |
| `cnbs_fetch_series` | 获取时间序列数据 |
| `cnbs_fetch_end_nodes` | 递归获取所有叶子节点 |
| `cnbs_batch_search` | 批量搜索多个关键词 |
| `cnbs_compare` | 数据对比（地区对比/时间对比） |

### 参考数据

| 工具 | 功能 |
|------|------|
| `cnbs_get_regions` | 获取地区代码列表 |
| `cnbs_get_categories` | 获取所有分类信息 |

### 辅助功能

| 工具 | 功能 |
|------|------|
| `cnbs_get_guide` | 获取使用指南 |
| `cnbs_get_cache_stats` | 获取缓存统计 |
| `cnbs_format_number` | 格式化数字 |
| `cnbs_transform_unit` | 单位转换 |
| `cnbs_compute_stats` | 计算统计信息 |

## 快速示例

```
// 查询 GDP
cnbs_search(keyword="GDP")

// 查询出生率
cnbs_search(keyword="出生率")

// 批量查询
cnbs_batch_search(keywords=["GDP", "CPI", "人口"])

// 地区对比
cnbs_compare(keyword="GDP", regions=["北京", "上海"], compareType="region")

// 获取地区代码
cnbs_get_regions(keyword="广东")
```

## 说明

`cnbs_search` 返回的 `value` 字段有值。`cnbs_fetch_series` 返回的 `value` 字段可能为空，这是国家统计局 API 的限制。

只需最新值时，用 `cnbs_search`。

## 分类代码

| 代码 | 分类 |
|------|------|
| 1 | 月度数据 |
| 2 | 季度数据 |
| 3 | 年度数据 |
| 5 | 分省季度 |
| 6 | 分省年度 |
| 7 | 其他 |
| 8 | 主要城市年度 |
| 9 | 港澳台月度 |
| 10 | 港澳台年度 |

## 时间格式

- 年度: `2024YY`, 范围 `["2020YY-2024YY"]`
- 季度: `2024A/B/C/D`, 快捷范围 `LAST6/LAST12/LAST18`
- 月度: `202401MM`, 范围 `["202301MM-202412MM"]`

## 地区代码

地区代码遵循 GB/T 2260 标准。使用 `cnbs_get_regions` 获取完整列表。

示例:
- 北京: `110000000000`
- 上海: `310000000000`
- 广东: `440000000000`

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run build

# 运行
npm run start

# 开发模式
npm run dev
```

## 鉴权配置

默认无需鉴权。可通过 Bearer Token 启用鉴权。

### 本地 / HTTP 模式

```bash
# 命令行参数
npx mcp-cnbs --port 12345 --auth-token your-secret-token

# 环境变量
MCP_CNBS_AUTH_TOKEN=your-secret-token npx mcp-cnbs --port 12345
```

启用鉴权后，请求需包含：
```
Authorization: Bearer your-secret-token
```

### Cloudflare Workers

在 Cloudflare 控制台设置密钥：

```bash
# 部署时设置密钥
npx wrangler secret put MCP_CNBS_AUTH_TOKEN
# 按提示输入 token

# 注意：出于安全考虑，密钥不能在 wrangler.toml 中设置
```

### 带鉴权的 MCP 客户端配置

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

## 环境要求

- Node.js >= 18.0.0
- 网络能访问 `data.stats.gov.cn`

## 许可证

MIT
