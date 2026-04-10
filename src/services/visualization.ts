// @ts-ignore - Allow synthetic default imports for d3
import * as d3 from 'd3';
// @ts-ignore - Allow synthetic default imports for chart.js
import * as Chart from 'chart.js/auto';
// @ts-ignore - Allow synthetic default imports for echarts
import * as echarts from 'echarts';
import * as _ from 'lodash';
import * as math from 'mathjs';
import * as ss from 'simple-statistics';

// 图表类型
export enum ChartType {
  LINE = 'line',
  BAR = 'bar',
  PIE = 'pie',
  SCATTER = 'scatter',
  RADAR = 'radar',
  HEAT_MAP = 'heatmap',
  TREEMAP = 'treemap',
  GAUGE = 'gauge'
}

// 图表配置接口
export interface ChartConfig {
  type: ChartType;
  title: string;
  xAxis?: {
    type: string;
    data?: string[];
    name?: string;
    splitArea?: {
      show: boolean;
    };
  };
  yAxis?: {
    type: string;
    name?: string;
    data?: string[];
  };
  series?: Array<{
    name: string;
    data: any[];
    type: string;
    label?: {
      show: boolean;
      position: string;
      formatter: string;
    };
    detail?: {
      formatter: string;
    };
  }>;
  tooltip?: {
    trigger: string;
  };
  legend?: {
    data: string[];
  };
  breadcrumb?: {
    show: boolean;
  };
  [key: string]: any;
}

// 数据分析结果接口
export interface AnalysisResult {
  type: string;
  data: any;
  metrics?: {
    [key: string]: any;
  };
  [key: string]: any;
}

// 数据可视化服务
export class DataVisualizationService {
  // 生成图表配置
  generateChartConfig(data: any, type: ChartType, options?: any): ChartConfig {
    const baseConfig: ChartConfig = {
      type,
      title: options?.title || '数据可视化',
      tooltip: {
        trigger: 'axis'
      }
    };

    switch (type) {
      case ChartType.LINE:
        return this.generateLineChartConfig(data, baseConfig, options);
      case ChartType.BAR:
        return this.generateBarChartConfig(data, baseConfig, options);
      case ChartType.PIE:
        return this.generatePieChartConfig(data, baseConfig, options);
      case ChartType.SCATTER:
        return this.generateScatterChartConfig(data, baseConfig, options);
      case ChartType.RADAR:
        return this.generateRadarChartConfig(data, baseConfig, options);
      case ChartType.HEAT_MAP:
        return this.generateHeatmapChartConfig(data, baseConfig, options);
      case ChartType.TREEMAP:
        return this.generateTreemapChartConfig(data, baseConfig, options);
      case ChartType.GAUGE:
        return this.generateGaugeChartConfig(data, baseConfig, options);
      default:
        return baseConfig;
    }
  }

  // 生成折线图配置
  private generateLineChartConfig(data: any, baseConfig: ChartConfig, options?: any): ChartConfig {
    const series = this.extractSeries(data, options);
    const xAxisData = this.extractXAxisData(data, options);

    return {
      ...baseConfig,
      xAxis: {
        type: 'category',
        data: xAxisData,
        name: options?.xAxisName || '时间'
      },
      yAxis: {
        type: 'value',
        name: options?.yAxisName || '值'
      },
      series,
      legend: {
        data: series.map(s => s.name)
      }
    };
  }

  // 生成柱状图配置
  private generateBarChartConfig(data: any, baseConfig: ChartConfig, options?: any): ChartConfig {
    const series = this.extractSeries(data, options);
    const xAxisData = this.extractXAxisData(data, options);

    return {
      ...baseConfig,
      xAxis: {
        type: 'category',
        data: xAxisData,
        name: options?.xAxisName || '类别'
      },
      yAxis: {
        type: 'value',
        name: options?.yAxisName || '值'
      },
      series,
      legend: {
        data: series.map(s => s.name)
      }
    };
  }

  // 生成饼图配置
  private generatePieChartConfig(data: any, baseConfig: ChartConfig, options?: any): ChartConfig {
    const series = [{
      name: options?.seriesName || '数据',
      type: 'pie',
      radius: '50%',
      data: this.extractPieData(data, options),
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }];

    return {
      ...baseConfig,
      series,
      legend: {
        data: series[0].data.map((item: any) => item.name)
      }
    };
  }

