# 国家统计局新版数据接口使用文档

> **基础地址**: `https://data.stats.gov.cn/dg/website/publicrelease/web/external`  
> **鉴权**: 无需鉴权，公开访问  
> **版本**: V2.0 (2026.03.27更新)  
> **特点**: 采用 UUID 标识符，支持时间分片，元数据与数据分离，批量查询效率高。

---

## 目录

- [核心概念](#核心概念)
- [接口概览](#接口详情)
- [接口详解](#接口详解)
- [编码与ID规律](#编码与id规律)
- [使用示例](#使用示例)
- [最佳实践](#最佳实践)

---

## 核心概念

新版 API 摒弃了旧版的层级代码（如 `A0101`），转而使用 **UUID** 作为唯一标识。数据获取遵循 **“树形导航 -> 指标元数据 -> 批量取值”** 的三步走策略。

### 1. 关键标识符

| 标识符 | 全称 | 含义 | 来源接口 |
| :--- | :--- | :--- | :--- |
| **`pid`** | Parent ID | **父节点 ID**。用于在目录树中向下展开。初始请求时为空或根节点 ID。 | `queryIndexTreeAsync` 返回节点的 `_id` |
| **`cid`** | Catalog ID | **数据集 ID**。代表一个**叶子节点**（Leaf Node）。<br>通常对应：**特定指标 + 特定地区 + 特定时间分段**。<br>*注意：同一业务指标因时间分段不同会有多个 `cid`。* | `queryIndexTreeAsync` 返回中 `isLeaf: true` 节点的 `_id` |
| **`indicatorId`** | Indicator ID | **具体指标 ID**。代表数据集中的某一列（如“同比增长”、“累计值”）。 | `queryIndicatorsByCid` 返回列表中的 `_id` |
| **`du`** | Unit ID | **单位 ID**。指向数据单位的唯一标识（如 `%`, `亿元`）。 | `queryIndicatorsByCid` 返回 |

### 2. 时间分片机制 (Time Slicing)

这是新版 API 最显著的特征。**同一个业务指标（如 CPI）会被拆分成多个 `cid`**，通常按 5 年或统计制度变革周期分割。

*   **现象**: 搜索 "CPI" 可能会得到多个 `cid`：
    *   `cid_A`: 2016-2020
    *   `cid_B`: 2021-2025
    *   `cid_C`: 2026-至今
*   **影响**: 获取长期历史数据时，必须**分别请求**这些 `cid`，然后在本地按时间拼接。

### 3. 时间编码格式

在 `getEsDataByCidAndDt` 接口中使用：

*   **月度**: `YYYYMM` (如 `202602`)，后缀 `MM` (如 `202602MM`)
*   **季度**: `YYYYQ` (如 `20254` 表示第四季度)，后缀 `SS` (如 `202504SS`，注意这里 Q4 可能编码为 04)
*   **年度**: `YYYY` (如 `2025`)，后缀 `YY` (如 `2025YY`)
*   **范围**: `Start-End` (如 `202501MM-202602MM`)

---

## 接口概览

| 步骤 | 接口路径 | 方法 | 用途 | 关键入参 |
| :--- | :--- | :--- | :--- | :--- |
| **1. 遍历目录** | `/new/queryIndexTreeAsync` | GET | 获取分类树，找到目标数据集 (`cid`) | `pid`, `code` |
| **2. 获取指标** | `/new/queryIndicatorsByCid` | GET | 获取某数据集下的所有指标列表 (`indicatorId`) | `cid` |
| **3. 查询数据** | `/getEsDataByCidAndDt` | POST | 批量获取具体数值 | `cid`, `indicatorIds`, `dts`, `das` |
| *(可选)* | `/external/query` | GET | 关键词搜索，快速定位 `cid` | `search`, `pagenum` |

---

## 接口详解

### 1. 遍历目录树 (Get Tree)

用于从根节点开始，层层下钻，直到找到 `isLeaf: true` 的节点。

```http
GET /new/queryIndexTreeAsync?pid={parent_id}&code={category_code}
```

**参数**

| 参数 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `pid` | string | ❌ | 父节点 ID。首次请求可为空字符串 `""` 或根节点 ID。 |
| `code` | string | ✅ | 顶级分类代码。常见值：<br>`1`: 月度数据<br>`2`: 季度数据<br>`3`: 年度数据<br>`5`: 分省季度<br>`6`: 分省年度<br>`7`: 其他/普查 |

**响应关键字段**

```json
{
  "data": [
    {
      "_id": "fc982599...",       // <-- 这就是下一层的 pid 或最终的 cid
      "name": "价格指数",
      "isLeaf": false,            // false: 继续用 _id 做 pid 请求; true: _id 即为 cid
      "treeinfo_globalid": "...", // 全局路径 ID，调试用
      "sdate": "2021",            // 起始时间 (仅叶子节点有效)
      "edate": "2025"             // 结束时间 (仅叶子节点有效)
    }
  ],
  "success": true
}
```

**字段说明**

| 字段 | 说明 |
|------|------|
| `_id` | 节点唯一标识。若 `isLeaf=false`，则作为下一次请求的 `pid`；若 `isLeaf=true`，则作为 `cid`。 |
| `isLeaf` | `true`=叶子节点（可查数据），`false`=目录节点（需继续下钻）。 |
| `sdate/edate` | 该数据集覆盖的时间范围，用于判断是否包含所需年份。 |

---

### 2. 获取指标列表 (Get Indicators)

拿到 `cid` 后，查询该数据集包含哪些具体指标。

```http
GET /new/queryIndicatorsByCid?cid={catalog_id}&dt=&name=
```

**参数**

| 参数 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `cid` | string | ✅ | 数据集 ID (来自步骤 1 的叶子节点 `_id`) |
| `dt` | string | ❌ | 时间过滤，通常留空 |
| `name` | string | ❌ | 指标名称过滤，通常留空 |

**响应关键字段**

```json
{
  "data": {
    "list": [
      {
        "_id": "6d249959...",       // <-- 这就是 indicatorId
        "i_showname": "规上工业增加值同比增长 (%) ",
        "i_mark": "统计口径说明...", // 重要：包含计算方法、基期等
        "du": "414774...",          // 单位 ID
        "dp": "11",                 // 精度
        "order": 1
      }
    ]
  }
}
```

**字段说明**

| 字段 | 说明 |
|------|------|
| `_id` | 指标唯一 ID，后续查询数据时必须传入。 |
| `i_showname` | 指标显示名称，含单位。 |
| `i_mark` | **统计口径说明**。非常重要，解释了数据的计算方法和适用范围。 |
| `du` | 单位 ID，需结合其他接口或常识解析（如 `%`）。 |

---

### 3. 查询具体数据 (Get Data)

**核心接口**。支持批量查询多个指标、多个时间点的数据。

```http
POST /getEsDataByCidAndDt
Content-Type: application/json
```

**请求体 (Body)**

```json
{
  "cid": "e2d9463aceae483eb122794e53180bf9", 
  "indicatorIds": [
    "6d249959166b4b07aad922e2aa51097d", 
    "f991aa39485440158f761a71e39b03a1"
  ],
  "das": [
    {
      "text": "全国",
      "value": "000000000000" 
    }
  ],
  "dts": ["202501MM-202602MM"], 
  "showType": "1",
  "rootId": "fc982599aa684be7969d7b90b1bd0e84" 
}
```

**参数说明**

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `cid` | string | 数据集 ID |
| `indicatorIds` | array | 指标 ID 数组 (来自步骤 2) |
| `das` | array | 地区维度。`value`: `000000000000` 代表全国。如果是分省数据，需传入具体省份代码。 |
| `dts` | array | 时间范围数组。格式 `Start-End`。 |
| `rootId` | string | 根节点 ID。通常固定为月度数据的根 ID，可通过第一次树请求获取。 |

**响应结构**

```json
{
  "data": [
    {
      "code": "202602MM", 
      "name": "2026年2月",
      "values": [
        {
          "_id": "6d249959...", 
          "i_showname": "规上工业增加值同比增长 (%) ",
          "value": "5.8", 
          "da_name": "全国",
          "du_name": "%" 
        },
        {
          "_id": "f991aa39...",
          "value": "6.1"
        }
      ]
    },
    {
      "code": "202601MM",
      "name": "2026年1月",
      "values": [ ... ]
    }
  ],
  "success": true
}
```

**注意事项**
*   如果某个月份数据未发布，`values` 可能为空数组 `[]`。
*   返回数据按时间倒序或正序排列，需根据 `code` 自行排序。

---

## 编码与ID规律

由于 ID 均为 UUID，无法通过算法推导，必须通过遍历获取。但存在以下业务规律：

### 1. `cid` 与时间的关系
*   同一类指标（如 CPI），通常会按 `5年` 或 `10年` 切割成不同的 `cid`。
*   检查 `queryIndexTreeAsync` 返回的 `sdate` 和 `edate` 字段，可以判断该 `cid` 覆盖的时间范围。

### 2. `indicatorId` 的稳定性
*   在同一个 `cid` 内，`indicatorId` 是稳定的。
*   **跨 `cid` 不保证稳定**：2021-2025 的 "GDP" 指标 ID 可能与 2026- 的 "GDP" 指标 ID 不同。**建议每个 `cid` 都重新调用 `queryIndicatorsByCid` 获取映射。**

### 3. 地区代码 (`da`)
*   `000000000000`: 全国
*   分省数据的 `cid` 通常位于“分省年度/季度数据”目录下。

### 4. 根节点 ID (`rootId`)
*   月度数据根节点通常为: `fc982599aa684be7969d7b90b1bd0e84`
*   可通过 `GET /new/queryIndexTreeAsync?pid=` (空) 获取第一级节点确认。

---

## 使用示例

### 示例一：搜索定位并获取最新 CPI 数据

> 场景：快速获取最近几个月的全国居民消费价格指数 (CPI)

**Step 1: 关键词搜索定位 `cid`**

```bash
curl "https://data.stats.gov.cn/dg/website/publicrelease/web/external/query?search=CPI&pagenum=1&pageSize=5"
```

*解析*: 在返回结果中寻找 `type_text` 为 "月度数据" 且 `show_name` 包含 "居民消费价格" 的项。假设找到最新时间段 (2026-) 的 `cid` 为 `5c745282...`。

**Step 2: 获取指标 ID**

```bash
curl "https://data.stats.gov.cn/dg/website/publicrelease/web/external/new/queryIndicatorsByCid?cid=5c7452825c7c4dcba391db5ca7f335c5"
```

*解析*: 找到 `i_showname` 为 "居民消费价格指数 (上年同月=100) " 的项，记录其 `_id`，假设为 `ind_cpi_total` (`53180dfb...`)。

**Step 3: 查询数据**

```bash
curl -X POST "https://data.stats.gov.cn/dg/website/publicrelease/web/external/getEsDataByCidAndDt" \
-H "Content-Type: application/json" \
-d '{
  "cid": "5c7452825c7c4dcba391db5ca7f335c5",
  "indicatorIds": ["53180dfb9c14411ba4b762307c85920c"],
  "das": [{"text": "全国", "value": "000000000000"}],
  "dts": ["202601MM-202603MM"],
  "rootId": "fc982599aa684be7969d7b90b1bd0e84"
}'
```

---

### 示例二：遍历树获取所有月度数据 CID (Python)

> 场景：构建本地索引，获取所有可用的月度数据集 ID

```python
import requests
import time
import json

BASE_URL = "https://data.stats.gov.cn/dg/website/publicrelease/web/external"

def get_tree(pid="", code="1"):
    """递归获取树结构，收集所有叶子节点 (cid)"""
    url = f"{BASE_URL}/new/queryIndexTreeAsync"
    params = {"pid": pid, "code": code}
    try:
        resp = requests.get(url, params=params, timeout=10)
        nodes = resp.json().get('data', [])
    except Exception as e:
        print(f"Error fetching tree for pid={pid}: {e}")
        return []

    cids = []
    for node in nodes:
        if node.get('isLeaf'):
            cids.append({
                "name": node['name'],
                "cid": node['_id'],
                "sdate": node.get('sdate'),
                "edate": node.get('edate')
            })
        else:
            # 递归子节点，添加延时避免封禁
            time.sleep(0.5)
            sub_cids = get_tree(pid=node['_id'], code=code)
            cids.extend(sub_cids)
    return cids

# 执行遍历 (慎用，耗时较长)
# all_cids = get_tree(code="1")
# with open('nbs_cids_monthly.json', 'w', encoding='utf-8') as f:
#     json.dump(all_cids, f, ensure_ascii=False, indent=2)
```

---

## 最佳实践

### 1. 优先使用搜索接口定位 `cid`

全量遍历树非常耗时（可能有数千个节点）。如果已知关键词（如 "GDP", "CPI", "人口"），先用 `/external/query` 搜索，从结果中提取相关的 `cid` 或线索，再精准查询。

```
❌ 低效方式：
   从根节点开始递归遍历整棵树，寻找 "GDP"

✅ 高效方式：
   search.htm?s=GDP
   → 从结果中提取 cid 或相关线索
   → 直接调用 queryIndicatorsByCid
```

### 2. 处理“时间分片”

**不要假设一个 `cid` 能查到所有历史数据。**
*   **策略**: 当发现数据缺失（如 `values` 为空）或需要更长历史时，检查相邻的 `cid`（通过树结构查找同级节点，或通过搜索查看是否有其他年份范围的同类指标）。
*   **合并**: 在客户端按时间戳合并不同 `cid` 返回的数据。

### 3. 缓存元数据

*   **树结构 (`queryIndexTreeAsync`)**: 变化极慢，建议本地缓存 24 小时以上。
*   **指标列表 (`queryIndicatorsByCid`)**: 变化较慢，建议按 `cid` 缓存。
*   **数据 (`getEsDataByCidAndDt`)**: 每月更新，建议设置较短缓存或按需请求。

### 4. 批量请求减少 IO

`getEsDataByCidAndDt` 支持 `indicatorIds` 数组。
*   ❌ **错误**: 循环调用接口，每次查 1 个指标。
*   ✅ **正确**: 一次性传入该 `cid` 下所有需要的指标 ID（如 CPI 的总指数、食品、居住等 10 个子类），一次请求拿回所有数据。

### 5. 关注 `i_mark` (统计口径)

在 `queryIndicatorsByCid` 返回的 `i_mark` 字段中，包含了至关重要的统计说明（如“按不变价计算”、“基期为 2020 年”等）。展示数据时务必附带此说明，否则可能导致误读。

### 6. 完整封装示例 (JavaScript/Node.js)

```javascript
class NbsNewClient {
  constructor() {
    this.base = 'https://data.stats.gov.cn/dg/website/publicrelease/web/external';
    this.rootId = 'fc982599aa684be7969d7b90b1bd0e84'; // 月度数据根节点
  }

  // 1. 搜索定位 CID
  async searchCid(keyword) {
    const url = `${this.base}/query?search=${encodeURIComponent(keyword)}&pagenum=1&pageSize=10`;
    const res = await fetch(url);
    const json = await res.json();
    
    // 简单筛选：找第一个匹配的叶子节点或相关提示
    // 实际生产中可能需要更复杂的逻辑来确认正确的 cid
    return json.data?.data?.map(item => ({
      name: item.show_name,
      cid: item.cid || this.extractCidFromGlobalId(item.treeinfo_globalid),
      type: item.type_text
    })) || [];
  }

  // 辅助：从 globalId 提取 cid (最后一段)
  extractCidFromGlobalId(globalId) {
    if (!globalId) return null;
    const parts = globalId.split('.');
    return parts[parts.length - 1];
  }

  // 2. 获取指标列表
  async getIndicators(cid) {
    const url = `${this.base}/new/queryIndicatorsByCid?cid=${cid}`;
    const res = await fetch(url);
    const json = await res.json();
    return json.data?.list || [];
  }

  // 3. 查询数据
  async getData(cid, indicatorIds, startTime, endTime, regionCode = "000000000000") {
    const payload = {
      cid: cid,
      indicatorIds: indicatorIds,
      das: [{ text: "全国", value: regionCode }],
      dts: [`${startTime}-${endTime}`],
      showType: "1",
      rootId: this.rootId
    };

    const res = await fetch(`${this.base}/getEsDataByCidAndDt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    
    if (!json.success) throw new Error(json.message);
    return json.data;
  }
}

// 使用示例
const client = new NbsNewClient();

async function main() {
  // 1. 搜索 CPI
  const results = await client.searchCid("居民消费价格");
  console.log("Found CIDs:", results);
  
  // 假设取第一个结果 (需人工确认是否为最新时间段)
  const targetCid = results[0].cid; 
  
  // 2. 获取指标
  const indicators = await client.getIndicators(targetCid);
  const cpiIndicator = indicators.find(i => i.i_showname.includes("居民消费价格指数 (上年同月=100)"));
  
  if (cpiIndicator) {
    // 3. 获取数据
    const data = await client.getData(
      targetCid, 
      [cpiIndicator._id], 
      "202601MM", 
      "202603MM"
    );
    console.log("CPI Data:", data);
  }
}

main();
```

---

## 接口速查表

| 需求 | 接口 | 关键参数 |
|------|------|---------|
| 关键词找数据集 | `GET /query` | `search`, `pagenum` |
| 浏览分类体系 | `GET /new/queryIndexTreeAsync` | `pid`, `code` |
| 拿指标 ID | `GET /new/queryIndicatorsByCid` | `cid` |
| 查历史时间序列 | `POST /getEsDataByCidAndDt` | `cid`, `indicatorIds`, `dts` |
| 获取根节点 ID | `GET /new/queryIndexTreeAsync?pid=` | `pid` (空) |
