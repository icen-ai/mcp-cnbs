export enum CnbsErrorType {
  NETWORK_ISSUE = 'NETWORK_ISSUE',
  API_FAILURE = 'API_FAILURE',
  TIMEOUT_ISSUE = 'TIMEOUT_ISSUE',
  RATE_LIMIT = 'RATE_LIMIT',
  DATA_ISSUE = 'DATA_ISSUE',
  UNKNOWN = 'UNKNOWN',
}

export interface CnbsErrorDetails {
  type: CnbsErrorType;
  message: string;
  source?: any;
  canRetry: boolean;
}

export class CnbsErrorHandler {
  static analyze(error: any): CnbsErrorDetails {
    if (!error) {
      return {
        type: CnbsErrorType.UNKNOWN,
        message: 'Unknown error occurred',
        canRetry: false,
      };
    }

    if (error.isAxiosError) {
      if (error.code === 'ECONNABORTED') {
        return {
          type: CnbsErrorType.TIMEOUT_ISSUE,
          message: 'Request timed out',
          source: error,
          canRetry: true,
        };
      }

      if (error.response) {
        const status = error.response.status;
        if (status === 429) {
          return {
            type: CnbsErrorType.RATE_LIMIT,
            message: 'Rate limit exceeded',
            source: error,
            canRetry: true,
          };
        }
        if (status >= 500) {
          return {
            type: CnbsErrorType.API_FAILURE,
            message: `API error: ${status} ${error.response.statusText}`,
            source: error,
            canRetry: true,
          };
        }
        if (status >= 400) {
          return {
            type: CnbsErrorType.API_FAILURE,
            message: `API error: ${status} ${error.response.statusText}`,
            source: error,
            canRetry: false,
          };
        }
      }

      if (error.request) {
        return {
          type: CnbsErrorType.NETWORK_ISSUE,
          message: 'Network error: No response received',
          source: error,
          canRetry: true,
        };
      }

      return {
        type: CnbsErrorType.UNKNOWN,
        message: error.message || 'Unknown error',
        source: error,
        canRetry: false,
      };
    }

    if (error instanceof Error) {
      return {
        type: CnbsErrorType.UNKNOWN,
        message: error.message,
        source: error,
        canRetry: false,
      };
    }

    return {
      type: CnbsErrorType.UNKNOWN,
      message: String(error),
      source: error,
      canRetry: false,
    };
  }

  static async retryWithBackoff<T>(
    operation: () => Promise<T>,
    settings?: {
      maxAttempts?: number;
      baseDelay?: number;
      maxDelay?: number;
      backoffFactor?: number;
    }
  ): Promise<T> {
    const maxAttempts = settings?.maxAttempts || 3;
    const baseDelay = settings?.baseDelay || 1000;
    const maxDelay = settings?.maxDelay || 10000;
    const backoffFactor = settings?.backoffFactor || 2;

    let lastError: any;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const errorDetails = this.analyze(error);
        lastError = error;

        console.error(`Attempt ${attempt + 1} failed: ${errorDetails.message}`);
        if ((error as any)?.code) {
          console.error(`Error code: ${(error as any).code}`);
        }
        if ((error as any)?.message) {
          console.error(`Error message: ${(error as any).message}`);
        }

        if (!errorDetails.canRetry || attempt >= maxAttempts) {
          throw error;
        }

        const delay = Math.min(
          baseDelay * Math.pow(backoffFactor, attempt),
          maxDelay
        );

        console.error(`Retrying in ${delay}ms...`);
        await this.wait(delay);
      }
    }

    throw lastError;
  }

  private static wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class CnbsRequestThrottler {
  private taskQueue: Array<() => Promise<any>> = [];
  private active = 0;
  private maxConcurrent = 3;
  private minInterval = 300;
  private lastExecutionTime = 0;

  constructor(settings?: {
    maxConcurrent?: number;
    minInterval?: number;
  }) {
    this.maxConcurrent = settings?.maxConcurrent || 3;
    this.minInterval = settings?.minInterval || 300;
  }

  async execute<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push(async () => {
        try {
          const now = Date.now();
          const timeSinceLast = now - this.lastExecutionTime;
          if (timeSinceLast < this.minInterval) {
            await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLast));
          }
          this.lastExecutionTime = Date.now();

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

  private processQueue(): void {
    while (this.taskQueue.length > 0 && this.active < this.maxConcurrent) {
      const task = this.taskQueue.shift();
      if (task) {
        this.active++;
        task();
      }
    }
  }

  getStatus(): {
    queueSize: number;
    active: number;
    maxConcurrent: number;
  } {
    return {
      queueSize: this.taskQueue.length,
      active: this.active,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

export const cnbsRequestThrottler = new CnbsRequestThrottler();