  // 生成散点图配置
  private generateScatterChartConfig(data: any, baseConfig: ChartConfig, options?: any): ChartConfig {
    return {
      ...baseConfig,
      xAxis: {
        type: 'value',
        name: options?.xAxisName || 'X'
      },
      yAxis: {
        type: 'value',
        name: options?.yAxisName || 'Y'
      },
      series: [{
        name: options?.seriesName || '数据',
        type: 'scatter',
        data: this.extractScatterData(data, options)
      }]
    };
  }

  // 生成雷达图配置
  private generateRadarChartConfig(data: any, baseConfig: ChartConfig, options?: any): ChartConfig {
    const indicator = this.extractRadarIndicator(data, options);
    const series = this.extractRadarSeries(data, options);

    return {
      ...baseConfig,
      radar: {
        indicator
      },
      series,
      legend: {
        data: series.map(s => s.name)
      }
    };
  }

  // 生成热力图配置
  private generateHeatmapChartConfig(data: any, baseConfig: ChartConfig, options?: any): ChartConfig {
    return {
      ...baseConfig,
      xAxis: {
        type: 'category',
        data: this.extractXAxisData(data, options)
      },
      yAxis: {
        type: 'category',
        data: this.extractYAxisData(data, options)
      },
      visualMap: {
        min: options?.min || 0,
        max: options?.max || 100,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '15%'
      },
      series: [{
        name: options?.seriesName || '热力值',
        type: 'heatmap',
        data: this.extractHeatmapData(data, options),
        label: {
          show: true,
          position: 'top',
          formatter: '{c}'
        },

      }]
    };
  }

  // 生成树图配置
  private generateTreemapChartConfig(data: any, baseConfig: ChartConfig, options?: any): ChartConfig {
    return {
      ...baseConfig,
      series: [{
        name: options?.seriesName || '树图',
        type: 'treemap',
        data: this.extractTreemapData(data, options),
        label: {
          show: true,
          position: 'inside',
          formatter: '{b}: {c}'
        },

      }]
    };
  }

  // 生成仪表盘配置
  private generateGaugeChartConfig(data: any, baseConfig: ChartConfig, options?: any): ChartConfig {
    return {
      ...baseConfig,
      series: [{
        name: options?.seriesName || '仪表盘',
        type: 'gauge',
        detail: {
          formatter: '{value}'
        },
        data: [{
          value: options?.value || 0,
          name: options?.name || '值'
        }]
      }]
    };
  }

  // 提取系列数据
  private extractSeries(data: any, options?: any): Array<{
    name: string;
    data: any[];
    type: string;
  }> {
    if (Array.isArray(data)) {
      return data.map((item, index) => ({
        name: item.name || `系列${index + 1}`,
        data: item.data || [],
        type: item.type || 'line'
      }));
    }
    
    if (data.series) {
      return data.series;
    }
    
    return [{
      name: options?.seriesName || '数据',
      data: data.data || [],
      type: options?.type || 'line'
    }];
  }

  // 提取X轴数据
  private extractXAxisData(data: any, options?: any): string[] {
    if (data.xAxis && data.xAxis.data) {
      return data.xAxis.data;
    }
    
    if (options?.xAxisData) {
      return options.xAxisData;
    }
    
    return [];
  }

  // 提取Y轴数据
  private extractYAxisData(data: any, options?: any): string[] {
    if (data.yAxis && data.yAxis.data) {
      return data.yAxis.data;
    }
    
    if (options?.yAxisData) {
      return options.yAxisData;
    }
    
    return [];
  }

  // 提取饼图数据
  private extractPieData(data: any, options?: any): Array<{
    name: string;
    value: number;
  }> {
    if (Array.isArray(data)) {
      return data.map(item => ({
        name: item.name || `项${data.indexOf(item) + 1}`,
        value: item.value || 0
      }));
    }
    
    if (data.pieData) {
      return data.pieData;
    }
    
    return [];
  }

