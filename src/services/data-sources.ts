import axios from 'axios';
import https from 'https';
import { DataSource } from './api.js';
import { cnbsCacheHub, CacheKeyGenerator } from './cache.js';
import { CnbsErrorHandler, cnbsRequestThrottler, CnbsBoundaryHandler } from './error.js';
import { CnbsModernClient } from './api.js';

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

// ─────────────────────────────────────────────────────────────
// SDMX-JSON 通用解析器（BIS / OECD 均使用此格式）
// ─────────────────────────────────────────────────────────────
function parseSdmxJson(data: any): Array<{
  period: string;
  value: number | null;
  dimensions: Record<string, string>;
}> {
  const result: Array<{ period: string; value: number | null; dimensions: Record<string, string> }> = [];

  try {
    const structure = data.structure || data.Structure;
    const dataSet = (data.dataSets || data.DataSets)?.[0];
    if (!structure || !dataSet) return result;

    const obsDims: any[] = structure.dimensions?.observation || [];
    const timeDim = obsDims.find((d: any) => d.id === 'TIME_PERIOD');
    const timePeriods: any[] = timeDim?.values || [];

    const seriesDims: any[] = structure.dimensions?.series || [];
    const series = dataSet.series || {};

    for (const [seriesKey, seriesData] of Object.entries(series) as [string, any][]) {
      const keyParts = seriesKey.split(':').map(Number);
      const dimensions: Record<string, string> = {};

      seriesDims.forEach((dim: any, i: number) => {
        const val = dim.values?.[keyParts[i]];
        dimensions[dim.id] = val?.name || val?.id || '';
      });

      const observations = seriesData.observations || {};
      for (const [obsIndex, obsValues] of Object.entries(observations) as [string, any][]) {
        const period = timePeriods[Number(obsIndex)]?.id || timePeriods[Number(obsIndex)] || '';
        const rawVal = Array.isArray(obsValues) ? obsValues[0] : obsValues;
        result.push({
          period,
          value: rawVal !== null && rawVal !== undefined && rawVal !== '' ? Number(rawVal) : null,
          dimensions,
        });
      }
    }
  } catch {
    // 解析失败返回空数组
  }

  return result.sort((a, b) => String(a.period).localeCompare(String(b.period)));
}

// ─────────────────────────────────────────────────────────────
// 1. 世界银行数据源
// API: https://api.worldbank.org/v2
// 完全免费，无需认证
// ─────────────────────────────────────────────────────────────
export class WorldBankDataSource implements DataSource {
  name = 'world_bank';
  description = '世界银行开放数据 (World Bank Open Data)';

  // 常用指标映射
  static readonly INDICATORS: Record<string, { id: string; name: string; unit: string }> = {
    GDP:              { id: 'NY.GDP.MKTP.CD',      name: 'GDP（现价美元）',       unit: '美元' },
    GDP_GROWTH:       { id: 'NY.GDP.MKTP.KD.ZG',   name: 'GDP增速（年）',         unit: '%' },
    GDP_PER_CAPITA:   { id: 'NY.GDP.PCAP.CD',      name: '人均GDP（现价美元）',   unit: '美元' },
    CPI:              { id: 'FP.CPI.TOTL.ZG',      name: 'CPI通胀率（年）',       unit: '%' },
    UNEMPLOYMENT:     { id: 'SL.UEM.TOTL.ZS',      name: '失业率',               unit: '%' },
    POPULATION:       { id: 'SP.POP.TOTL',         name: '总人口',               unit: '人' },
    EXPORTS:          { id: 'NE.EXP.GNFS.CD',      name: '商品和服务出口（美元）', unit: '美元' },
    IMPORTS:          { id: 'NE.IMP.GNFS.CD',      name: '商品和服务进口（美元）', unit: '美元' },
    FDI_INFLOWS:      { id: 'BX.KLT.DINV.CD.WD',   name: '外商直接投资净流入',    unit: '美元' },
    GOVT_DEBT:        { id: 'GC.DOD.TOTL.GD.ZS',   name: '政府债务占GDP比',       unit: '%' },
    GROSS_SAVINGS:    { id: 'NY.GNS.ICTR.ZS',      name: '总储蓄率占GNI比',       unit: '%' },
    TRADE_PCT_GDP:    { id: 'NE.TRD.GNFS.ZS',      name: '贸易占GDP比',          unit: '%' },
    GINI:             { id: 'SI.POV.GINI',          name: '基尼系数',             unit: '' },
    LIFE_EXPECTANCY:  { id: 'SP.DYN.LE00.IN',      name: '预期寿命',             unit: '岁' },
    CO2_EMISSIONS:    { id: 'EN.ATM.CO2E.PC',      name: '人均CO2排放',          unit: '吨' },
    INTERNET_USERS:   { id: 'IT.NET.USER.ZS',      name: '互联网用户占比',        unit: '%' },
    INFLATION:        { id: 'NY.GDP.DEFL.KD.ZG',   name: 'GDP平减指数通胀率',    unit: '%' },
    CURRENT_ACCOUNT:  { id: 'BN.CAB.XOKA.GD.ZS',   name: '经常账户余额占GDP比',  unit: '%' },
  };

  private cache = cnbsCacheHub.getCache('world_bank', {
    persistPath: './cache/world_bank.json',
    capacity: 2000,
    defaultExpire: 24 * 60 * 60 * 1000,
  });

