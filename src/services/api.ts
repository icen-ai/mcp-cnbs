import axios from 'axios';
import https from 'https';
import { cnbsCacheHub, CacheKeyGenerator } from './cache';
import { CnbsErrorHandler, CnbsErrorType, cnbsRequestThrottler, CnbsBoundaryHandler } from './error';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
});

const axiosConfig = {
  httpsAgent,
  timeout: 30000,
  maxRedirects: 5,
  proxy: false as const,
};

function truncateSnippet(value: unknown, maxLength: number = 240): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function looksLikeHtmlPayload(data: unknown): boolean {
  if (typeof data !== 'string') {
    return false;
  }

  const sample = data.trim().slice(0, 256).toLowerCase();
  return sample.startsWith('<!doctype html') || sample.startsWith('<html') || sample.includes('<script');
}

function looksLikeWafChallenge(data: unknown, headers: Record<string, unknown>): boolean {
  const snippet = typeof data === 'string' ? data.toLowerCase() : '';
  return Boolean(
    headers['wzws-ray'] ||
    snippet.includes('please enable javascript and refresh the page') ||
    snippet.includes('waf') ||
    snippet.includes('challenge')
  );
}

function validateCnbsApiResponse(
  endpoint: string,
  response: { status: number; headers: Record<string, unknown>; data: unknown }
): void {
  const contentType = String(response.headers['content-type'] || '');
  const rawSnippet = truncateSnippet(response.data);

  if (contentType.includes('text/html') || looksLikeHtmlPayload(response.data)) {
    const blockedByWaf = looksLikeWafChallenge(response.data, response.headers);
    throw CnbsErrorHandler.createServiceError({
      type: blockedByWaf ? CnbsErrorType.ACCESS_BLOCKED : CnbsErrorType.API_FAILURE,
      message: blockedByWaf
        ? 'CNBS upstream returned an anti-bot or browser challenge page instead of JSON data.'
        : 'CNBS upstream returned HTML instead of the expected JSON payload.',
      canRetry: false,
      endpoint,
      status: response.status,
      contentType,
      rawSnippet,
      hints: blockedByWaf
        ? [
            'This endpoint appears to be protected by WAF or anti-bot logic.',
            'Calls that depend on CNBS search may fail until the upstream service allows server-side access.'
          ]
        : ['The upstream response format changed or the request was redirected to a non-API page.'],
    });
  }
}

import {
  CNBS_API_BASE,
  CNBS_NODE_CACHE_TTL,
  CNBS_METRIC_CACHE_TTL,
  CNBS_DATA_CACHE_TTL,
  CNBS_DEFAULT_ROOT
} from '../constants';
import {
  CnbsSeriesQuery,
  CnbsNodeQuery,
  CnbsMetricQuery,
  CnbsSearchQuery,
  CnbsCategory,
  CnbsClientConfig,
  LegacyApiResponse,
  LegacySearchResult,
  LegacyParsedResult,
  LegacyCategoryResponse,
  LegacyPeriodResponse,
  CnbsDataSyncOptions,
  CnbsSyncResult
} from '../types/index';

// 数据同步状态管理
class DataSyncManager {
  private syncStatus: Map<string, {
    lastSync: number;
    status: 'idle' | 'syncing' | 'completed' | 'failed';
    error?: string;
  }> = new Map();

  getSyncStatus(key: string) {
    return this.syncStatus.get(key);
  }

  setSyncStatus(key: string, status: 'idle' | 'syncing' | 'completed' | 'failed', error?: string) {
    this.syncStatus.set(key, {
      lastSync: Date.now(),
      status,
      error
    });
  }

  isSyncNeeded(key: string, minInterval: number = 3600000) {
    const status = this.syncStatus.get(key);
    if (!status) return true;
    return Date.now() - status.lastSync > minInterval;
  }
}

const dataSyncManager = new DataSyncManager();

export class CnbsLegacyClient {
  private baseUrl = 'https://data.stats.gov.cn';
  private codeMap: Record<string, string> = {
    'B01': 'hgjd',
    'C01': 'hgnd',
  };

