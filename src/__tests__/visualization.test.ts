import { dataVisualizationService, dataAnalysisService, dataTransformationService, ChartType } from '../services/visualization';

describe('DataVisualizationService', () => {
  describe('generateChartConfig', () => {
    it('should generate line chart config', () => {
      const data = {
        series: [{ name: 'GDP', data: [100, 110, 120, 130, 140] }],
        xAxis: { data: ['2020', '2021', '2022', '2023', '2024'] }
      };

      const config = dataVisualizationService.generateChartConfig(data, ChartType.LINE, { title: 'GDP趋势' });

      expect(config.type).toBe(ChartType.LINE);
      expect(config.title).toBe('GDP趋势');
      expect(config.xAxis?.data).toEqual(['2020', '2021', '2022', '2023', '2024']);
      expect(config.series?.[0].name).toBe('GDP');
    });

    it('should generate bar chart config', () => {
      const data = {
        series: [{ name: 'GDP', data: [100, 110, 120, 130, 140] }],
        xAxis: { data: ['2020', '2021', '2022', '2023', '2024'] }
      };

      const config = dataVisualizationService.generateChartConfig(data, ChartType.BAR, { title: 'GDP对比' });

      expect(config.type).toBe(ChartType.BAR);
      expect(config.title).toBe('GDP对比');
    });

    it('should generate pie chart config', () => {
      const data = [
        { name: '第一产业', value: 10000 },
        { name: '第二产业', value: 20000 },
        { name: '第三产业', value: 30000 }
      ];

      const config = dataVisualizationService.generateChartConfig(data, ChartType.PIE, { title: '产业结构' });

      expect(config.type).toBe(ChartType.PIE);
      expect(config.title).toBe('产业结构');
    });
  });
});

describe('DataAnalysisService', () => {
  describe('analyzeTrend', () => {
    it('should analyze trend', () => {
      const data = [100, 110, 120, 130, 140];
      const result = dataAnalysisService.analyzeTrend(data);

      expect(result.type).toBe('trend');
      expect(result.data.original).toEqual(data);
      expect(result.data.trend).toBeDefined();
      expect(result.metrics?.slope).toBeGreaterThan(0);
    });
  });

  describe('analyzeCorrelation', () => {
    it('should analyze correlation', () => {
      const data1 = [100, 110, 120, 130, 140];
      const data2 = [50, 55, 60, 65, 70];
      const result = dataAnalysisService.analyzeCorrelation(data1, data2);

      expect(result.type).toBe('correlation');
      expect(result.data.correlation).toBe(1);
      expect(result.metrics?.strength).toBe('很强');
    });
  });

  describe('detectAnomalies', () => {
    it('should detect anomalies', () => {
      const data = [100, 110, 120, 500, 140];
      const result = dataAnalysisService.detectAnomalies(data, 2);

      expect(result.type).toBe('anomaly');
      expect(result.data.anomalies).toBeDefined();
      expect(result.metrics?.anomalyCount).toBe(0);
    });
  });

  describe('analyzeStatistics', () => {
    it('should analyze statistics', () => {
      const data = [100, 110, 120, 130, 140];
      const result = dataAnalysisService.analyzeStatistics(data);

      expect(result.type).toBe('statistics');
      expect(result.data.mean).toBe(120);
      expect(result.data.median).toBe(120);
      expect(result.data.min).toBe(100);
      expect(result.data.max).toBe(140);
    });
  });

  describe('analyzeTimeSeries', () => {
    it('should analyze time series', () => {
      const data = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210];
      const result = dataAnalysisService.analyzeTimeSeries(data, { period: 12 });

      expect(result.type).toBe('timeSeries');
      expect(result.data.original).toEqual(data);
      expect(result.data.trend).toBeDefined();
      expect(result.data.seasonality).toBeDefined();
    });
  });

  describe('predict', () => {
    it('should predict future values', () => {
      const data = [100, 110, 120, 130, 140];
      const result = dataAnalysisService.predict(data, 3);

      expect(result.type).toBe('prediction');
      expect(result.data.original).toEqual(data);
      expect(result.data.predictions).toHaveLength(3);
    });
  });
});

describe('DataTransformationService', () => {
  describe('normalize', () => {
    it('should normalize data', () => {
      const data = [100, 110, 120, 130, 140];
      const result = dataTransformationService.normalize(data);

      expect(result).toHaveLength(5);
      expect(result[0]).toBe(0);
      expect(result[4]).toBe(1);
    });
  });

  describe('standardize', () => {
    it('should standardize data', () => {
      const data = [100, 110, 120, 130, 140];
      const result = dataTransformationService.standardize(data);

      expect(result).toHaveLength(5);
      expect(result[2]).toBeCloseTo(0);
    });
  });

  describe('movingAverage', () => {
    it('should calculate moving average', () => {
      const data = [100, 110, 120, 130, 140];
      const result = dataTransformationService.movingAverage(data, 3);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(110);
      expect(result[1]).toBe(120);
      expect(result[2]).toBe(130);
    });
  });

  describe('exponentialSmoothing', () => {
    it('should apply exponential smoothing', () => {
      const data = [100, 110, 120, 130, 140];
      const result = dataTransformationService.exponentialSmoothing(data, 0.3);

      expect(result).toHaveLength(5);
      expect(result[0]).toBe(100);
      expect(result[4]).toBeGreaterThan(120);
    });
  });

  describe('aggregate', () => {
    it('should aggregate data', () => {
      const data = [
        { category: 'A', value: 100 },
        { category: 'A', value: 200 },
        { category: 'B', value: 150 }
      ];

      const result = dataTransformationService.aggregate(data, 'category', (values: number[]) => values.reduce((sum: number, val: number) => sum + val, 0));

      expect(result).toHaveLength(2);
      expect(result[0].category).toBe('A');
      expect(result[0].value).toBe(300);
      expect(result[1].category).toBe('B');
      expect(result[1].value).toBe(150);
    });
  });
});