  async fetchData(params: {
    indicator: string;      // 指标名（如 'GDP'）或 WB 指标代码（如 'NY.GDP.MKTP.CD'）
    countries?: string[];   // ISO3 代码数组，如 ['CHN', 'USA']；默认 ['CHN']
    startYear?: number;
    endYear?: number;
    mrv?: number;           // most recent values，最近 N 个值
  }): Promise<any> {
    const resolved = WorldBankDataSource.INDICATORS[params.indicator?.toUpperCase()]
      || { id: params.indicator, name: params.indicator, unit: '' };
    const indicatorId = resolved.id;
    const countries = params.countries?.join(';') || 'CHN';
    const startYear = params.startYear || 2000;
    const endYear = params.endYear || new Date().getFullYear();

    const cacheKey = CacheKeyGenerator.generateDataSourceKey('world_bank', {
      indicator: indicatorId,
      countries,
      startYear,
      endYear,
    });
    const cached = this.cache.fetch(cacheKey);
    if (cached) return cached;

    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        const url = `https://api.worldbank.org/v2/country/${countries}/indicator/${indicatorId}`;
        const response = await axios.get(url, {
          ...axiosConfig,
          params: {
            format: 'json',
            date: `${startYear}:${endYear}`,
            per_page: 200,
            ...(params.mrv ? { mrv: params.mrv } : {}),
          },
        });

        const [meta, dataPoints] = response.data as [any, any[]];
        if (!dataPoints) throw new Error('World Bank API returned empty data');

        const result = {
          source: 'world_bank',
          indicator: { id: indicatorId, name: resolved.name, unit: resolved.unit },
          countries: countries.split(';'),
          meta: {
            total: meta?.total,
            page: meta?.page,
            lastUpdated: meta?.lastupdated,
          },
          data: dataPoints
            .filter(d => d.value !== null)
            .map(d => ({
              country: d.country?.value,
              countryCode: d.countryiso3code || d.country?.id,
              period: d.date,
              value: d.value,
              unit: resolved.unit,
            }))
            .sort((a, b) => String(a.period).localeCompare(String(b.period))),
        };

        this.cache.store(cacheKey, result);
        return result;
      });
    });
  }

  async getCategories(): Promise<any[]> {
    return Object.entries(WorldBankDataSource.INDICATORS).map(([key, val]) => ({
      id: key,
      wbId: val.id,
      name: val.name,
      unit: val.unit,
    }));
  }

  async search(keyword: string): Promise<any> {
    const kw = keyword.toLowerCase();
    const matches = Object.entries(WorldBankDataSource.INDICATORS)
      .filter(([k, v]) =>
        k.toLowerCase().includes(kw) ||
        v.name.toLowerCase().includes(kw) ||
        v.id.toLowerCase().includes(kw)
      )
      .map(([key, val]) => ({ id: key, wbId: val.id, name: val.name, unit: val.unit }));
    return { keyword, source: 'world_bank', results: matches };
  }

  // 批量多国多指标查询
  async fetchMulti(params: {
    indicators: string[];
    countries?: string[];
    startYear?: number;
    endYear?: number;
  }): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    for (const ind of params.indicators) {
      try {
        results[ind] = await this.fetchData({ ...params, indicator: ind });
      } catch (e) {
        results[ind] = { error: (e as Error).message };
      }
    }
    return results;
  }
}

// ─────────────────────────────────────────────────────────────
// 2. 国际货币基金组织 (IMF) 数据源
// API: https://www.imf.org/external/datamapper/api/v1
// 完全免费，无需认证
// ─────────────────────────────────────────────────────────────
export class IMFDataSource implements DataSource {
  name = 'imf';
  description = '国际货币基金组织 (IMF DataMapper)';

  // WEO 数据库常用指标
  static readonly INDICATORS: Record<string, { id: string; name: string; unit: string }> = {
    GDP_GROWTH:        { id: 'NGDP_RPCH',     name: 'GDP实际增速（%）',           unit: '%' },
    GDP_USD:           { id: 'NGDPD',         name: 'GDP（十亿美元）',            unit: '十亿美元' },
    GDP_PER_CAPITA:    { id: 'NGDPDPC',       name: '人均GDP（美元）',            unit: '美元' },
    CPI_INFLATION:     { id: 'PCPIPCH',       name: 'CPI通胀率（%）',            unit: '%' },
    UNEMPLOYMENT:      { id: 'LUR',           name: '失业率（%）',               unit: '%' },
    CURRENT_ACCOUNT:   { id: 'BCA_NGDPD',     name: '经常账户余额占GDP（%）',    unit: '%' },
    GOVT_DEBT:         { id: 'GGXWDG_NGDP',   name: '政府总债务占GDP（%）',      unit: '%' },
    GOVT_BALANCE:      { id: 'GGXONLB_NGDP',  name: '政府净贷款占GDP（%）',      unit: '%' },
    GROSS_SAVINGS:     { id: 'NGSD_NGDP',     name: '总储蓄率占GDP（%）',        unit: '%' },
    INVESTMENT:        { id: 'NID_NGDP',      name: '固定资本形成占GDP（%）',    unit: '%' },
    TRADE_BALANCE:     { id: 'BCA',           name: '经常账户余额（十亿美元）',   unit: '十亿美元' },
    POPULATION:        { id: 'LP',            name: '总人口（百万）',             unit: '百万' },
    OUTPUT_GAP:        { id: 'NGAP_NPGDP',    name: '产出缺口占潜在GDP（%）',    unit: '%' },
    COMMODITY_PRICE:   { id: 'PALLFNFW',      name: '大宗商品价格指数',          unit: '' },
  };

