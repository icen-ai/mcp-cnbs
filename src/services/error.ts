// 错误类型枚举
export enum CnbsErrorType {
  NETWORK_ISSUE = 'NETWORK_ISSUE',
  API_FAILURE = 'API_FAILURE',
  TIMEOUT_ISSUE = 'TIMEOUT_ISSUE',
  RATE_LIMIT = 'RATE_LIMIT',
  DATA_ISSUE = 'DATA_ISSUE',
  ACCESS_BLOCKED = 'ACCESS_BLOCKED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  THROTTLE_ERROR = 'THROTTLE_ERROR',
  UNKNOWN = 'UNKNOWN',
}

// 错误详细信息接口
export interface CnbsErrorDetails {
  type: CnbsErrorType;
  message: string;
  source?: any;
  canRetry: boolean;
  code?: string;
  endpoint?: string;
  status?: number;
  contentType?: string;
  tool?: string;
  attempt?: number;
  maxAttempts?: number;
  retryAfter?: number;
  hints?: string[];
  rawSnippet?: string;
}

export class CnbsServiceError extends Error {
  details: CnbsErrorDetails;

  constructor(details: CnbsErrorDetails) {
    super(details.message);
    this.name = 'CnbsServiceError';
    this.details = details;
  }
}

// 错误监控接口
export interface ErrorMonitor {
  trackError(error: CnbsErrorDetails): void;
  getErrorStats(): Record<string, number>;
  resetStats(): void;
}

// 错误监控实现
class DefaultErrorMonitor implements ErrorMonitor {
  private errorStats: Record<string, number> = {};

  trackError(error: CnbsErrorDetails): void {
    const errorType = error.type;
    this.errorStats[errorType] = (this.errorStats[errorType] || 0) + 1;
    
    // 记录详细错误信息
    console.error(`[Error] ${errorType}: ${error.message}`);
    if (error.source) {
      console.error('Source:', error.source);
    }
  }

  getErrorStats(): Record<string, number> {
    return { ...this.errorStats };
  }

  resetStats(): void {
    this.errorStats = {};
  }
}

// 全局错误监控实例
export const errorMonitor = new DefaultErrorMonitor();

// 错误处理类
export class CnbsErrorHandler {
  // 分析错误
  static analyze(error: any): CnbsErrorDetails {
    if (!error) {
      const details: CnbsErrorDetails = {
        type: CnbsErrorType.UNKNOWN,
        message: 'Unknown error occurred',
        canRetry: false,
      };
      errorMonitor.trackError(details);
      return details;
    }

    if (error instanceof CnbsServiceError) {
      errorMonitor.trackError(error.details);
      return error.details;
    }

    if (error.isAxiosError) {
      if (error.code === 'ECONNABORTED') {
        const details: CnbsErrorDetails = {
          type: CnbsErrorType.TIMEOUT_ISSUE,
          message: 'Request timed out',
          source: error,
          canRetry: true,
          code: error.code,
        };
        errorMonitor.trackError(details);
        return details;
      }

      if (error.code === 'ERR_FR_TOO_MANY_REDIRECTS') {
        const details: CnbsErrorDetails = {
          type: CnbsErrorType.ACCESS_BLOCKED,
          message: 'Remote CNBS service entered a redirect loop, likely due to anti-bot or access control.',
          source: error,
          canRetry: false,
          code: error.code,
          hints: [
            'The upstream site may be serving a WAF or anti-bot challenge instead of JSON data.',
            'Verify whether this network path requires a browser session, proxy, or additional cookies.'
          ],
        };
        errorMonitor.trackError(details);
        return details;
      }

      if (error.response) {
        const status = error.response.status;
        if (status === 429) {
          // 提取重试时间
          const retryAfter = error.response.headers['retry-after'];
          const details: CnbsErrorDetails = {
            type: CnbsErrorType.RATE_LIMIT,
            message: 'Rate limit exceeded',
            source: error,
            canRetry: true,
            code: error.code,
            status,
            retryAfter: retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined,
          };
          errorMonitor.trackError(details);
          return details;
        }
        if (status >= 500) {
          const details: CnbsErrorDetails = {
            type: CnbsErrorType.API_FAILURE,
            message: `API error: ${status} ${error.response.statusText}`,
            source: error,
            canRetry: true,
            code: error.code,
            status,
          };
          errorMonitor.trackError(details);
          return details;
        }
        if (status >= 400) {
          const details: CnbsErrorDetails = {
            type: CnbsErrorType.API_FAILURE,
            message: `API error: ${status} ${error.response.statusText}`,
            source: error,
            canRetry: false,
            code: error.code,
            status,
          };
          errorMonitor.trackError(details);
          return details;
        }
      }

      if (error.request) {
        const details: CnbsErrorDetails = {
          type: CnbsErrorType.NETWORK_ISSUE,
          message: 'Network error: No response received',
          source: error,
          canRetry: true,
          code: error.code,
        };
        errorMonitor.trackError(details);
        return details;
      }

      const details: CnbsErrorDetails = {
        type: CnbsErrorType.UNKNOWN,
        message: error.message || 'Unknown error',
        source: error,
        canRetry: false,
        code: error.code,
      };
      errorMonitor.trackError(details);
      return details;
    }

    if (error instanceof Error) {
      // 处理验证错误
      if (error.name === 'ValidationError' || error.message.includes('validation')) {
        const details: CnbsErrorDetails = {
          type: CnbsErrorType.VALIDATION_ERROR,
          message: error.message,
          source: error,
          canRetry: false,
        };
        errorMonitor.trackError(details);
        return details;
      }

      // 处理缓存错误
      if (error.message.includes('cache')) {
        const details: CnbsErrorDetails = {
          type: CnbsErrorType.CACHE_ERROR,
          message: error.message,
          source: error,
          canRetry: true,
        };
        errorMonitor.trackError(details);
        return details;
      }

      const details: CnbsErrorDetails = {
        type: CnbsErrorType.UNKNOWN,
        message: error.message,
        source: error,
        canRetry: false,
      };
      errorMonitor.trackError(details);
      return details;
    }

    const details: CnbsErrorDetails = {
      type: CnbsErrorType.UNKNOWN,
      message: String(error),
      source: error,
      canRetry: false,
    };
    errorMonitor.trackError(details);
    return details;
  }

