// 模拟 axios 模块
import {CnbsModernClient} from "../services/api";

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn()
}));

import axios from 'axios';

const mockAxiosGet = axios.get as jest.MockedFunction<typeof axios.get>;
const mockAxiosPost = axios.post as jest.MockedFunction<typeof axios.post>;

describe('CnbsModernClient', () => {
  let client: CnbsModernClient;

  beforeEach(() => {
    client = new CnbsModernClient();
    mockAxiosGet.mockClear();
    mockAxiosPost.mockClear();
  });

  describe('findItems', () => {
    it('should return search results', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: '1',
              name: 'GDP',
              value: '123456'
            }
          ]
        }
      };

      mockAxiosGet.mockResolvedValue(mockResponse);

      const result = await client.findItems({ keyword: 'GDP' });

      expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('query'),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle errors', async () => {
      mockAxiosGet.mockRejectedValue(new Error('API error'));

      const result = await client.findItems({ keyword: 'GDP' });
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('fetchNodes', () => {
    it('should return node data', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              _id: '1',
              name: 'GDP',
              isLeaf: true
            }
          ]
        }
      };

      mockAxiosGet.mockResolvedValue(mockResponse);

      const result = await client.fetchNodes({ category: '3' });

      expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('queryIndexTreeAsync'),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle errors', async () => {
      mockAxiosGet.mockRejectedValue(new Error('API error'));

      const result = await client.fetchNodes({ category: '3' });
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('fetchMetrics', () => {
    it('should return metric data', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: '1',
              name: 'GDP'
            }
          ]
        }
      };

      mockAxiosGet.mockResolvedValue(mockResponse);

      const result = await client.fetchMetrics({ setId: '1' });

      expect(mockAxiosGet).toHaveBeenCalledWith(
        expect.stringContaining('queryIndicatorsByCid'),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle errors', async () => {
      mockAxiosGet.mockRejectedValue(new Error('API error'));

      const result = await client.fetchMetrics({ setId: '1' });
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('fetchSeries', () => {
    it('should return series data', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              value: '123456',
              period: '2024'
            }
          ]
        }
      };

      mockAxiosPost.mockResolvedValue(mockResponse);

      const result = await client.fetchSeries({
        setId: '1',
        metricIds: ['1'],
        periods: ['2024'],
        areas: [{ text: '全国', code: '000000000000' }]
      });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining('getEsDataByCidAndDt'),
        expect.any(Object),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle errors', async () => {
      mockAxiosPost.mockRejectedValue(new Error('API error'));

      const result = await client.fetchSeries({
        setId: '1',
        metricIds: ['1'],
        periods: ['2024'],
        areas: [{ text: '全国', code: '000000000000' }]
      });
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('batchFindItems', () => {
    it('should return batch search results', async () => {
      const mockResponse1 = {
        data: {
          data: [
            {
              id: '1',
              name: 'GDP',
              value: '123456'
            }
          ]
        }
      };

      const mockResponse2 = {
        data: {
          data: [
            {
              id: '2',
              name: 'CPI',
              value: '105'
            }
          ]
        }
      };

      mockAxiosGet.mockResolvedValueOnce(mockResponse1).mockResolvedValueOnce(mockResponse2);

      const result = await client.batchFindItems(['GDP', 'CPI']);

      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('GDP');
      expect(result).toHaveProperty('CPI');
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const stats = client.getCacheStats();
      expect(stats).toHaveProperty('node');
      expect(stats).toHaveProperty('metric');
      expect(stats).toHaveProperty('series');
    });
  });

  describe('syncData', () => {
    it('should return sync status', async () => {
      const result = await client.syncData({ categories: ['1', '2'] });
      expect(result).toHaveProperty('overallStatus');
      expect(result).toHaveProperty('successCount');
      expect(result).toHaveProperty('failedCount');
      expect(result).toHaveProperty('results');
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status', () => {
      const status = client.getSyncStatus();
      expect(typeof status).toBe('object');
    });
  });

  describe('checkDataFreshness', () => {
    it('should return data freshness', async () => {
      const freshness = await client.checkDataFreshness('1');
      expect(freshness).toHaveProperty('isFresh');
      expect(freshness).toHaveProperty('lastUpdated');
    });
  });
});