  private cache = cnbsCacheHub.getCache('imf', {
    persistPath: './cache/imf.json',
    capacity: 1000,
    defaultExpire: 12 * 60 * 60 * 1000,
  });

  async fetchData(params: {
    indicator: string;      // 指标名或 IMF 指标 ID
    countries?: string[];   // ISO 代码，如 ['CHN', 'USA', 'JPN']；默认 ['CHN']
    periods?: string[];     // 年份数组，如 ['2020', '2021', '2022']
  }): Promise<any> {
    const resolved = IMFDataSource.INDICATORS[params.indicator?.toUpperCase()]
      || { id: params.indicator, name: params.indicator, unit: '' };
    const indicatorId = resolved.id;
    const countries = params.countries || ['CHN'];

    const cacheKey = CacheKeyGenerator.generateDataSourceKey('imf', {
      indicator: indicatorId,
      countries: countries.join('_'),
    });
    const cached = this.cache.fetch(cacheKey);
    if (cached) return cached;

    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        const countryStr = countries.join(',');
        const url = `https://www.imf.org/external/datamapper/api/v1/${indicatorId}/${countryStr}`;
        const response = await axios.get(url, { ...axiosConfig, params: { periods: 30 } });

        const rawValues = response.data?.values?.[indicatorId] || {};
        const data: any[] = [];

        for (const country of countries) {
          const countryData = rawValues[country] || {};
          for (const [year, value] of Object.entries(countryData)) {
            if (value !== null && value !== undefined) {
              data.push({ country, period: year, value: Number(value), unit: resolved.unit });
            }
          }
        }

        // 过滤指定年份
        const filtered = params.periods
          ? data.filter(d => params.periods!.includes(d.period))
          : data;

        const result = {
          source: 'imf',
          indicator: { id: indicatorId, name: resolved.name, unit: resolved.unit },
          countries,
          data: filtered.sort((a, b) => `${a.country}${a.period}`.localeCompare(`${b.country}${b.period}`)),
        };

        this.cache.store(cacheKey, result);
        return result;
      });
    });
  }

  async getCategories(): Promise<any[]> {
    return Object.entries(IMFDataSource.INDICATORS).map(([key, val]) => ({
      id: key,
      imfId: val.id,
      name: val.name,
      unit: val.unit,
    }));
  }

  async search(keyword: string): Promise<any> {
    const kw = keyword.toLowerCase();
    const matches = Object.entries(IMFDataSource.INDICATORS)
      .filter(([k, v]) =>
        k.toLowerCase().includes(kw) ||
        v.name.toLowerCase().includes(kw) ||
        v.id.toLowerCase().includes(kw)
      )
      .map(([key, val]) => ({ id: key, imfId: val.id, name: val.name }));
    return { keyword, source: 'imf', results: matches };
  }

  // 获取 IMF WEO 指标完整列表
  async listAllIndicators(): Promise<any> {
    const cacheKey = 'imf_indicators_list';
    const cached = this.cache.fetch(cacheKey);
    if (cached) return cached;

    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        const response = await axios.get('https://www.imf.org/external/datamapper/api/v1/indicators', axiosConfig);
        this.cache.store(cacheKey, response.data, 7 * 24 * 60 * 60 * 1000);
        return response.data;
      });
    });
  }
}

// ─────────────────────────────────────────────────────────────
// 3. 经合组织 (OECD) 数据源
// API: https://sdmx.oecd.org/public/rest (SDMX-JSON)
// 完全免费，无需认证
// ─────────────────────────────────────────────────────────────
export class OECDDataSource implements DataSource {
  name = 'oecd';
  description = '经济合作与发展组织 (OECD SDMX REST API)';

  // 预置数据集：dataflowId + 说明
  static readonly DATASETS: Record<string, {
    agencyId: string;
    dataflowId: string;
    name: string;
    description: string;
  }> = {
    QNA_GDP: {
      agencyId: 'OECD.SDD.NAD',
      dataflowId: 'DSD_NAMAIN1@DF_TABLE1_EXPENDITURE',
      name: '季度国民账户 - GDP',
      description: '季度GDP（支出法），各成员国及主要经济体',
    },
    KEI_CPI: {
      agencyId: 'OECD.SDD.STES',
      dataflowId: 'DSD_STES@DF_CLI',
      name: '综合先行指标 (CLI)',
      description: 'OECD 综合先行指标，用于预判经济周期拐点',
    },
    EMPLOYMENT: {
      agencyId: 'OECD.ELS.SAE',
      dataflowId: 'DSD_LFS@DF_IALFS_UNE_M',
      name: '劳动力统计 - 失业',
      description: '月度失业率，LFS 口径',
    },
    TRADE: {
      agencyId: 'OECD.STD.TBS',
      dataflowId: 'DSD_TBS@DF_TRED_GOS',
      name: '商品贸易统计',
      description: 'OECD 成员国商品进出口',
    },
  };

  private cache = cnbsCacheHub.getCache('oecd', {
    persistPath: './cache/oecd.json',
    capacity: 1000,
    defaultExpire: 6 * 60 * 60 * 1000,
  });

