import axios from 'axios';
import https from 'https';
import { DataSource } from './api.js';
import { cnbsCacheHub, CacheKeyGenerator } from './cache.js';
import { CnbsErrorHandler, cnbsRequestThrottler, CnbsBoundaryHandler } from './error.js';

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

// 普查数据数据源实现
export class CensusDataSource implements DataSource {
  name = 'census';
  description = '国家统计局普查数据';
  
  private cache = cnbsCacheHub.getCache('census', {
    persistPath: './cache/census.json',
    capacity: 500,
    defaultExpire: 24 * 60 * 60 * 1000
  });

  async fetchData(params: any): Promise<any> {
    const { type, year, region } = params;
    const cacheKey = CacheKeyGenerator.generateDataSourceKey('census', {
      type: type || 'population',
      year: year || '2020',
      region: region || '全国'
    });
    
    const cached = this.cache.fetch(cacheKey);
    if (cached) {
      return cached as any[];
    }

    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        // 这里实现具体的普查数据API调用
        // 暂时返回模拟数据
        const mockData = {
          type: type || 'population',
          year: year || '2020',
          region: region || '全国',
          data: {
            totalPopulation: '1411780000',
            malePopulation: '723340000',
            femalePopulation: '688440000',
            urbanPopulation: '902000000',
            ruralPopulation: '509780000'
          }
        };

        this.cache.store(cacheKey, mockData);
        return mockData;
      });
    });
  }
  
  async getCategories(): Promise<any[]> {
    const cacheKey = CacheKeyGenerator.generateDataSourceKey('census', { action: 'categories' });
    const cached = this.cache.fetch(cacheKey);
    if (cached) {
      return cached as any[];
    }

    // 普查数据分类
    const categories = [
      { id: 'population', name: '人口普查', years: ['2020', '2010', '2000'] },
      { id: 'economic', name: '经济普查', years: ['2023', '2018', '2013'] },
      { id: 'agriculture', name: '农业普查', years: ['2026', '2020', '2016'] }
    ];

    this.cache.store(cacheKey, categories);
    return categories;
  }
  
  async search(keyword: string): Promise<any> {
    const categories = await this.getCategories();
    const results = CnbsBoundaryHandler.safeFilter(categories, cat => 
      CnbsBoundaryHandler.safePropertyAccess(cat, 'name', '').includes(keyword) || 
      CnbsBoundaryHandler.safePropertyAccess(cat, 'id', '').includes(keyword)
    );

    return {
      keyword,
      results
    };
  }
  
  // 批量获取普查数据
  async batchFetchData(paramsList: any[]): Promise<Array<{
    params: any;
    result: any;
    error?: string;
  }>> {
    const results = [];
    
    for (const params of paramsList) {
      try {
        const result = await this.fetchData(params);
        results.push({ params, result });
      } catch (error) {
        results.push({ 
          params, 
          result: null, 
          error: (error as Error).message 
        });
      }
    }
    
    return results;
  }
}

// 国际数据数据源实现
export class InternationalDataSource implements DataSource {
  name = 'international';
  description = '国际统计数据';
  
  private cache = cnbsCacheHub.getCache('international', {
    persistPath: './cache/international.json',
    capacity: 1000,
    defaultExpire: 48 * 60 * 60 * 1000
  });