  async find(keyword: string, db: string = '', page: number = 0): Promise<LegacySearchResult> {
    const params = {
      s: keyword,
      m: 'searchdata',
      db,
      p: page.toString(),
    };

    console.error(`GET Request URL (base): ${this.baseUrl}/search.htm with params:`, JSON.stringify(params));

    try {
      const response = await axios.get<LegacySearchResult>(`${this.baseUrl}/search.htm`, { params, ...axiosConfig });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API search request failed: ${error.response?.data || error.message}`);
      }
      throw new Error(`Request failed: ${error}`);
    }
  }

  processFindResult(result: LegacySearchResult): LegacyParsedResult[] {
    return result.results.map((item: { report: string; metric: any; data: any; period: any; db: any; }) => {
      const reportParams = Object.fromEntries(
        item.report.split('&').map(p => {
          const [key, value] = p.split('=');
          return [key, value] as [string, string];
        })
      );

      const cnCode = reportParams.cn || 'B01';
      const dbCode = this.codeMap[cnCode] || 'hgjd';

      return {
        title: item.metric,
        value: item.data,
        period: item.period,
        db: item.db,
        metricCode: reportParams.zb || '',
        cnCode,
        dbCode,
        periodCode: reportParams.sj || ''
      };
    });
  }

  async fetchCategories(dbCode: string, dimCode: string = 'zb'): Promise<LegacyCategoryResponse> {
    const params = {
      m: 'getTree',
      id: 'zb',
      dbcode: dbCode,
      wdcode: dimCode
    };

    console.error(`POST Request URL: ${this.baseUrl}/easyquery.htm`);
    console.error(`POST Request Body:`, JSON.stringify(params));

    try {
      const response = await axios.post<LegacyCategoryResponse>(`${this.baseUrl}/easyquery.htm`, new URLSearchParams(params), axiosConfig);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API category request failed: ${error.response?.data || error.message}`);
      }
      throw new Error(`Request failed: ${error}`);
    }
  }

  async fetchEndNodes(dbCode: string): Promise<LegacyCategoryResponse> {
    let allEnds: LegacyCategoryResponse = [];

    const fetchRecursively = async (nodeId: string) => {
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          await new Promise(resolve => setTimeout(resolve, 200));

          const categoryResp = await this.fetchSpecificNode(nodeId, dbCode);

          for (const node of categoryResp) {
            if (!node.hasChildren) {
              allEnds.push(node);
            } else {
              await fetchRecursively(node.id);
            }
          }
          return;
        } catch (error) {
          attempts++;
          console.error(`Category request failed for node ${nodeId}, attempt ${attempts}/${maxAttempts}.`);
          if (attempts >= maxAttempts) {
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    };

    await fetchRecursively('zb');
    return allEnds;
  }

  private async fetchSpecificNode(id: string, dbCode: string, dimCode: string = 'zb'): Promise<LegacyCategoryResponse> {
    const params = {
      m: 'getTree',
      id,
      dbcode: dbCode,
      wdcode: dimCode
    };

    console.error(`POST Request URL: ${this.baseUrl}/easyquery.htm`);
    console.error(`POST Request Body:`, JSON.stringify(params));

    try {
      const response = await axios.post<LegacyCategoryResponse>(`${this.baseUrl}/easyquery.htm`, new URLSearchParams(params), axiosConfig);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API getTree request failed: ${error.response?.data || error.message}`);
      }
      throw new Error(`Request failed: ${error}`);
    }
  }

  async fetchPeriodOptions(dbCode: string): Promise<LegacyPeriodResponse> {
    const dims = '[]';

    const params = {
      m: 'getOtherWds',
      dbcode: dbCode,
      rowcode: 'zb',
      colcode: 'sj',
      wds: dims,
      k1: Date.now(),
      h: 1
    };

    console.error(`GET Request URL: ${this.baseUrl}/easyquery.htm with params:`, JSON.stringify(params));

    try {
      const response = await axios.get<LegacyPeriodResponse>(`${this.baseUrl}/easyquery.htm`, { params, ...axiosConfig });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API time dimension request failed: ${error.response?.data || error.message}`);
      }
      throw new Error(`Request failed: ${error}`);
    }
  }

  async fetchData(metricCode: string, dbCode: string, period: string = 'LAST30'): Promise<LegacyApiResponse> {
    const dims = JSON.stringify([{ "wdcode": "zb", "valuecode": metricCode }]);
    const filterDims = JSON.stringify([{ "wdcode": "sj", "valuecode": period }]);

    const params = {
      m: 'QueryData',
      dbcode: dbCode,
      rowcode: 'zb',
      colcode: 'sj',
      wds: dims,
      dfwds: filterDims,
      k1: Date.now(),
      h: 1
    };

    console.error(`GET Request URL: ${this.baseUrl}/easyquery.htm with params:`, JSON.stringify(params));

    try {
      const response = await axios.get<LegacyApiResponse>(`${this.baseUrl}/easyquery.htm`, { params, ...axiosConfig });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`API query data request failed: ${error.response?.data || error.message}`);
      }
      throw new Error(`Request failed: ${error}`);
    }
  }

  async batchFetch(queries: Array<{ metricCode: string; dbCode: string; period: string }>): Promise<Array<{
    query: { metricCode: string; dbCode: string; period: string };
    result: LegacyApiResponse | null;
    error?: string;
  }>> {
    const results = [];

    for (const query of queries) {
      try {
        const result = await this.fetchData(query.metricCode, query.dbCode, query.period);
        results.push({
          query,
          result,
          error: undefined
        });
      } catch (error) {
        results.push({
          query,
          result: null,
          error: (error as Error).message
        });
      }
    }

    return results;
  }
}