  async fetchData(params: {
    dataset: string;         // 预置名如 'QNA_GDP' 或自定义 agencyId+dataflowId
    key?: string;            // SDMX 维度键，如 'Q.G20.B1GQ....V.N'
    agencyId?: string;
    dataflowId?: string;
    startPeriod?: string;
    endPeriod?: string;
    lastNObservations?: number;
  }): Promise<any> {
    const preset = OECDDataSource.DATASETS[params.dataset?.toUpperCase()] || null;
    const agencyId = params.agencyId || preset?.agencyId;
    const dataflowId = params.dataflowId || preset?.dataflowId;

    if (!agencyId || !dataflowId) {
      throw new Error(`未知 OECD 数据集 "${params.dataset}"。可用预置: ${Object.keys(OECDDataSource.DATASETS).join(', ')}`);
    }

    const key = params.key || 'all';
    const cacheKey = CacheKeyGenerator.generateDataSourceKey('oecd', {
      agencyId,
      dataflowId,
      key,
      startPeriod: params.startPeriod || '',
      lastN: params.lastNObservations || 20,
    });
    const cached = this.cache.fetch(cacheKey);
    if (cached) return cached;

    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        const url = `https://sdmx.oecd.org/public/rest/data/${agencyId},${dataflowId}/${key}`;
        const queryParams: Record<string, any> = { format: 'jsondata' };
        if (params.startPeriod) queryParams.startPeriod = params.startPeriod;
        if (params.endPeriod) queryParams.endPeriod = params.endPeriod;
        if (params.lastNObservations) queryParams.lastNObservations = params.lastNObservations;

        const response = await axios.get(url, { ...axiosConfig, params: queryParams });
        const parsed = parseSdmxJson(response.data);

        const result = {
          source: 'oecd',
          dataset: { agencyId, dataflowId, name: preset?.name || dataflowId },
          key,
          count: parsed.length,
          data: parsed,
        };

        this.cache.store(cacheKey, result);
        return result;
      });
    });
  }

  async getCategories(): Promise<any[]> {
    return Object.entries(OECDDataSource.DATASETS).map(([key, val]) => ({
      id: key,
      agencyId: val.agencyId,
      dataflowId: val.dataflowId,
      name: val.name,
      description: val.description,
    }));
  }

  async search(keyword: string): Promise<any> {
    const kw = keyword.toLowerCase();
    const matches = Object.entries(OECDDataSource.DATASETS)
      .filter(([k, v]) =>
        k.toLowerCase().includes(kw) ||
        v.name.toLowerCase().includes(kw) ||
        v.description.toLowerCase().includes(kw)
      )
      .map(([key, val]) => ({
        id: key,
        agencyId: val.agencyId,
        dataflowId: val.dataflowId,
        name: val.name,
        description: val.description,
      }));
    return { keyword, source: 'oecd', results: matches };
  }
}

// ─────────────────────────────────────────────────────────────
// 4. 国际清算银行 (BIS) 数据源
// API: https://stats.bis.org/api/v1 (SDMX-JSON)
// 完全免费，无需认证
// ─────────────────────────────────────────────────────────────
export class BISDataSource implements DataSource {
  name = 'bis';
  description = '国际清算银行 (BIS Statistics)';

  // 常用数据集 / 键模板
  static readonly DATASETS: Record<string, {
    dataflow: string;
    name: string;
    keyTemplate: string;
    description: string;
  }> = {
    EER: {
      dataflow: 'WS_EER',
      name: '有效汇率 (EER)',
      keyTemplate: 'M.N.B.{country}',      // 月度·窄口径·实际
      description: '名义/实际有效汇率，基于 BIS 贸易加权',
    },
    CREDIT_GAP: {
      dataflow: 'WS_CREDIT_GAP',
      name: '信贷缺口',
      keyTemplate: 'Q.{country}',
      description: '私人非金融部门信贷占GDP缺口，BIS早期预警指标',
    },
    TOTAL_CREDIT: {
      dataflow: 'WS_TC',
      name: '私人非金融部门总信贷',
      keyTemplate: 'Q.P.{country}.A.770.A',
      description: '居民私人非金融部门总信贷，占GDP比',
    },
    PROPERTY_PRICES: {
      dataflow: 'WS_SPP',
      name: '住宅房价指数',
      keyTemplate: 'Q.N.{country}',
      description: '名义住宅房价指数（BIS汇编）',
    },
    DEBT_SERVICE: {
      dataflow: 'WS_DSR',
      name: '债务偿还比率 (DSR)',
      keyTemplate: 'Q.{country}.H.A',
      description: '住户部门债务偿还收入比',
    },
    CROSS_BORDER_BANKING: {
      dataflow: 'WS_LBS_D_PUB',
      name: '国际本地银行统计',
      keyTemplate: 'Q.S.B.{country}..A',
      description: 'BIS 汇报行对各国的跨境银行敞口',
    },
  };

  private cache = cnbsCacheHub.getCache('bis', {
    persistPath: './cache/bis.json',
    capacity: 800,
    defaultExpire: 6 * 60 * 60 * 1000,
  });

