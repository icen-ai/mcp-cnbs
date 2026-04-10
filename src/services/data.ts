export class CnbsDataHelper {
  // 格式化数字，支持多种格式
  static formatNumber(value: string | undefined, precision: number = 2, format: 'fixed' | 'compact' | 'percent' = 'fixed'): string {
    if (!value) return '无数据';

    const num = parseFloat(value);
    if (isNaN(num)) return value;

    switch (format) {
      case 'compact':
        if (Math.abs(num) >= 100000000) {
          return (num / 100000000).toFixed(precision) + '亿';
        } else if (Math.abs(num) >= 10000) {
          return (num / 10000).toFixed(precision) + '万';
        }
        return num.toFixed(precision);
      case 'percent':
        return (num * 100).toFixed(precision) + '%';
      case 'fixed':
      default:
        return num.toFixed(precision);
    }
  }

  // 增强的单位转换功能
  static transformUnit(value: string | undefined, sourceUnit: string, targetUnit: string): string {
    if (!value) return '无数据';

    const num = parseFloat(value);
    if (isNaN(num)) return value;

    const conversionTable: Record<string, Record<string, number>> = {
      '元': {
        '万元': 0.0001,
        '亿元': 0.00000001,
        '千元': 0.001,
        '百元': 0.01,
        '十元': 0.1
      },
      '万元': {
        '元': 10000,
        '亿元': 0.0001,
        '千元': 10,
        '百元': 100,
        '十元': 1000
      },
      '亿元': {
        '元': 100000000,
        '万元': 10000,
        '千元': 100000,
        '百元': 1000000,
        '十元': 10000000
      },
      '吨': {
        '万吨': 0.0001,
        '亿吨': 0.00000001,
        '千克': 1000,
        '克': 1000000
      },
      '万吨': {
        '吨': 10000,
        '亿吨': 0.0001,
        '千克': 10000000,
        '克': 10000000000
      },
      '亿吨': {
        '吨': 100000000,
        '万吨': 10000,
        '千克': 100000000000,
        '克': 100000000000000
      },
      '人': {
        '万人': 0.0001,
        '亿人': 0.00000001
      },
      '万人': {
        '人': 10000,
        '亿人': 0.0001
      },
      '亿人': {
        '人': 100000000,
        '万人': 10000
      }
    };

    if (conversionTable[sourceUnit] && conversionTable[sourceUnit][targetUnit]) {
      const factor = conversionTable[sourceUnit][targetUnit];
      const result = num * factor;
      // 保留适当的小数位数
      if (result >= 1000) {
        return Math.round(result).toString();
      } else if (result >= 1) {
        return result.toFixed(2);
      } else {
        return result.toFixed(4);
      }
    }

    return value;
  }

  // 增强的统计计算功能
  static computeStats(values: string[]): {
    min: number;
    max: number;
    avg: number;
    total: number;
    count: number;
    median: number;
    stdDev: number;
  } {
    const nums = values
      .map(v => parseFloat(v))
      .filter(n => !isNaN(n));

    if (nums.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        total: 0,
        count: 0,
        median: 0,
        stdDev: 0
      };
    }

    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const total = nums.reduce((acc, num) => acc + num, 0);
    const avg = total / nums.length;
    const count = nums.length;

    // 计算中位数
    const sortedNums = [...nums].sort((a, b) => a - b);
    const median = count % 2 === 0
      ? (sortedNums[count / 2 - 1] + sortedNums[count / 2]) / 2
      : sortedNums[Math.floor(count / 2)];

    // 计算标准差
    const variance = nums.reduce((acc, num) => acc + Math.pow(num - avg, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    return {
      min,
      max,
      avg,
      total,
      count,
      median,
      stdDev
    };
  }

  // 美化时间周期显示
  static prettyPeriod(periodCode: string): string {
    if (periodCode.endsWith('MM')) {
      const year = periodCode.substring(0, 4);
      const month = periodCode.substring(4, 6);
      return `${year}年${month}月`;
    }

    if (periodCode.endsWith('SS')) {
      const year = periodCode.substring(0, 4);
      const quarter = periodCode.substring(4, 5);
      return `${year}年第${quarter}季度`;
    }

    if (periodCode.endsWith('YY')) {
      const year = periodCode.substring(0, 4);
      return `${year}年`;
    }

    // 处理快捷时间范围
    if (periodCode === 'LAST6') {
      return '最近6期';
    } else if (periodCode === 'LAST12') {
      return '最近12期';
    } else if (periodCode === 'LAST18') {
      return '最近18期';
    }

    return periodCode;
  }

  // 解析时间范围
  static parsePeriodRange(range: string): { start: string; end: string } {
    const parts = range.split('-');
    return {
      start: parts[0] || '',
      end: parts[1] || ''
    };
  }

  // 数据验证和清理
  static validateAndCleanData(value: string | undefined): string | null {
    if (!value) return null;
    
    // 清理空白字符
    const cleaned = value.trim();
    
    // 处理无数据标记
    const noDataMarkers = ['无数据', 'NaN', '-', '--', '\u3000', ' '];
    if (noDataMarkers.includes(cleaned)) {
      return null;
    }
    
    // 移除千分位逗号
    const numStr = cleaned.replace(/,/g, '');
    
    // 验证是否为数字
    if (!isNaN(parseFloat(numStr)) && isFinite(Number(numStr))) {
      return numStr;
    }
    
    return cleaned;
  }

  // 计算数据趋势
  static calculateTrend(values: string[]): {
    direction: 'up' | 'down' | 'stable';
    change: number;
    changePercent: number;
    slope: number;
  } {
    const nums = values
      .map(v => parseFloat(v))
      .filter(n => !isNaN(n));

    if (nums.length < 2) {
      return {
        direction: 'stable',
        change: 0,
        changePercent: 0,
        slope: 0
      };
    }

    const first = nums[0];
    const last = nums[nums.length - 1];
    const change = last - first;
    const changePercent = first !== 0 ? (change / Math.abs(first)) * 100 : 0;

    // 计算线性回归斜率
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    const n = nums.length;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += nums[i];
      sumXY += i * nums[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    let direction: 'up' | 'down' | 'stable' = 'stable';
    if (change > 0) {
      direction = 'up';
    } else if (change < 0) {
      direction = 'down';
    }

    return {
      direction,
      change,
      changePercent,
      slope
    };
  }

  // 生成数据摘要
  static generateDataSummary(data: any[]): {
    totalItems: number;
    validItems: number;
    missingItems: number;
    dataTypes: Record<string, number>;
    timeRange?: { start: string; end: string };
  } {
    const totalItems = data.length;
    let validItems = 0;
    let missingItems = 0;
    const dataTypes: Record<string, number> = {};
    const periods: string[] = [];

    data.forEach(item => {
      // 检查数据有效性
      if (item.value && item.value !== '无数据') {
        validItems++;
      } else {
        missingItems++;
      }

      // 统计数据类型
      const type = typeof item.value;
      dataTypes[type] = (dataTypes[type] || 0) + 1;

      // 收集时间周期
      if (item.period) {
        periods.push(item.period);
      }
    });

    // 计算时间范围
    let timeRange;
    if (periods.length > 0) {
      const sortedPeriods = [...periods].sort();
      timeRange = {
        start: sortedPeriods[0],
        end: sortedPeriods[sortedPeriods.length - 1]
      };
    }

    return {
      totalItems,
      validItems,
      missingItems,
      dataTypes,
      timeRange
    };
  }
}

// 数据质量评估工具
export class DataQualityAssessor {
  // 评估数据质量
  static assess(data: any[]): {
    completeness: number;
    accuracy: number;
    consistency: number;
    timeliness: number;
    overall: number;
    issues: string[];
  } {
    const totalItems = data.length;
    let validItems = 0;
    let inconsistentItems = 0;
    let issues: string[] = [];

    // 检查数据完整性和一致性
    data.forEach(item => {
      if (item.value && item.value !== '无数据') {
        validItems++;
        
        // 检查数据一致性
        if (typeof item.value === 'string') {
          const cleaned = CnbsDataHelper.validateAndCleanData(item.value);
          if (!cleaned) {
            inconsistentItems++;
            issues.push(`Invalid value: ${item.value}`);
          }
        }
      }
    });

    // 计算各项指标
    const completeness = totalItems > 0 ? validItems / totalItems : 1;
    const consistency = totalItems > 0 ? (validItems - inconsistentItems) / totalItems : 1;
    const accuracy = consistency; // 简化处理，实际应根据业务规则评估
    const timeliness = 0.9; // 简化处理，实际应根据数据更新时间评估

    // 计算总体质量
    const overall = (completeness + accuracy + consistency + timeliness) / 4;

    return {
      completeness: parseFloat((completeness * 100).toFixed(2)),
      accuracy: parseFloat((accuracy * 100).toFixed(2)),
      consistency: parseFloat((consistency * 100).toFixed(2)),
      timeliness: parseFloat((timeliness * 100).toFixed(2)),
      overall: parseFloat((overall * 100).toFixed(2)),
      issues
    };
  }
}
