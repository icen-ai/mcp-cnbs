import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

// 缓存条目接口
interface CnbsCacheEntry<T> {
  key: string;
  value: T;
  expireAt: number;
  hitCount: number;
  lastHit: number;
  prev: CnbsCacheEntry<T> | null;
  next: CnbsCacheEntry<T> | null;
  size: number; // 缓存值的大小（字节）
}

// 缓存配置接口
interface CnbsCacheOptions {
  persistPath?: string;
  capacity?: number;
  defaultExpire?: number;
  maxMemorySize?: number; // 最大内存使用（字节）
  persistInterval?: number; // 持久化间隔（毫秒）
  cleanupInterval?: number; // 清理间隔（毫秒）
  compression?: boolean; // 是否启用压缩
}

// 缓存统计接口
interface CnbsCacheStats {
  size: number;
  capacity: number;
  memorySize: number;
  maxMemorySize: number;
  oldestEntry: { key: string; age: number } | null;
  topHit: { key: string; count: number } | null;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  evictionCount: number;
  expirationCount: number;
  persistenceCount: number;
}

// 异步文件操作
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const mkdirAsync = promisify(fs.mkdir);
const existsAsync = promisify(fs.exists);

export class CnbsLruCache<T> {
  private entryMap = new Map<string, CnbsCacheEntry<T>>();
  private head: CnbsCacheEntry<T> | null = null;
  private tail: CnbsCacheEntry<T> | null = null;
  
  private persistPath: string | null = null;
  private capacity: number;
  private defaultExpire: number;
  private maxMemorySize: number;
  private currentMemorySize: number = 0;
  private persistInterval: number;
  private cleanupInterval: number;
  private compression: boolean;
  
  // 统计信息
  private totalHits: number = 0;
  private totalMisses: number = 0;
  private evictionCount: number = 0;
  private expirationCount: number = 0;
  private persistenceCount: number = 0;
  
  // 定时器
  private persistTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  // 并发控制
  private persistLock: boolean = false;

  constructor(options: CnbsCacheOptions = {}) {
    this.persistPath = options.persistPath || null;
    this.capacity = options.capacity || 1000;
    this.defaultExpire = options.defaultExpire || 24 * 60 * 60 * 1000;
    this.maxMemorySize = options.maxMemorySize || 100 * 1024 * 1024; // 默认100MB
    this.persistInterval = options.persistInterval || 5 * 60 * 1000; // 默认5分钟
    this.cleanupInterval = options.cleanupInterval || 60 * 1000; // 默认1分钟
    this.compression = options.compression || false;
    
    this.loadFromDisk();
    this.startTimers();
  }