  async fetchData(params: {
    dataset: string;              // 预置数据集名如 'EER'
    country?: string;             // ISO2 代码，如 'CN'；默认 'CN'
    key?: string;                 // 覆盖 keyTemplate
    lastNObservations?: number;   // 最近 N 期，默认 20
    startPeriod?: string;         // 如 '2015-Q1' 或 '2015-01'
  }): Promise<any> {
    const preset = BISDataSource.DATASETS[params.dataset?.toUpperCase()];
    if (!preset) {
      throw new Error(`未知 BIS 数据集 "${params.dataset}"。可用: ${Object.keys(BISDataSource.DATASETS).join(', ')}`);
    }

    const country = params.country || 'CN';
    const key = params.key || preset.keyTemplate.replace('{country}', country);
    const lastN = params.lastNObservations || 20;

    const cacheKey = CacheKeyGenerator.generateDataSourceKey('bis', {
      dataflow: preset.dataflow,
      key,
      lastN,
    });
    const cached = this.cache.fetch(cacheKey);
    if (cached) return cached;

    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        const url = `https://stats.bis.org/api/v1/data/${preset.dataflow}/${key}`;
        const queryParams: Record<string, any> = {
          format: 'jsondata',
          lastNObservations: lastN,
        };
        if (params.startPeriod) queryParams.startPeriod = params.startPeriod;

        const response = await axios.get(url, { ...axiosConfig, params: queryParams });
        const parsed = parseSdmxJson(response.data);

        const result = {
          source: 'bis',
          dataset: { dataflow: preset.dataflow, name: preset.name, description: preset.description },
          country,
          key,
          count: parsed.length,
          data: parsed,
        };

        this.cache.store(cacheKey, result);
        return result;
      });
    });
  }

  async getCategories(): Promise<any[]> {
    return Object.entries(BISDataSource.DATASETS).map(([key, val]) => ({
      id: key,
      dataflow: val.dataflow,
      name: val.name,
      description: val.description,
      keyTemplate: val.keyTemplate,
    }));
  }

  async search(keyword: string): Promise<any> {
    const kw = keyword.toLowerCase();
    const matches = Object.entries(BISDataSource.DATASETS)
      .filter(([k, v]) =>
        k.toLowerCase().includes(kw) ||
        v.name.toLowerCase().includes(kw) ||
        v.description.toLowerCase().includes(kw)
      )
      .map(([key, val]) => ({ id: key, dataflow: val.dataflow, name: val.name }));
    return { keyword, source: 'bis', results: matches };
  }
}

// ─────────────────────────────────────────────────────────────
// 5. 美联储经济数据库 (FRED)
// API: https://api.stlouisfed.org/fred
// 免费，需 API Key（环境变量 FRED_API_KEY）
// ─────────────────────────────────────────────────────────────
export class FREDDataSource implements DataSource {
  name = 'fred';
  description = '美联储经济数据库 (FRED) - 通过 X-Fred-Api-Key 请求头或 FRED_API_KEY 环境变量提供 API Key';

  private readonly instanceApiKey?: string;

  constructor(apiKey?: string) {
    this.instanceApiKey = apiKey;
  }

  // 常用系列
  static readonly SERIES: Record<string, { id: string; name: string; unit: string; freq: string }> = {
    US_GDP:           { id: 'GDP',             name: '美国GDP（十亿美元，季度）',      unit: '十亿美元', freq: 'Q' },
    US_GDP_GROWTH:    { id: 'A191RL1Q225SBEA', name: '美国GDP实际增速（季）',         unit: '%', freq: 'Q' },
    FED_FUNDS:        { id: 'FEDFUNDS',        name: '联邦基金利率',                 unit: '%', freq: 'M' },
    US_10Y_YIELD:     { id: 'DGS10',           name: '美国10年期国债收益率',          unit: '%', freq: 'D' },
    US_2Y_YIELD:      { id: 'DGS2',            name: '美国2年期国债收益率',           unit: '%', freq: 'D' },
    CNY_USD:          { id: 'DEXCHUS',         name: '人民币兑美元汇率（USD/CNY）',   unit: 'CNY', freq: 'D' },
    EUR_USD:          { id: 'DEXUSEU',         name: '欧元兑美元汇率',               unit: 'USD', freq: 'D' },
    US_UNEMPLOYMENT:  { id: 'UNRATE',          name: '美国失业率',                   unit: '%', freq: 'M' },
    US_CPI:           { id: 'CPIAUCSL',        name: '美国CPI（城市，季调）',         unit: '1982-84=100', freq: 'M' },
    US_CPI_YOY:       { id: 'CPIAUCSL',        name: '美国CPI同比',                  unit: '%', freq: 'M' },
    US_PCE:           { id: 'PCE',             name: '美国个人消费支出',              unit: '十亿美元', freq: 'M' },
    OIL_PRICE_WTI:    { id: 'DCOILWTICO',      name: 'WTI 原油价格',                 unit: '美元/桶', freq: 'D' },
    GOLD_PRICE:       { id: 'GOLDAMGBD228NLBM',name: '伦敦黄金定盘价',              unit: '美元/盎司', freq: 'D' },
    US_M2:            { id: 'M2SL',            name: '美国M2货币供应',               unit: '十亿美元', freq: 'M' },
    SP500:            { id: 'SP500',           name: '标普500指数',                  unit: '点', freq: 'D' },
    VIX:              { id: 'VIXCLS',          name: 'VIX波动率指数',                unit: '点', freq: 'D' },
    GLOBAL_DEBT:      { id: 'GFDEBTN',         name: '美国联邦债务（百亿美元）',      unit: '百亿美元', freq: 'Q' },
    US_TRADE_BALANCE: { id: 'BOPGSTB',         name: '美国货物贸易余额',             unit: '百万美元', freq: 'M' },
    DOLLAR_INDEX:     { id: 'DTWEXBGS',        name: '美元指数（贸易加权）',          unit: '', freq: 'D' },
  };

  private cache = cnbsCacheHub.getCache('fred', {
    persistPath: './cache/fred.json',
    capacity: 1000,
    defaultExpire: 60 * 60 * 1000,  // 1 小时（市场数据更新较快）
  });