  // 提取散点图数据
  private extractScatterData(data: any, options?: any): Array<[number, number]> {
    if (Array.isArray(data)) {
      return data.map(item => [item[0] || 0, item[1] || 0]);
    }
    
    if (data.scatterData) {
      return data.scatterData;
    }
    
    return [];
  }

  // 提取雷达图指标
  private extractRadarIndicator(data: any, options?: any): Array<{
    name: string;
    max: number;
  }> {
    if (data.indicator) {
      return data.indicator;
    }
    
    if (options?.indicator) {
      return options.indicator;
    }
    
    return [];
  }

  // 提取雷达图系列数据
  private extractRadarSeries(data: any, options?: any): Array<{
    name: string;
    type: string;
    data: Array<{
      value: number[];
      name: string;
    }>;
  }> {
    if (data.series) {
      return data.series;
    }
    
    if (options?.series) {
      return options.series;
    }
    
    return [];
  }

  // 提取热力图数据
  private extractHeatmapData(data: any, options?: any): Array<[number, number, number]> {
    if (Array.isArray(data)) {
      return data.map(item => [item[0] || 0, item[1] || 0, item[2] || 0]);
    }
    
    if (data.heatmapData) {
      return data.heatmapData;
    }
    
    return [];
  }

  // 提取树图数据
  private extractTreemapData(data: any, options?: any): any[] {
    if (data.treemapData) {
      return data.treemapData;
    }
    
    if (Array.isArray(data)) {
      return data;
    }
    
    return [];
  }
}

// 数据分析服务
export class DataAnalysisService {
  // 趋势分析
  analyzeTrend(data: number[], options?: any): AnalysisResult {
    const trend = ss.linearRegression(
      data.map((value, index) => [index, value])
    );
    
    const trendLine = data.map((_, index) => 
      trend.m * index + trend.b
    );
    
    return {
      type: 'trend',
      data: {
        original: data,
        trend: trendLine
      },
      metrics: {
        slope: trend.m,
        intercept: trend.b,
        rSquared: ss.rSquared(
          data.map((value, index) => [index, value]),
          (x: number) => trend.m * x + trend.b
        )
      }
    };
  }

  // 相关性分析
  analyzeCorrelation(data1: number[], data2: number[]): AnalysisResult {
    const correlation = ss.sampleCorrelation(data1, data2);
    
    return {
      type: 'correlation',
      data: {
        correlation
      },
      metrics: {
        correlation,
        strength: this.getCorrelationStrength(correlation)
      }
    };
  }

  // 异常检测
  detectAnomalies(data: number[], threshold: number = 2): AnalysisResult {
    const mean = ss.mean(data);
    const stdDev = ss.standardDeviation(data);
    
    const anomalies = data.map((value, index) => ({
      index,
      value,
      isAnomaly: Math.abs(value - mean) > threshold * stdDev
    }));
    
    return {
      type: 'anomaly',
      data: {
        anomalies,
        mean,
        stdDev,
        threshold
      },
      metrics: {
        anomalyCount: anomalies.filter(a => a.isAnomaly).length,
        anomalyPercentage: (anomalies.filter(a => a.isAnomaly).length / data.length) * 100
      }
    };
  }

  // 统计分析
  analyzeStatistics(data: number[]): AnalysisResult {
    return {
      type: 'statistics',
      data: {
        mean: ss.mean(data),
        median: ss.median(data),
        mode: ss.mode(data),
        standardDeviation: ss.standardDeviation(data),
        variance: ss.variance(data),
        min: ss.min(data),
        max: ss.max(data),
        range: ss.max(data) - ss.min(data),
        q1: ss.quantile(data, 0.25),
        q3: ss.quantile(data, 0.75),
        iqr: ss.quantile(data, 0.75) - ss.quantile(data, 0.25)
      }
    };
  }

  // 时间序列分析
  analyzeTimeSeries(data: number[], options?: any): AnalysisResult {
    const seasonality = this.detectSeasonality(data, options?.period || 12);
    const trend = this.analyzeTrend(data);
    
    return {
      type: 'timeSeries',
      data: {
        original: data,
        trend: trend.data.trend,
        seasonality
      },
      metrics: {
        ...trend.metrics,
        seasonalityStrength: this.calculateSeasonalityStrength(data, seasonality)
      }
    };
  }