  async fetchData(params: any): Promise<any> {
    const { source, indicator, country, years } = params;
    const cacheKey = CacheKeyGenerator.generateDataSourceKey('international', {
      source: source || 'world_bank',
      indicator: indicator || 'GDP',
      country: country || 'CHN',
      years: years?.join('_') || 'latest'
    });
    
    const cached = this.cache.fetch(cacheKey);
    if (cached) {
      return cached as any[];
    }

    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        // 这里实现具体的国际数据API调用
        // 暂时返回模拟数据
        const mockData = {
          source: source || 'world_bank',
          indicator: indicator || 'GDP',
          country: country || 'CHN',
          years: years || ['2023', '2022', '2021'],
          data: {
            '2023': '179631.6',
            '2022': '172342.3',
            '2021': '164103.3'
          },
          unit: '亿美元'
        };

        this.cache.store(cacheKey, mockData);
        return mockData;
      });
    });
  }
  
  async getCategories(): Promise<any[]> {
    const cacheKey = CacheKeyGenerator.generateDataSourceKey('international', { action: 'categories' });
    const cached = this.cache.fetch(cacheKey);
    if (cached) {
      return cached as any[];
    }

    // 国际数据分类
    const categories = [
      {
        id: 'world_bank',
        name: '世界银行',
        indicators: ['GDP', 'CPI', 'Unemployment', 'Population']
      },
      {
        id: 'imf',
        name: '国际货币基金组织',
        indicators: ['GDP', 'Inflation', 'Exchange Rate', 'Reserves']
      },
      {
        id: 'oecd',
        name: '经济合作与发展组织',
        indicators: ['GDP', 'Employment', 'Education', 'Health']
      }
    ];

    this.cache.store(cacheKey, categories);
    return categories;
  }
  
  async search(keyword: string): Promise<any> {
    const categories = await this.getCategories();
    const results = [];

    for (const source of categories) {
      const indicators = CnbsBoundaryHandler.safePropertyAccess(source, 'indicators', []);
      const matchingIndicators = CnbsBoundaryHandler.safeFilter(indicators, ind => 
        CnbsBoundaryHandler.safePropertyAccess(ind, 'name', '').toLowerCase().includes(keyword.toLowerCase())
      );
      if (matchingIndicators.length > 0 || CnbsBoundaryHandler.safePropertyAccess(source, 'name', '').includes(keyword)) {
        results.push({
          source: CnbsBoundaryHandler.safePropertyAccess(source, 'name', ''),
          indicators: matchingIndicators
        });
      }
    }

    return {
      keyword,
      results
    };
  }
  
  // 批量获取国际数据
  async batchFetchData(paramsList: any[]): Promise<Array<{
    params: any;
    result: any;
    error?: string;
  }>> {
    const results = [];
    
    for (const params of paramsList) {
      try {
        const result = await this.fetchData(params);
        results.push({ params, result });
      } catch (error) {
        results.push({ 
          params, 
          result: null, 
          error: (error as Error).message 
        });
      }
    }
    
    return results;
  }
}

// 部门数据数据源实现
export class DepartmentDataSource implements DataSource {
  name = 'department';
  description = '各部门统计数据';
  
  private cache = cnbsCacheHub.getCache('department', {
    persistPath: './cache/department.json',
    capacity: 800,
    defaultExpire: 24 * 60 * 60 * 1000
  });

  async fetchData(params: any): Promise<any> {
    const { department, indicator, period } = params;
    const cacheKey = CacheKeyGenerator.generateDataSourceKey('department', {
      department: department || 'finance',
      indicator: indicator || 'fiscal_revenue',
      period: period || 'latest'
    });
    
    const cached = this.cache.fetch(cacheKey);
    if (cached) {
      return cached as any[];
    }

    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        // 这里实现具体的部门数据API调用
        // 暂时返回模拟数据
        const mockData = {
          department: department || 'finance',
          indicator: indicator || 'fiscal_revenue',
          period: period || '2024Q1',
          value: '62131.7',
          unit: '亿元',
          yoyGrowth: '5.1'
        };

        this.cache.store(cacheKey, mockData);
        return mockData;
      });
    });
  }
  
  async getCategories(): Promise<any[]> {
    const cacheKey = CacheKeyGenerator.generateDataSourceKey('department', { action: 'categories' });
    const cached = this.cache.fetch(cacheKey);
    if (cached) {
      return cached as any[];
    }

    // 部门数据分类
    const categories = [
      {
        id: 'finance',
        name: '财政部',
        indicators: ['财政收入', '财政支出', '国债余额', '税收收入']
      },
      {
        id: 'industry',
        name: '工业和信息化部',
        indicators: ['工业增加值', '固定资产投资', '制造业PMI', '高技术产业增加值']
      },
      {
        id: 'trade',
        name: '商务部',
        indicators: ['进出口总额', '出口额', '进口额', '实际利用外资']
      },
      {
        id: 'agriculture',
        name: '农业农村部',
        indicators: ['粮食产量', '农产品价格', '农机总动力', '农村居民人均可支配收入']
      }
    ];

    this.cache.store(cacheKey, categories);
    return categories;
  }
  
  async search(keyword: string): Promise<any> {
    const categories = await this.getCategories();
    const results = [];

    for (const dept of categories) {
      const indicators = CnbsBoundaryHandler.safePropertyAccess(dept, 'indicators', []);
      const matchingIndicators = CnbsBoundaryHandler.safeFilter(indicators, ind => 
        CnbsBoundaryHandler.safePropertyAccess(ind, 'name', '').includes(keyword)
      );
      if (matchingIndicators.length > 0 || CnbsBoundaryHandler.safePropertyAccess(dept, 'name', '').includes(keyword)) {
        results.push({
          department: CnbsBoundaryHandler.safePropertyAccess(dept, 'name', ''),
          indicators: matchingIndicators
        });
      }
    }

    return {
      keyword,
      results
    };
  }
  
  // 批量获取部门数据
  async batchFetchData(paramsList: any[]): Promise<Array<{
    params: any;
    result: any;
    error?: string;
  }>> {
    const results = [];
    
    for (const params of paramsList) {
      try {
        const result = await this.fetchData(params);
        results.push({ params, result });
      } catch (error) {
        results.push({ 
          params, 
          result: null, 
          error: (error as Error).message 
        });
      }
    }
    
    return results;
  }
}