export class CnbsModernClient {
  private baseUrl: string;
  private timeout: number;
  private rootId: string;

  private nodeCache: any;
  private metricCache: any;
  private seriesCache: any;

  constructor(config?: CnbsClientConfig) {
    this.baseUrl = config?.baseUrl || CNBS_API_BASE;
    this.timeout = config?.timeout || 30000;
    this.rootId = config?.rootId || CNBS_DEFAULT_ROOT;

    this.nodeCache = cnbsCacheHub.getCache('node', {
      persistPath: './cache/node.json',
      capacity: 500,
      defaultExpire: CNBS_NODE_CACHE_TTL
    });

    this.metricCache = cnbsCacheHub.getCache('metric', {
      persistPath: './cache/metric.json',
      capacity: 1000,
      defaultExpire: CNBS_METRIC_CACHE_TTL
    });

    this.seriesCache = cnbsCacheHub.getCache('series', {
      persistPath: './cache/series.json',
      capacity: 2000,
      defaultExpire: CNBS_DATA_CACHE_TTL
    });
  }

  async findItems(params: CnbsSearchQuery): Promise<any> {
    const cacheKey = CacheKeyGenerator.generateSearchKey(
      params.keyword,
      params.pageNum || 1,
      params.pageSize || 10,
    );
    return this.nodeCache.fetchOrLoad(
      cacheKey,
      () => cnbsRequestThrottler.execute(() =>
        CnbsErrorHandler.retryWithBackoff(async () => {
          const url = new URL(`${this.baseUrl}/query`);
          url.searchParams.set('search', params.keyword);
          url.searchParams.set('pagenum', (params.pageNum || 1).toString());
          url.searchParams.set('pageSize', (params.pageSize || 10).toString());
          console.error(`Search Request: ${url.toString()}`);
          const response = await axios.get(url.toString(), { ...axiosConfig, timeout: this.timeout });
          validateCnbsApiResponse(url.toString(), response);
          console.error(`Response status:`, response.status);
          return response.data;
        }),
      ),
      CNBS_NODE_CACHE_TTL,
      5 * 60 * 1000, // 5 min stale grace
    );
  }

  async batchFindItems(keywords: string[], pageSize: number = 5): Promise<Record<string, any>> {
    const entries = await Promise.all(
      keywords.map(async (keyword) => {
        try {
          const result = await this.findItems({ keyword, pageSize });
          return [keyword, result] as const;
        } catch (error) {
          return [keyword, { error: (error as Error).message }] as const;
        }
      }),
    );
    return Object.fromEntries(entries);
  }

  async fetchNodes(params: CnbsNodeQuery): Promise<any> {
    const cacheKey = CacheKeyGenerator.generateNodeKey(params.category, params.parentId);
    return this.nodeCache.fetchOrLoad(
      cacheKey,
      () => cnbsRequestThrottler.execute(() =>
        CnbsErrorHandler.retryWithBackoff(async () => {
          const url = new URL(`${this.baseUrl}/new/queryIndexTreeAsync`);
          if (params.parentId) url.searchParams.set('pid', params.parentId);
          url.searchParams.set('code', params.category);
          console.error(`Node Request: ${url.toString()}`);
          const response = await axios.get(url.toString(), { ...axiosConfig, timeout: this.timeout });
          validateCnbsApiResponse(url.toString(), response);
          return response.data;
        }),
      ),
      CNBS_NODE_CACHE_TTL,
      30 * 60 * 1000, // 30 min stale grace for structural data
    );
  }

