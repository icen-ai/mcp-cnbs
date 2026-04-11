import { CnbsDataHelper, DataQualityAssessor } from '../services/data';

describe('CnbsDataHelper', () => {
  describe('formatNumber', () => {
    it('should format numbers with fixed decimal places', () => {
      expect(CnbsDataHelper.formatNumber('123456')).toBe('123456.00');
      expect(CnbsDataHelper.formatNumber('123456.789', 2)).toBe('123456.79');
    });

    it('should handle empty or invalid values', () => {
      expect(CnbsDataHelper.formatNumber('')).toBe('无数据');
      expect(CnbsDataHelper.formatNumber('abc')).toBe('abc');
    });

    it('should format numbers in compact format', () => {
      expect(CnbsDataHelper.formatNumber('123456', 2, 'compact')).toBe('12.35万');
      expect(CnbsDataHelper.formatNumber('123456789', 2, 'compact')).toBe('1.23亿');
    });

    it('should format numbers as percentages', () => {
      expect(CnbsDataHelper.formatNumber('0.05', 1, 'percent')).toBe('5.0%');
      expect(CnbsDataHelper.formatNumber('0.1234', 2, 'percent')).toBe('12.34%');
    });
  });

  describe('transformUnit', () => {
    it('should transform units correctly', () => {
      expect(CnbsDataHelper.transformUnit('123456', '亿元', '万亿元')).toBe('123456');
      expect(CnbsDataHelper.transformUnit('123456', '万元', '亿元')).toBe('12.35');
    });

    it('should handle unknown units', () => {
      expect(CnbsDataHelper.transformUnit('123', 'unknown', 'unknown')).toBe('123');
    });
  });

  describe('computeStats', () => {
    it('should compute basic statistics', () => {
      const values = ['100', '200', '300', '400', '500'];
      const stats = CnbsDataHelper.computeStats(values);

      expect(stats.min).toBe(100);
      expect(stats.max).toBe(500);
      expect(stats.avg).toBe(300);
      expect(stats.total).toBe(1500);
    });

    it('should handle empty arrays', () => {
      const stats = CnbsDataHelper.computeStats([]);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.avg).toBe(0);
      expect(stats.total).toBe(0);
    });
  });

  describe('calculateTrend', () => {
    it('should calculate trend', () => {
      const values = ['100', '110', '120', '130', '140'];
      const trend = CnbsDataHelper.calculateTrend(values);

      expect(trend.direction).toBe('up');
      expect(trend.change).toBe(40);
      expect(trend.changePercent).toBe(40);
    });

    it('should handle single value', () => {
      const values = ['100'];
      const trend = CnbsDataHelper.calculateTrend(values);

      expect(trend.direction).toBe('stable');
      expect(trend.change).toBe(0);
      expect(trend.changePercent).toBe(0);
    });
  });

  describe('validateAndCleanData', () => {
    it('should validate and clean data', () => {
      expect(CnbsDataHelper.validateAndCleanData('  1234.56  ')).toBe('1234.56');
      expect(CnbsDataHelper.validateAndCleanData('无数据')).toBe(null);
      expect(CnbsDataHelper.validateAndCleanData('')).toBe(null);
    });
  });

  describe('generateDataSummary', () => {
    it('should generate data summary', () => {
      const data = [
        { value: '100', period: '202401MM' },
        { value: '200', period: '202402MM' },
        { value: '无数据', period: '202403MM' }
      ];

      const summary = CnbsDataHelper.generateDataSummary(data);

      expect(summary.totalItems).toBe(3);
      expect(summary.validItems).toBe(2);
      expect(summary.missingItems).toBe(1);
      expect(summary.timeRange).toEqual({ start: '202401MM', end: '202403MM' });
    });

    it('should handle empty data', () => {
      const summary = CnbsDataHelper.generateDataSummary([]);
      expect(summary.totalItems).toBe(0);
      expect(summary.validItems).toBe(0);
      expect(summary.missingItems).toBe(0);
    });
  });
});

describe('DataQualityAssessor', () => {
  describe('assess', () => {
    it('should assess data quality', () => {
      const data = [
        { value: '100', period: '202401MM' },
        { value: '200', period: '202402MM' },
        { value: '无数据', period: '202403MM' }
      ];

      const quality = DataQualityAssessor.assess(data);

      expect(quality.completeness).toBeCloseTo(66.67, 2);
      expect(quality.accuracy).toBeCloseTo(66.67, 2);
      expect(quality.consistency).toBeCloseTo(66.67, 2);
      expect(quality.timeliness).toBeCloseTo(90, 2);
      expect(quality.overall).toBeCloseTo(72.5, 2);
    });

    it('should handle empty data', () => {
      const quality = DataQualityAssessor.assess([]);
      expect(quality.completeness).toBeCloseTo(100, 2);
      expect(quality.accuracy).toBeCloseTo(100, 2);
      expect(quality.consistency).toBeCloseTo(100, 2);
      expect(quality.timeliness).toBeCloseTo(90, 2);
      expect(quality.overall).toBeCloseTo(97.5, 2);
    });
  });

  describe('assess', () => {
    it('should assess data quality', () => {
      const data = [
        { value: '100' },
        { value: '200' },
        { value: '无数据' }
      ];

      const quality = DataQualityAssessor.assess(data);
      expect(quality.completeness).toBeCloseTo(66.67, 2);
      expect(quality.accuracy).toBeCloseTo(66.67, 2);
      expect(quality.consistency).toBeCloseTo(66.67, 2);
      expect(quality.timeliness).toBeCloseTo(90, 2);
      expect(quality.overall).toBeCloseTo(72.5, 2);
    });
  });
});