  private getApiKey(): string {
    const key = this.instanceApiKey || process.env.FRED_API_KEY;
    if (!key) {
      throw new Error(
        'FRED 数据源需要 API Key。' +
        '请在 https://fred.stlouisfed.org/docs/api/api_key.html 免费申请，然后通过以下任一方式提供：\n' +
        '  • HTTP 模式：在请求头中携带 X-Fred-Api-Key: <your_key>\n' +
        '  • stdio 模式：设置环境变量 FRED_API_KEY=<your_key>'
      );
    }
    return key;
  }

  async fetchData(params: {
    series: string;           // 系列名如 'US_GDP' 或 FRED 系列 ID 如 'GDP'
    limit?: number;           // 返回数量，默认 100
    sortOrder?: 'asc' | 'desc';
    observationStart?: string; // 如 '2010-01-01'
    observationEnd?: string;
  }): Promise<any> {
    const apiKey = this.getApiKey();

    const preset = FREDDataSource.SERIES[params.series?.toUpperCase()];
    const seriesId = preset?.id || params.series;

    const cacheKey = CacheKeyGenerator.generateDataSourceKey('fred', {
      seriesId,
      limit: params.limit || 100,
      start: params.observationStart || '',
      end: params.observationEnd || '',
    });
    const cached = this.cache.fetch(cacheKey);
    if (cached) return cached;

    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        const response = await axios.get(
          'https://api.stlouisfed.org/fred/series/observations',
          {
            ...axiosConfig,
            params: {
              series_id: seriesId,
              api_key: apiKey,
              file_type: 'json',
              limit: params.limit || 100,
              sort_order: params.sortOrder || 'desc',
              ...(params.observationStart ? { observation_start: params.observationStart } : {}),
              ...(params.observationEnd ? { observation_end: params.observationEnd } : {}),
            },
          }
        );

        const obs = response.data?.observations || [];
        const result = {
          source: 'fred',
          series: { id: seriesId, name: preset?.name || seriesId, unit: preset?.unit || '', freq: preset?.freq || '' },
          count: obs.length,
          data: obs
            .filter((o: any) => o.value !== '.' && o.value !== null)
            .map((o: any) => ({
              period: o.date,
              value: Number(o.value),
              unit: preset?.unit || '',
            })),
        };

        this.cache.store(cacheKey, result);
        return result;
      });
    });
  }

  async getCategories(): Promise<any[]> {
    return Object.entries(FREDDataSource.SERIES).map(([key, val]) => ({
      id: key,
      fredId: val.id,
      name: val.name,
      unit: val.unit,
      frequency: val.freq,
    }));
  }

  async search(keyword: string): Promise<any> {
    const kw = keyword.toLowerCase();
    const matches = Object.entries(FREDDataSource.SERIES)
      .filter(([k, v]) =>
        k.toLowerCase().includes(kw) ||
        v.name.toLowerCase().includes(kw) ||
        v.id.toLowerCase().includes(kw)
      )
      .map(([key, val]) => ({ id: key, fredId: val.id, name: val.name, unit: val.unit }));
    return { keyword, source: 'fred', results: matches };
  }
}

// ─────────────────────────────────────────────────────────────
// 6. 国家统计局普查数据源
// 通过 NBS Modern API 搜索普查相关数据集
// ─────────────────────────────────────────────────────────────
export class CensusDataSource implements DataSource {
  name = 'census';
  description = '国家统计局普查数据（人口/经济/农业）';

  private nbsClient = new CnbsModernClient();

  // 普查类型 → 搜索关键词映射
  static readonly CENSUS_KEYWORDS: Record<string, { keywords: string[]; name: string; latestYear: string }> = {
    population: {
      keywords: ['人口普查', '第七次全国人口普查', '人口普查数据'],
      name: '人口普查（2020年第七次）',
      latestYear: '2020',
    },
    economic: {
      keywords: ['经济普查', '第四次全国经济普查'],
      name: '经济普查（2018年第四次）',
      latestYear: '2018',
    },
    agriculture: {
      keywords: ['农业普查', '第三次全国农业普查'],
      name: '农业普查（2016年第三次）',
      latestYear: '2016',
    },
  };

  private cache = cnbsCacheHub.getCache('census', {
    persistPath: './cache/census.json',
    capacity: 500,
    defaultExpire: 24 * 60 * 60 * 1000,
  });

  async fetchData(params: { type?: string; keyword?: string; pageSize?: number }): Promise<any> {
    const censusType = params.type || 'population';
    const preset = CensusDataSource.CENSUS_KEYWORDS[censusType];

    const searchKeyword = params.keyword || (preset?.keywords[0] ?? '人口普查');
    const cacheKey = CacheKeyGenerator.generateDataSourceKey('census', {
      type: censusType,
      keyword: searchKeyword,
    });
    const cached = this.cache.fetch(cacheKey);
    if (cached) return cached;

    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        const searchResult = await this.nbsClient.findItems({
          keyword: searchKeyword,
          pageSize: params.pageSize || 20,
        });

        const result = {
          source: 'census_nbs',
          censusType,
          name: preset?.name || censusType,
          latestYear: preset?.latestYear,
          searchKeyword,
          data: searchResult,
        };

        this.cache.store(cacheKey, result);
        return result;
      });
    });
  }

  async getCategories(): Promise<any[]> {
    return Object.entries(CensusDataSource.CENSUS_KEYWORDS).map(([key, val]) => ({
      id: key,
      name: val.name,
      latestYear: val.latestYear,
      keywords: val.keywords,
    }));
  }

  async search(keyword: string): Promise<any> {
    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        const result = await this.nbsClient.findItems({ keyword, pageSize: 20 });
        return { keyword, source: 'census_nbs', data: result };
      });
    });
  }
}