  // 启动定时器
  private startTimers(): void {
    // 定期持久化
    this.persistTimer = setInterval(() => {
      this.saveToDiskAsync();
    }, this.persistInterval);
    
    // 定期清理过期数据
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.cleanupInterval);
  }

  // 停止定时器
  private stopTimers(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // 前置条目
  private prependEntry(entry: CnbsCacheEntry<T>): void {
    entry.prev = null;
    entry.next = this.head;

    if (this.head !== null) {
      this.head.prev = entry;
    }
    this.head = entry;

    if (this.tail === null) {
      this.tail = entry;
    }
  }

  // 删除条目
  private deleteEntry(entry: CnbsCacheEntry<T>): void {
    if (entry.prev !== null) {
      entry.prev.next = entry.next;
    } else {
      this.head = entry.next;
    }

    if (entry.next !== null) {
      entry.next.prev = entry.prev;
    } else {
      this.tail = entry.prev;
    }
    
    // 更新内存使用
    this.currentMemorySize -= entry.size;
  }

  // 提升条目
  private promoteEntry(entry: CnbsCacheEntry<T>): void {
    this.deleteEntry(entry);
    this.prependEntry(entry);
  }

  // 删除尾部条目
  private dropTail(): CnbsCacheEntry<T> | null {
    if (this.tail === null) return null;

    const tailEntry = this.tail;
    this.deleteEntry(tailEntry);
    this.evictionCount++;
    return tailEntry;
  }

  // 清理过期数据
  private cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    this.entryMap.forEach((entry, key) => {
      if (now > entry.expireAt) {
        expiredKeys.push(key);
      }
    });
    
    for (const key of expiredKeys) {
      const entry = this.entryMap.get(key);
      if (entry) {
        this.deleteEntry(entry);
        this.entryMap.delete(key);
        this.expirationCount++;
      }
    }
    
    if (expiredKeys.length > 0) {
      console.info(`Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }

  // 计算值的大小
  private calculateSize(value: T): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }

  // 获取缓存
  fetch(key: string): T | null {
    const entry = this.entryMap.get(key);
    if (!entry) {
      this.totalMisses++;
      return null;
    }

    if (Date.now() > entry.expireAt) {
      this.deleteEntry(entry);
      this.entryMap.delete(key);
      this.expirationCount++;
      this.totalMisses++;
      return null;
    }

    entry.hitCount++;
    entry.lastHit = Date.now();
    this.promoteEntry(entry);
    this.totalHits++;

    return entry.value;
  }

  // 批量获取缓存
  fetchMultiple(keys: string[]): Map<string, T> {
    const result = new Map<string, T>();
    
    for (const key of keys) {
      const value = this.fetch(key);
      if (value !== null) {
        result.set(key, value);
      }
    }
    
    return result;
  }

  // 存储缓存
  store(key: string, value: T, ttl: number = this.defaultExpire): void {
    const size = this.calculateSize(value);
    
    // 检查内存限制
    while (this.currentMemorySize + size > this.maxMemorySize && this.entryMap.size > 0) {
      const tailEntry = this.dropTail();
      if (tailEntry) {
        this.entryMap.delete(tailEntry.key);
      }
    }

    const existingEntry = this.entryMap.get(key);
    
    if (existingEntry) {
      // 更新现有条目
      this.currentMemorySize -= existingEntry.size;
      existingEntry.value = value;
      existingEntry.size = size;
      existingEntry.expireAt = Date.now() + ttl;
      existingEntry.hitCount = 1;
      existingEntry.lastHit = Date.now();
      this.promoteEntry(existingEntry);
      this.currentMemorySize += size;
    } else {
      // 检查容量限制
      if (this.entryMap.size >= this.capacity) {
        const tailEntry = this.dropTail();
        if (tailEntry) {
          this.entryMap.delete(tailEntry.key);
        }
      }

      // 创建新条目
      const newEntry: CnbsCacheEntry<T> = {
        key,
        value,
        expireAt: Date.now() + ttl,
        hitCount: 1,
        lastHit: Date.now(),
        prev: null,
        next: null,
        size,
      };

      this.entryMap.set(key, newEntry);
      this.prependEntry(newEntry);
      this.currentMemorySize += size;
    }
  }

  // 批量存储缓存
  storeMultiple(items: Array<{ key: string; value: T; ttl?: number }>): void {
    for (const item of items) {
      this.store(item.key, item.value, item.ttl);
    }
  }

  // 删除缓存
  remove(key: string): void {
    const entry = this.entryMap.get(key);
    if (entry) {
      this.deleteEntry(entry);
      this.entryMap.delete(key);
    }
  }

  // 批量删除缓存
  removeMultiple(keys: string[]): void {
    for (const key of keys) {
      this.remove(key);
    }
  }

  // 清空缓存
  flush(): void {
    this.entryMap.clear();
    this.head = null;
    this.tail = null;
    this.currentMemorySize = 0;
    this.saveToDisk();
  }

  // 获取缓存数量
  count(): number {
    return this.entryMap.size;
  }

  // 获取内存使用
  getMemorySize(): number {
    return this.currentMemorySize;
  }

  // 获取统计信息
  getStats(): CnbsCacheStats {
    if (this.entryMap.size === 0) {
      return {
        size: 0,
        capacity: this.capacity,
        memorySize: this.currentMemorySize,
        maxMemorySize: this.maxMemorySize,
        oldestEntry: null,
        topHit: null,
        hitRate: 0,
        missRate: 0,
        totalHits: this.totalHits,
        totalMisses: this.totalMisses,
        evictionCount: this.evictionCount,
        expirationCount: this.expirationCount,
        persistenceCount: this.persistenceCount,
      };
    }

    let oldestEntry: { key: string; age: number } | null = null;
    let topHit: { key: string; count: number } | null = null;

    this.entryMap.forEach((item, key) => {
      const age = Date.now() - item.lastHit;
      if (!oldestEntry || age > oldestEntry.age) {
        oldestEntry = { key, age };
      }

      if (!topHit || item.hitCount > topHit.count) {
        topHit = { key, count: item.hitCount };
      }
    });

    const totalRequests = this.totalHits + this.totalMisses;
    const hitRate = totalRequests > 0 ? this.totalHits / totalRequests : 0;
    const missRate = totalRequests > 0 ? this.totalMisses / totalRequests : 0;

    return {
      size: this.entryMap.size,
      capacity: this.capacity,
      memorySize: this.currentMemorySize,
      maxMemorySize: this.maxMemorySize,
      oldestEntry,
      topHit,
      hitRate: parseFloat((hitRate * 100).toFixed(2)),
      missRate: parseFloat((missRate * 100).toFixed(2)),
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      evictionCount: this.evictionCount,
      expirationCount: this.expirationCount,
      persistenceCount: this.persistenceCount,
    };
  }

  // 获取缓存信息
  getCacheInfo(key: string): {
    timestamp: number;
    size: number;
    ttl: number;
    hits: number;
  } | null {
    const entry = this.entryMap.get(key);
    if (!entry) return null;

    return {
      timestamp: entry.lastHit,
      size: entry.size,
      ttl: entry.expireAt - Date.now(),
      hits: entry.hitCount,
    };
  }

  // 同步保存到磁盘
  saveToDisk(): void {
    if (!this.persistPath) return;

    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const dataToSave: Array<{
        key: string;
        value: T;
        expireAt: number;
        hitCount: number;
        lastHit: number;
        size: number;
      }> = [];

      let current = this.head;
      while (current !== null) {
        dataToSave.push({
          key: current.key,
          value: current.value,
          expireAt: current.expireAt,
          hitCount: current.hitCount,
          lastHit: current.lastHit,
          size: current.size,
        });
        current = current.next;
      }

      fs.writeFileSync(this.persistPath, JSON.stringify(dataToSave));
      this.persistenceCount++;
    } catch (error) {
      console.error('Failed to save cache to disk:', error);
    }
  }

  // 异步保存到磁盘
  async saveToDiskAsync(): Promise<void> {
    if (!this.persistPath || this.persistLock) return;

    this.persistLock = true;
    try {
      const dir = path.dirname(this.persistPath);
      if (!(await existsAsync(dir))) {
        await mkdirAsync(dir, { recursive: true });
      }

      const dataToSave: Array<{
        key: string;
        value: T;
        expireAt: number;
        hitCount: number;
        lastHit: number;
        size: number;
      }> = [];

      let current = this.head;
      while (current !== null) {
        dataToSave.push({
          key: current.key,
          value: current.value,
          expireAt: current.expireAt,
          hitCount: current.hitCount,
          lastHit: current.lastHit,
          size: current.size,
        });
        current = current.next;
      }

      await writeFileAsync(this.persistPath, JSON.stringify(dataToSave));
      this.persistenceCount++;
    } catch (error) {
      console.error('Failed to save cache to disk:', error);
    } finally {
      this.persistLock = false;
    }
  }

  // 从磁盘加载
  loadFromDisk(): void {
    if (!this.persistPath || !fs.existsSync(this.persistPath)) return;

    try {
      const data = fs.readFileSync(this.persistPath, 'utf8');
      const cachedItems = JSON.parse(data) as Array<{
        key: string;
        value: T;
        expireAt: number;
        hitCount: number;
        lastHit: number;
        size: number;
      }>;

      const now = Date.now();
      for (const item of cachedItems) {
        if (item.expireAt > now) {
          const newEntry: CnbsCacheEntry<T> = {
            key: item.key,
            value: item.value,
            expireAt: item.expireAt,
            hitCount: item.hitCount,
            lastHit: item.lastHit,
            prev: null,
            next: null,
            size: item.size,
          };

          this.entryMap.set(item.key, newEntry);
          this.prependEntry(newEntry);
          this.currentMemorySize += item.size;
        }
      }
      
      console.info(`Loaded ${this.entryMap.size} cache entries from disk`);
    } catch (error) {
      console.error('Failed to load cache from disk:', error);
    }
  }

  // 关闭缓存
  close(): void {
    this.stopTimers();
    this.saveToDisk();
  }
}

export class CnbsCacheHub {
  private caches: Map<string, CnbsLruCache<any>> = new Map();
  private defaultOptions: CnbsCacheOptions = {
    capacity: 1000,
    defaultExpire: 24 * 60 * 60 * 1000,
    maxMemorySize: 100 * 1024 * 1024,
    persistInterval: 5 * 60 * 1000,
    cleanupInterval: 60 * 1000,
    compression: false,
  };

  // 获取缓存
  getCache<T>(name: string, options: CnbsCacheOptions = {}): CnbsLruCache<T> {
    if (!this.caches.has(name)) {
      const cacheOptions = { ...this.defaultOptions, ...options };
      this.caches.set(name, new CnbsLruCache<T>(cacheOptions));
    }
    return this.caches.get(name) as CnbsLruCache<T>;
  }

  // 删除缓存
  removeCache(name: string): void {
    const cache = this.caches.get(name);
    if (cache) {
      cache.close();
      this.caches.delete(name);
    }
  }

  // 清空所有缓存
  flushAll(): void {
    this.caches.forEach(cache => cache.flush());
  }

  // 获取所有缓存统计
  getAllStats(): Record<string, CnbsCacheStats> {
    const stats: Record<string, CnbsCacheStats> = {};
    this.caches.forEach((cache, name) => {
      stats[name] = cache.getStats();
    });
    return stats;
  }

  // 关闭所有缓存
  closeAll(): void {
    this.caches.forEach(cache => cache.close());
    this.caches.clear();
  }
}

// 全局缓存中心
export const cnbsCacheHub = new CnbsCacheHub();

// 缓存键生成工具
export class CacheKeyGenerator {
  // 生成搜索缓存键
  static generateSearchKey(keyword: string, pageNum: number = 1, pageSize: number = 10): string {
    return `search_${keyword.toLowerCase()}_${pageNum}_${pageSize}`;
  }

  // 生成节点缓存键
  static generateNodeKey(category: string, parentId?: string): string {
    return `node_${category}_${parentId || 'root'}`;
  }

  // 生成指标缓存键
  static generateMetricKey(setId: string, name?: string): string {
    return `metric_${setId}_${name || 'all'}`;
  }

  // 生成数据系列缓存键
  static generateSeriesKey(setId: string, metricIds: string[], periods: string[], areas?: Array<{ text: string; code: string }>): string {
    const metricKey = metricIds.sort().join('_');
    const periodKey = periods.sort().join('_');
    const areaKey = areas ? areas.map(a => a.code).sort().join('_') : '000000000000';
    return `series_${setId}_${metricKey}_${periodKey}_${areaKey}`;
  }

  // 生成数据源缓存键
  static generateDataSourceKey(source: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return `datasource_${source}_${sortedParams}`;
  }
}

