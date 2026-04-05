import axios from 'axios';
import https from 'https';
import { cnbsCacheHub } from './cache.js';
import { CnbsErrorHandler, cnbsRequestThrottler } from './error.js';

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
import {
  CNBS_API_BASE,
  CNBS_NODE_CACHE_TTL,
  CNBS_METRIC_CACHE_TTL,
  CNBS_DATA_CACHE_TTL,
  CNBS_DEFAULT_ROOT
} from '../constants.js';
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
} from '../types/index.js';

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
    return result.results.map(item => {
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
    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        const url = new URL(`${this.baseUrl}/query`);
        url.searchParams.set('search', params.keyword);
        url.searchParams.set('pagenum', (params.pageNum || 1).toString());
        url.searchParams.set('pageSize', (params.pageSize || 10).toString());

        console.error(`Search Request: ${url.toString()}`);

        const response = await axios.get(url.toString(), {
          ...axiosConfig,
          timeout: this.timeout,
        });

        console.error(`Response status:`, response.status);
        return response.data;
      });
    });
  }

  async batchFindItems(keywords: string[], pageSize: number = 5): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    
    for (const keyword of keywords) {
      try {
        const result = await this.findItems({ keyword, pageSize });
        results[keyword] = result;
      } catch (error) {
        results[keyword] = { error: (error as Error).message };
      }
    }
    
    return results;
  }

  async fetchNodes(params: CnbsNodeQuery): Promise<any> {
    const cacheKey = `node_${params.category}_${params.parentId || 'root'}`;
    const cached = this.nodeCache.fetch(cacheKey);
    if (cached) {
      console.error(`Node cache hit for ${cacheKey}`);
      return cached;
    }

    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        const url = new URL(`${this.baseUrl}/new/queryIndexTreeAsync`);
        if (params.parentId) {
          url.searchParams.set('pid', params.parentId);
        }
        url.searchParams.set('code', params.category);

        console.error(`Node Request: ${url.toString()}`);

        const response = await axios.get(url.toString(), {
          ...axiosConfig,
          timeout: this.timeout,
        });

        this.nodeCache.store(cacheKey, response.data, CNBS_NODE_CACHE_TTL);

        return response.data;
      });
    });
  }

  async fetchAllEndNodes(category: CnbsCategory): Promise<any[]> {
    const allEnds: any[] = [];

    const fetchRecursively = async (parentId?: string) => {
      try {
        await new Promise(resolve => setTimeout(resolve, 300));

        const response = await this.fetchNodes({ parentId, category });
        const nodes = response.data || [];

        for (const node of nodes) {
          if (node.isLeaf) {
            allEnds.push(node);
          } else {
            await fetchRecursively(node._id);
          }
        }
      } catch (error) {
        console.error(`Error in recursive node traversal for parentId=${parentId}:`, error);
        throw error;
      }
    };

    await fetchRecursively();
    return allEnds;
  }

  async fetchMetrics(params: CnbsMetricQuery): Promise<any> {
    const cacheKey = `metric_${params.setId}`;
    const cached = this.metricCache.fetch(cacheKey);
    if (cached) {
      console.error(`Metric cache hit for ${cacheKey}`);
      return cached;
    }

    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        const url = new URL(`${this.baseUrl}/new/queryIndicatorsByCid`);
        url.searchParams.set('cid', params.setId);
        if (params.dataType) {
          url.searchParams.set('dt', params.dataType);
        }
        if (params.name) {
          url.searchParams.set('name', params.name);
        }

        console.error(`Metric Request: ${url.toString()}`);

        const response = await axios.get(url.toString(), {
          ...axiosConfig,
          timeout: this.timeout,
        });

        this.metricCache.store(cacheKey, response.data, CNBS_METRIC_CACHE_TTL);

        return response.data;
      });
    });
  }
        
  async fetchSeries(params: CnbsSeriesQuery): Promise<any> {
    const cacheKey = `series_${params.setId}_${params.metricIds.join('_')}_${params.periods.join('_')}_${params.areas?.map(a => a.code).join('_') || '000000000000'}`;

    const cachedData = this.seriesCache.fetch(cacheKey);
    if (cachedData) {
      console.error(`Series cache hit for ${cacheKey}`);
      return cachedData;
    }

    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        const payload = {
          cid: params.setId,
          indicatorIds: params.metricIds,
          das: params.areas,
          dts: params.periods,
          showType: params.displayMode || '1',
          rootId: params.rootId || this.rootId,
        };

        console.error(`Series Request: ${this.baseUrl}/getEsDataByCidAndDt`);
        console.error(`Payload:`, JSON.stringify(payload, null, 2));

        const response = await axios.post(
          `${this.baseUrl}/getEsDataByCidAndDt`,
          payload,
          {
            ...axiosConfig,
            timeout: this.timeout,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        this.seriesCache.store(cacheKey, response.data, CNBS_DATA_CACHE_TTL);

        return response.data;
      });
    });
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
}