// ─────────────────────────────────────────────────────────────
// 7. 各部门统计数据源
// 通过 NBS API 按部门关键词查询已在国家统计局发布的数据
// ─────────────────────────────────────────────────────────────
export class DepartmentDataSource implements DataSource {
  name = 'department';
  description = '各部门统计数据（财政、工信、商务、农业、央行等）—— 通过国家统计局发布';

  private nbsClient = new CnbsModernClient();

  // 部门 → NBS 关键词映射
  static readonly DEPARTMENTS: Record<string, {
    name: string;
    ministry: string;
    keywords: string[];
  }> = {
    finance: {
      name: '财政统计',
      ministry: '财政部',
      keywords: ['财政收入', '财政支出', '税收收入', '国债余额', '一般公共预算'],
    },
    industry: {
      name: '工业统计',
      ministry: '工业和信息化部',
      keywords: ['工业增加值', '规模以上工业', '制造业', '高技术产业', '工业生产'],
    },
    trade: {
      name: '商务统计',
      ministry: '商务部',
      keywords: ['进出口总额', '出口总额', '进口总额', '实际利用外资', '对外贸易'],
    },
    agriculture: {
      name: '农业统计',
      ministry: '农业农村部',
      keywords: ['粮食产量', '农产品', '农村居民收入', '农业增加值', '耕地面积'],
    },
    monetary: {
      name: '货币金融统计',
      ministry: '中国人民银行',
      keywords: ['M2货币供应量', '社会融资规模', '银行贷款', '存款余额', '贷款利率'],
    },
    social_security: {
      name: '社会保障统计',
      ministry: '人力资源和社会保障部',
      keywords: ['城镇登记失业率', '就业人员', '养老保险', '医疗保险', '社会保障基金'],
    },
    housing: {
      name: '房地产统计',
      ministry: '住房和城乡建设部',
      keywords: ['商品房销售额', '房地产开发投资', '住宅价格', '新建商品房', '建筑业'],
    },
    energy: {
      name: '能源统计',
      ministry: '国家能源局',
      keywords: ['能源消耗', '电力消费', '发电量', '新能源', '煤炭产量'],
    },
  };

  private cache = cnbsCacheHub.getCache('department', {
    persistPath: './cache/department.json',
    capacity: 800,
    defaultExpire: 12 * 60 * 60 * 1000,
  });

  async fetchData(params: {
    department: string;     // 部门键如 'finance'
    indicator?: string;     // 具体指标关键词，可选
    pageSize?: number;
  }): Promise<any> {
    const preset = DepartmentDataSource.DEPARTMENTS[params.department];
    if (!preset) {
      throw new Error(
        `未知部门 "${params.department}"。可用: ${Object.keys(DepartmentDataSource.DEPARTMENTS).join(', ')}`
      );
    }

    const keyword = params.indicator || preset.keywords[0];
    const cacheKey = CacheKeyGenerator.generateDataSourceKey('department', {
      department: params.department,
      keyword,
    });
    const cached = this.cache.fetch(cacheKey);
    if (cached) return cached;

    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        const result = await this.nbsClient.findItems({
          keyword,
          pageSize: params.pageSize || 20,
        });

        const output = {
          source: 'department_nbs',
          department: params.department,
          name: preset.name,
          ministry: preset.ministry,
          keyword,
          data: result,
        };

        this.cache.store(cacheKey, output);
        return output;
      });
    });
  }

  async getCategories(): Promise<any[]> {
    return Object.entries(DepartmentDataSource.DEPARTMENTS).map(([key, val]) => ({
      id: key,
      name: val.name,
      ministry: val.ministry,
      keywords: val.keywords,
    }));
  }

  async search(keyword: string): Promise<any> {
    return cnbsRequestThrottler.execute(async () => {
      return CnbsErrorHandler.retryWithBackoff(async () => {
        const result = await this.nbsClient.findItems({ keyword, pageSize: 20 });
        return { keyword, source: 'department_nbs', data: result };
      });
    });
  }

  async fetchAllKeywordsForDepartment(department: string): Promise<any> {
    const preset = DepartmentDataSource.DEPARTMENTS[department];
    if (!preset) throw new Error(`未知部门 "${department}"`);

    const results: Record<string, any> = {};
    for (const kw of preset.keywords) {
      try {
        const result = await this.nbsClient.findItems({ keyword: kw, pageSize: 5 });
        results[kw] = result;
      } catch (e) {
        results[kw] = { error: (e as Error).message };
      }
    }
    return { department, name: preset.name, ministry: preset.ministry, results };
  }
}

// ─────────────────────────────────────────────────────────────
// 8. 国际数据聚合源
// 根据 source 参数转发到 WorldBank / IMF / OECD / BIS
// 保留原有接口兼容性
// ─────────────────────────────────────────────────────────────
export class InternationalDataSource implements DataSource {
  name = 'international';
  description = '国际统计数据聚合（世界银行 / IMF / OECD / BIS）';

  private worldBank = new WorldBankDataSource();
  private imf = new IMFDataSource();
  private oecd = new OECDDataSource();
  private bis = new BISDataSource();