  // 预测分析
  predict(data: number[], futureSteps: number = 5): AnalysisResult {
    const trend = ss.linearRegression(
      data.map((value, index) => [index, value])
    );
    
    const predictions = Array.from({ length: futureSteps }, (_, i) => {
      const index = data.length + i;
      return trend.m * index + trend.b;
    });
    
    return {
      type: 'prediction',
      data: {
        original: data,
        predictions
      },
      metrics: {
        slope: trend.m,
        intercept: trend.b
      }
    };
  }

  // 检测季节性
  private detectSeasonality(data: number[], period: number): number[] {
    const seasonality = [];
    
    for (let i = 0; i < period; i++) {
      const values = [];
      for (let j = i; j < data.length; j += period) {
        values.push(data[j]);
      }
      seasonality.push(ss.mean(values));
    }
    
    return seasonality;
  }

  // 计算季节性强度
  private calculateSeasonalityStrength(data: number[], seasonality: number[]): number {
    const mean = ss.mean(data);
    const seasonalVariance = ss.variance(seasonality.map(s => s - mean));
    const totalVariance = ss.variance(data);
    
    return seasonalVariance / totalVariance;
  }

  // 获取相关性强度
  private getCorrelationStrength(correlation: number): string {
    const absCorr = Math.abs(correlation);
    if (absCorr >= 0.8) return '很强';
    if (absCorr >= 0.6) return '强';
    if (absCorr >= 0.4) return '中等';
    if (absCorr >= 0.2) return '弱';
    return '很弱';
  }
}

// 数据转换服务
export class DataTransformationService {
  // 标准化数据
  normalize(data: number[]): number[] {
    const min = ss.min(data);
    const max = ss.max(data);
    const range = max - min;
    
    return data.map(value => range === 0 ? 0 : (value - min) / range);
  }

  // 标准化数据（Z-score）
  standardize(data: number[]): number[] {
    const mean = ss.mean(data);
    const stdDev = ss.standardDeviation(data);
    
    return data.map(value => stdDev === 0 ? 0 : (value - mean) / stdDev);
  }

  // 对数转换
  logTransform(data: number[]): number[] {
    return data.map(value => Math.log(value + 1));
  }

  // 差分转换
  differenceTransform(data: number[]): number[] {
    const result = [];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] - data[i - 1]);
    }
    return result;
  }

  // 移动平均
  movingAverage(data: number[], window: number): number[] {
    const result = [];
    for (let i = 0; i <= data.length - window; i++) {
      const windowData = data.slice(i, i + window);
      result.push(ss.mean(windowData));
    }
    return result;
  }

  // 指数平滑
  exponentialSmoothing(data: number[], alpha: number = 0.3): number[] {
    const result = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(alpha * data[i] + (1 - alpha) * result[i - 1]);
    }
    return result;
  }

  // 数据聚合
  aggregate(data: any[], key: string, aggregator: (values: any[]) => any): any[] {
    const grouped = _.groupBy(data, key);
    return Object.entries(grouped).map(([groupKey, items]) => {
      const result: any = {};
      result[key] = groupKey;
      result.value = aggregator(items.map(item => item.value));
      return result;
    });
  }

  // 数据透视
  pivot(data: any[], rows: string[], columns: string[], values: string, aggregator: (values: any[]) => any): any[] {
    const grouped = _.groupBy(data, item => rows.map(row => item[row]).join('-'));
    
    return Object.entries(grouped).map(([key, items]) => {
      const rowValues = key.split('-');
      const rowObj = rows.reduce((obj: any, row, index) => {
        obj[row] = rowValues[index];
        return obj;
      }, {});
      
      const columnGroups = _.groupBy(items, item => item[columns[0]]);
      const columnObj = Object.entries(columnGroups).reduce((obj: any, [columnValue, columnItems]) => {
        obj[columnValue] = aggregator(columnItems.map(item => item[values]));
        return obj;
      }, {});
      
      return { ...rowObj, ...columnObj };
    });
  }
}

// 导出全局服务实例
export const dataVisualizationService = new DataVisualizationService();
export const dataAnalysisService = new DataAnalysisService();
export const dataTransformationService = new DataTransformationService();
