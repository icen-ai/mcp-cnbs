export class CnbsDataHelper {
  static formatNumber(value: string | undefined, precision: number = 2): string {
    if (!value) return '无数据';

    const num = parseFloat(value);
    if (isNaN(num)) return value;

    return num.toFixed(precision);
  }

  static transformUnit(value: string | undefined, sourceUnit: string, targetUnit: string): string {
    if (!value) return '无数据';

    const num = parseFloat(value);
    if (isNaN(num)) return value;

    const conversionTable: Record<string, Record<string, number>> = {
      '元': {
        '万元': 0.0001,
        '亿元': 0.00000001
      },
      '万元': {
        '元': 10000,
        '亿元': 0.0001
      },
      '亿元': {
        '元': 100000000,
        '万元': 10000
      },
      '吨': {
        '万吨': 0.0001
      },
      '万吨': {
        '吨': 10000
      }
    };

    if (conversionTable[sourceUnit] && conversionTable[sourceUnit][targetUnit]) {
      const factor = conversionTable[sourceUnit][targetUnit];
      return (num * factor).toString();
    }

    return value;
  }

  static computeStats(values: string[]): {
    min: number;
    max: number;
    avg: number;
    total: number;
  } {
    const nums = values
      .map(v => parseFloat(v))
      .filter(n => !isNaN(n));

    if (nums.length === 0) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        total: 0
      };
    }

    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const total = nums.reduce((acc, num) => acc + num, 0);
    const avg = total / nums.length;

    return {
      min,
      max,
      avg,
      total
    };
  }

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

    return periodCode;
  }

  static parsePeriodRange(range: string): { start: string; end: string } {
    const parts = range.split('-');
    return {
      start: parts[0] || '',
      end: parts[1] || ''
    };
  }
}