  async fetchData(params: {
    source?: string;    // 'world_bank' | 'imf' | 'oecd' | 'bis'
    [key: string]: any;
  }): Promise<any> {
    const src = params.source || 'world_bank';
    switch (src) {
      case 'world_bank': return this.worldBank.fetchData(params);
      case 'imf':        return this.imf.fetchData(params);
      case 'oecd':       return this.oecd.fetchData(params);
      case 'bis':        return this.bis.fetchData(params);
      default:
        throw new Error(`未知国际数据来源 "${src}"。可选: world_bank, imf, oecd, bis`);
    }
  }

  async getCategories(): Promise<any[]> {
    return [
      { id: 'world_bank', name: '世界银行', description: '宏观发展指标、人口、贸易等' },
      { id: 'imf',        name: 'IMF',      description: 'WEO 预测、经常账户、政府债务等' },
      { id: 'oecd',       name: 'OECD',     description: '季度GDP、就业、先行指标等' },
      { id: 'bis',        name: 'BIS',      description: '有效汇率、信贷缺口、跨境银行统计等' },
    ];
  }

  async search(keyword: string): Promise<any> {
    const [wbRes, imfRes, oecdRes, bisRes] = await Promise.allSettled([
      this.worldBank.search(keyword),
      this.imf.search(keyword),
      this.oecd.search(keyword),
      this.bis.search(keyword),
    ]);
    return {
      keyword,
      results: {
        world_bank: wbRes.status === 'fulfilled' ? wbRes.value : null,
        imf:        imfRes.status === 'fulfilled' ? imfRes.value : null,
        oecd:       oecdRes.status === 'fulfilled' ? oecdRes.value : null,
        bis:        bisRes.status === 'fulfilled' ? bisRes.value : null,
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────
// 数据源管理器
// ─────────────────────────────────────────────────────────────
export class DataSourceManager {
  private sources: Map<string, DataSource> = new Map();

  constructor() {
    this.registerDefaultSources();
  }

  private registerDefaultSources() {
    this.registerSource('world_bank',    new WorldBankDataSource());
    this.registerSource('imf',           new IMFDataSource());
    this.registerSource('oecd',          new OECDDataSource());
    this.registerSource('bis',           new BISDataSource());
    this.registerSource('fred',          new FREDDataSource());
    this.registerSource('census',        new CensusDataSource());
    this.registerSource('department',    new DepartmentDataSource());
    this.registerSource('international', new InternationalDataSource());
  }

  registerSource(name: string, source: DataSource) {
    this.sources.set(name, source);
  }

  getSource(name: string): DataSource | null {
    return this.sources.get(name) || null;
  }

  listSources(): Array<{ name: string; description: string }> {
    return Array.from(this.sources.entries()).map(([name, source]) => ({
      name,
      description: source.description,
    }));
  }

  async fetchData(sourceName: string, params: any): Promise<any> {
    const source = this.getSource(sourceName);
    if (!source) throw new Error(`DataSource "${sourceName}" not found`);
    return source.fetchData(params);
  }

  async getCategories(sourceName: string): Promise<any[]> {
    const source = this.getSource(sourceName);
    if (!source) throw new Error(`DataSource "${sourceName}" not found`);
    return source.getCategories();
  }

  async search(sourceName: string, keyword: string): Promise<any> {
    const source = this.getSource(sourceName);
    if (!source) throw new Error(`DataSource "${sourceName}" not found`);
    return source.search(keyword);
  }

  async batchFetchData(batchRequests: Array<{ sourceName: string; params: any }>): Promise<Array<{
    sourceName: string;
    params: any;
    result: any;
    error?: string;
  }>> {
    const results = [];
    for (const request of batchRequests) {
      try {
        const result = await this.fetchData(request.sourceName, request.params);
        results.push({ sourceName: request.sourceName, params: request.params, result });
      } catch (error) {
        results.push({
          sourceName: request.sourceName,
          params: request.params,
          result: null,
          error: (error as Error).message,
        });
      }
    }
    return results;
  }

  async batchGetCategories(sourceNames: string[]): Promise<Array<{
    sourceName: string;
    categories: any[];
    error?: string;
  }>> {
    const results = [];
    for (const sourceName of sourceNames) {
      try {
        const categories = await this.getCategories(sourceName);
        results.push({ sourceName, categories });
      } catch (error) {
        results.push({ sourceName, categories: [], error: (error as Error).message });
      }
    }
    return results;
  }

  async batchSearch(batchRequests: Array<{ sourceName: string; keyword: string }>): Promise<Array<{
    sourceName: string;
    keyword: string;
    result: any;
    error?: string;
  }>> {
    const results = [];
    for (const request of batchRequests) {
      try {
        const result = await this.search(request.sourceName, request.keyword);
        results.push({ sourceName: request.sourceName, keyword: request.keyword, result });
      } catch (error) {
        results.push({
          sourceName: request.sourceName,
          keyword: request.keyword,
          result: null,
          error: (error as Error).message,
        });
      }
    }
    return results;
  }
}

export const dataSourceManager = new DataSourceManager();

// 导出各数据源单例（供工具直接使用）
// FREDDataSource 应通过 createFREDSource(apiKey?) 按会话实例化，而非使用全局单例
export const worldBankSource = new WorldBankDataSource();
export const imfSource = new IMFDataSource();
export const oecdSource = new OECDDataSource();
export const bisSource = new BISDataSource();
export const censusSource = new CensusDataSource();
export const departmentSource = new DepartmentDataSource();

/**
 * 创建携带指定 API Key 的 FRED 数据源实例。
 * apiKey 优先级：传入参数 > FRED_API_KEY 环境变量
 */
export function createFREDSource(apiKey?: string): FREDDataSource {
  return new FREDDataSource(apiKey);
}