// 数据源管理器
export class DataSourceManager {
  private sources: Map<string, DataSource> = new Map();

  constructor() {
    this.registerDefaultSources();
  }

  private registerDefaultSources() {
    this.registerSource('census', new CensusDataSource());
    this.registerSource('international', new InternationalDataSource());
    this.registerSource('department', new DepartmentDataSource());
  }

  registerSource(name: string, source: DataSource) {
    this.sources.set(name, source);
  }

  getSource(name: string): DataSource | null {
    return this.sources.get(name) || null;
  }

  listSources(): Array<{
    name: string;
    description: string;
  }> {
    return Array.from(this.sources.entries()).map(([name, source]) => ({
      name,
      description: source.description
    }));
  }

  async fetchData(sourceName: string, params: any): Promise<any> {
    const source = this.getSource(sourceName);
    if (!source) {
      throw new Error(`DataSource ${sourceName} not found`);
    }
    return source.fetchData(params);
  }

  async getCategories(sourceName: string): Promise<any[]> {
    const source = this.getSource(sourceName);
    if (!source) {
      throw new Error(`DataSource ${sourceName} not found`);
    }
    return source.getCategories();
  }

  async search(sourceName: string, keyword: string): Promise<any> {
    const source = this.getSource(sourceName);
    if (!source) {
      throw new Error(`DataSource ${sourceName} not found`);
    }
    return source.search(keyword);
  }

  // 批量获取数据
  async batchFetchData(batchRequests: Array<{
    sourceName: string;
    params: any;
  }>): Promise<Array<{
    sourceName: string;
    params: any;
    result: any;
    error?: string;
  }>> {
    const results = [];
    
    for (const request of batchRequests) {
      try {
        const source = this.getSource(request.sourceName);
        if (!source) {
          results.push({ 
            sourceName: request.sourceName, 
            params: request.params, 
            result: null, 
            error: `DataSource ${request.sourceName} not found` 
          });
          continue;
        }
        
        const result = await source.fetchData(request.params);
        results.push({ 
          sourceName: request.sourceName, 
          params: request.params, 
          result 
        });
      } catch (error) {
        results.push({ 
          sourceName: request.sourceName, 
          params: request.params, 
          result: null, 
          error: (error as Error).message 
        });
      }
    }
    
    return results;
  }

  // 批量获取分类
  async batchGetCategories(sourceNames: string[]): Promise<Array<{
    sourceName: string;
    categories: any[];
    error?: string;
  }>> {
    const results = [];
    
    for (const sourceName of sourceNames) {
      try {
        const categories = await this.getCategories(sourceName);
        results.push({ 
          sourceName, 
          categories 
        });
      } catch (error) {
        results.push({ 
          sourceName, 
          categories: [], 
          error: (error as Error).message 
        });
      }
    }
    
    return results;
  }

  // 批量搜索
  async batchSearch(batchRequests: Array<{
    sourceName: string;
    keyword: string;
  }>): Promise<Array<{
    sourceName: string;
    keyword: string;
    result: any;
    error?: string;
  }>> {
    const results = [];
    
    for (const request of batchRequests) {
      try {
        const result = await this.search(request.sourceName, request.keyword);
        results.push({ 
          sourceName: request.sourceName, 
          keyword: request.keyword, 
          result 
        });
      } catch (error) {
        results.push({ 
          sourceName: request.sourceName, 
          keyword: request.keyword, 
          result: null, 
          error: (error as Error).message 
        });
      }
    }
    
    return results;
  }
}

// 导出全局数据源管理器
export const dataSourceManager = new DataSourceManager();