  async fetchAllEndNodes(category: CnbsCategory): Promise<any[]> {
    const allEnds: any[] = [];

    const fetchRecursively = async (parentId?: string) => {
      try {
        await new Promise(resolve => setTimeout(resolve, 200)); // 减少请求间隔

        const response = await this.fetchNodes({ parentId, category });
        const nodes = CnbsBoundaryHandler.safePropertyAccess(response, 'data', []);

        for (const node of nodes) {
          if ((node as any).isLeaf) {
            allEnds.push(node);
          } else {
            await fetchRecursively((node as any)._id);
          }
        }
      } catch (error) {
        console.error(`Error in recursive node traversal for parentId=${parentId}:`, error);
        // 继续执行，不中断整个流程
      }
    };

    await fetchRecursively();
    return allEnds;
  }

  async fetchMetrics(params: CnbsMetricQuery): Promise<any> {
    const cacheKey = CacheKeyGenerator.generateMetricKey(params.setId, params.name);
    return this.metricCache.fetchOrLoad(
      cacheKey,
      () => cnbsRequestThrottler.execute(() =>
        CnbsErrorHandler.retryWithBackoff(async () => {
          const url = new URL(`${this.baseUrl}/new/queryIndicatorsByCid`);
          url.searchParams.set('cid', params.setId);
          if (params.dataType) url.searchParams.set('dt', params.dataType);
          if (params.name) url.searchParams.set('name', params.name);
          console.error(`Metric Request: ${url.toString()}`);
          const response = await axios.get(url.toString(), { ...axiosConfig, timeout: this.timeout });
          validateCnbsApiResponse(url.toString(), response);
          return response.data;
        }),
      ),
      CNBS_METRIC_CACHE_TTL,
      15 * 60 * 1000, // 15 min stale grace
    );
  }

  async fetchSeries(params: CnbsSeriesQuery): Promise<any> {
    const cacheKey = CacheKeyGenerator.generateSeriesKey(
      params.setId, params.metricIds, params.periods, params.areas,
    );
    return this.seriesCache.fetchOrLoad(
      cacheKey,
      () => cnbsRequestThrottler.execute(() =>
        CnbsErrorHandler.retryWithBackoff(async () => {
          const payload = {
            cid: params.setId,
            indicatorIds: params.metricIds,
            das: params.areas || [{ text: '全国', code: '000000000000' }],
            dts: params.periods,
            showType: params.displayMode || '1',
            rootId: params.rootId || this.rootId,
          };
          console.error(`Series Request: ${this.baseUrl}/getEsDataByCidAndDt`);
          console.error(`Payload:`, JSON.stringify(payload, null, 2));
          const response = await axios.post(
            `${this.baseUrl}/getEsDataByCidAndDt`, payload,
            { ...axiosConfig, timeout: this.timeout, headers: { 'Content-Type': 'application/json' } },
          );
          validateCnbsApiResponse(`${this.baseUrl}/getEsDataByCidAndDt`, response);
          return response.data;
        }),
      ),
      CNBS_DATA_CACHE_TTL,
      10 * 60 * 1000, // 10 min stale grace
    );
  }

  // 批量获取数据系列
  async batchFetchSeries(queries: CnbsSeriesQuery[]): Promise<Array<{
    query: CnbsSeriesQuery;
    result: any;
    error?: string;
  }>> {
    const results = [];
    
    for (const query of queries) {
      try {
        const result = await this.fetchSeries(query);
        results.push({ query, result });
      } catch (error) {
        results.push({ 
          query, 
          result: null, 
          error: (error as Error).message 
        });
      }
    }
    
    return results;
  }

  async findAndFetch(
    keyword: string,
    metricName?: string,
    startPeriod?: string,
    endPeriod?: string
  ): Promise<any> {
    const searchResponse = await this.findItems({ keyword, pageSize: 10 });

    const searchResults = searchResponse?.data || [];
    if (!searchResults || searchResults.length === 0) {
      throw new Error(`No results found for keyword: ${keyword}`);
    }

    const target = searchResults.reduce((latest: any, current: any) => {
      if (!latest.dt) return current;
      if (!current.dt) return latest;
      return current.dt > latest.dt ? current : latest;
    });

    const setId = target.cid || this.extractSetIdFromGlobalRef(target.treeinfo_globalid);

    if (!setId) {
      throw new Error('Failed to extract setId from search result');
    }

    const metricsResponse = await this.fetchMetrics({ setId });
    const metrics = metricsResponse?.data?.list || [];

    if (!metrics || metrics.length === 0) {
      throw new Error(`No metrics found for setId: ${setId}`);
    }

    let targetMetric: any;
    if (metricName) {
      targetMetric = metrics.find((m: any) =>
        m.i_showname?.includes(metricName)
      );
    } else {
      targetMetric = metrics[0];
    }

    if (!targetMetric) {
      throw new Error(`Metric not found: ${metricName}`);
    }

    const periodRange = startPeriod && endPeriod
      ? `${startPeriod}-${endPeriod}`
      : `${target.dt || '202001'}MM-${target.dt || '202612'}MM`;

    const series = await this.fetchSeries({
      setId,
      metricIds: [targetMetric._id],
      areas: [{ text: '全国', code: '000000000000' }],
      periods: [periodRange],
    });

    return {
      setId,
      metric: targetMetric,
      series,
    };
  }