  // 带退避的重试
  static async retryWithBackoff<T>(
    operation: () => Promise<T>,
    settings?: {
      maxAttempts?: number;
      baseDelay?: number;
      maxDelay?: number;
      backoffFactor?: number;
      retryableErrorTypes?: CnbsErrorType[];
    }
  ): Promise<T> {
    const maxAttempts = settings?.maxAttempts || 3;
    const baseDelay = settings?.baseDelay || 1000;
    const maxDelay = settings?.maxDelay || 10000;
    const backoffFactor = settings?.backoffFactor || 2;
    const retryableErrorTypes = settings?.retryableErrorTypes || [
      CnbsErrorType.NETWORK_ISSUE,
      CnbsErrorType.TIMEOUT_ISSUE,
      CnbsErrorType.RATE_LIMIT,
      CnbsErrorType.API_FAILURE,
      CnbsErrorType.CACHE_ERROR,
    ];

    let lastError: any;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const errorDetails = this.analyze(error);
        lastError = error;

        console.error(`Attempt ${attempt + 1}/${maxAttempts} failed: ${errorDetails.message}`);
        if ((error as any)?.code) {
          console.error(`Error code: ${(error as any).code}`);
        }

        // 检查是否可以重试
        const canRetry = errorDetails.canRetry && retryableErrorTypes.includes(errorDetails.type);
        if (!canRetry || attempt >= maxAttempts - 1) {
          throw error;
        }

        // 计算延迟时间
        let delay = errorDetails.retryAfter || Math.min(
          baseDelay * Math.pow(backoffFactor, attempt),
          maxDelay
        );

        // 添加随机抖动，避免重试风暴
        delay = delay * (0.8 + Math.random() * 0.4);

        console.error(`Retrying in ${Math.round(delay)}ms...`);
        await this.wait(Math.round(delay));
      }
    }

    throw lastError;
  }

  // 等待指定时间
  private static wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 安全执行操作，捕获并处理错误
  static async safeExecute<T>(
    operation: () => Promise<T>,
    fallback?: T
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      const errorDetails = this.analyze(error);
      console.error(`Safe execute failed: ${errorDetails.message}`);
      return fallback;
    }
  }

  static createServiceError(details: CnbsErrorDetails): CnbsServiceError {
    return new CnbsServiceError(details);
  }

  static toToolErrorData(error: unknown, tool?: string): { message: string; details: CnbsErrorDetails } {
    const details = this.analyze(error);
    const mergedDetails = tool ? { ...details, tool } : details;
    return {
      message: mergedDetails.message,
      details: mergedDetails,
    };
  }
}