  private extractSetIdFromGlobalRef(globalRef?: string): string | null {
    if (!globalRef) return null;
    const parts = globalRef.split('.');
    return parts[parts.length - 1] || null;
  }

  flushAllCaches(): void {
    this.nodeCache.flush();
    this.metricCache.flush();
    this.seriesCache.flush();
  }

  getCacheStats(): any {
    return cnbsCacheHub.getAllStats();
  }

  updateRootId(rootId: string): void {
    this.rootId = rootId;
  }

  fetchRootId(): string {
    return this.rootId;
  }

  // 数据同步方法
  async syncData(options: CnbsDataSyncOptions = {}): Promise<CnbsSyncResult> {
    const { categories = ['1', '2', '3', '5', '6'], forceSync = false } = options;
    const syncResults: CnbsSyncResult['results'] = {};
    let successCount = 0;
    let failedCount = 0;

    for (const category of categories) {
      const syncKey = `category_${category}`;
      
      if (!forceSync && !dataSyncManager.isSyncNeeded(syncKey)) {
        syncResults[category] = {
          status: 'skipped',
          message: 'Sync not needed (recently synced)'
        };
        continue;
      }

      dataSyncManager.setSyncStatus(syncKey, 'syncing');
      
      try {
        // 同步分类节点
        const nodes = await this.fetchAllEndNodes(category as CnbsCategory);
        
        // 为每个叶子节点同步指标
        for (const node of nodes) {
          if (node.isLeaf) {
            try {
              await this.fetchMetrics({ setId: node._id });
            } catch (error) {
              console.error(`Failed to sync metrics for setId ${node._id}:`, error);
            }
          }
        }

        syncResults[category] = {
          status: 'success',
          message: `Synced ${nodes.length} nodes`,
          data: { nodeCount: nodes.length }
        };
        dataSyncManager.setSyncStatus(syncKey, 'completed');
        successCount++;
      } catch (error) {
        const errorMessage = (error as Error).message;
        syncResults[category] = {
          status: 'failed',
          message: errorMessage
        };
        dataSyncManager.setSyncStatus(syncKey, 'failed', errorMessage);
        failedCount++;
      }
    }

    return {
      overallStatus: failedCount > 0 ? 'partial' : 'success',
      successCount,
      failedCount,
      results: syncResults
    };
  }

  // 批量同步时间序列数据
  async syncTimeSeries(setId: string, metricIds: string[], periods: string[], areas: Array<{ text: string; code: string }> = [{ text: '全国', code: '000000000000' }]): Promise<any> {
    try {
      const result = await this.fetchSeries({
        setId,
        metricIds,
        periods,
        areas
      });
      return {
        status: 'success',
        data: result
      };
    } catch (error) {
      return {
        status: 'failed',
        error: (error as Error).message
      };
    }
  }

  // 获取同步状态
  getSyncStatus(category?: string): any {
    if (category) {
      return dataSyncManager.getSyncStatus(`category_${category}`);
    }
    
    // 返回所有分类的同步状态
    const status: Record<string, any> = {};
    ['1', '2', '3', '5', '6'].forEach(cat => {
      status[cat] = dataSyncManager.getSyncStatus(`category_${cat}`);
    });
    return status;
  }

  // 检查数据新鲜度
  async checkDataFreshness(setId: string): Promise<{ isFresh: boolean; lastUpdated: number | null }> {
    const cacheKey = `metric_${setId}`;
    const cached = this.metricCache.fetch(cacheKey);
    
    if (!cached) {
      return { isFresh: false, lastUpdated: null };
    }
    
    const cacheInfo = this.metricCache.getCacheInfo(cacheKey);
    const lastUpdated = cacheInfo?.timestamp || null;
    const isFresh = lastUpdated && (Date.now() - lastUpdated) < CNBS_METRIC_CACHE_TTL;
    
    return { isFresh, lastUpdated };
  }
}

// 扩展数据源接口
export interface DataSource {
  name: string;
  description: string;
  fetchData(params: any): Promise<any>;
  getCategories(): Promise<any[]>;
  search(keyword: string): Promise<any>;
}