// 请求节流器类
export class CnbsRequestThrottler {
  private taskQueue: Array<() => Promise<any>> = [];
  private active = 0;
  private maxConcurrent = 3;
  private minInterval = 300;
  private lastExecutionTime = 0;
  private isPaused = false;
  private pauseReason?: string;

  constructor(settings?: {
    maxConcurrent?: number;
    minInterval?: number;
  }) {
    this.maxConcurrent = settings?.maxConcurrent || 3;
    this.minInterval = settings?.minInterval || 300;
  }

  // 执行任务
  async execute<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push(async () => {
        try {
          // 检查是否暂停
          if (this.isPaused) {
            throw new Error(`Throttler is paused: ${this.pauseReason || 'Unknown reason'}`);
          }

          // 控制请求间隔
          const now = Date.now();
          const timeSinceLast = now - this.lastExecutionTime;
          if (timeSinceLast < this.minInterval) {
            await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLast));
          }
          this.lastExecutionTime = Date.now();

          // 执行任务
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.active--;
          this.processQueue();
        }
      });

      this.processQueue();
    });
  }

  // 处理任务队列
  private processQueue(): void {
    if (this.isPaused) {
      return;
    }

    while (this.taskQueue.length > 0 && this.active < this.maxConcurrent) {
      const task = this.taskQueue.shift();
      if (task) {
        this.active++;
        task();
      }
    }
  }

  // 暂停节流器
  pause(reason?: string): void {
    this.isPaused = true;
    this.pauseReason = reason;
    console.warn(`Throttler paused: ${reason || 'Unknown reason'}`);
  }

  // 恢复节流器
  resume(): void {
    this.isPaused = false;
    this.pauseReason = undefined;
    console.info('Throttler resumed');
    this.processQueue();
  }

  // 获取状态
  getStatus(): {
    queueSize: number;
    active: number;
    maxConcurrent: number;
    isPaused: boolean;
    pauseReason?: string;
  } {
    return {
      queueSize: this.taskQueue.length,
      active: this.active,
      maxConcurrent: this.maxConcurrent,
      isPaused: this.isPaused,
      pauseReason: this.pauseReason,
    };
  }

  // 清空队列
  clearQueue(): void {
    this.taskQueue = [];
    console.info('Throttler queue cleared');
  }

  // 调整并发数
  setMaxConcurrent(maxConcurrent: number): void {
    if (maxConcurrent > 0) {
      this.maxConcurrent = maxConcurrent;
      console.info(`Throttler max concurrent set to ${maxConcurrent}`);
      this.processQueue();
    }
  }

  // 调整最小间隔
  setMinInterval(minInterval: number): void {
    if (minInterval >= 0) {
      this.minInterval = minInterval;
      console.info(`Throttler min interval set to ${minInterval}ms`);
    }
  }
}

// 全局节流器实例
export const cnbsRequestThrottler = new CnbsRequestThrottler({
  maxConcurrent: 5,
  minInterval: 200,
});

// 边界情况处理工具
export class CnbsBoundaryHandler {
  // 检查空值
  static checkEmpty<T>(value: T, defaultValue: T): T {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    return value;
  }

  // 检查数组边界
  static safeArrayAccess<T>(array: T[], index: number, defaultValue: T): T {
    if (!array || index < 0 || index >= array.length) {
      return defaultValue;
    }
    return array[index];
  }

  // 检查对象属性
  static safePropertyAccess<T>(obj: any, path: string, defaultValue: T): T {
    if (!obj) {
      return defaultValue;
    }

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current[part] === undefined) {
        return defaultValue;
      }
      current = current[part];
    }

    return current as T;
  }

  // 验证参数
  static validateParams(params: any, required: string[]): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const field of required) {
      if (params[field] === null || params[field] === undefined) {
        missing.push(field);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  // 安全转换数字
  static safeNumber(value: any, defaultValue: number = 0): number {
    const num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
  }

  // 安全转换字符串
  static safeString(value: any, defaultValue: string = ''): string {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    return String(value);
  }

  // 安全转换布尔值
  static safeBoolean(value: any, defaultValue: boolean = false): boolean {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return defaultValue;
  }

  // 安全过滤数组
  static safeFilter<T>(array: T[], predicate: (item: T) => boolean): T[] {
    if (!array || !Array.isArray(array)) {
      return [];
    }
    return array.filter(predicate);
  }
}

