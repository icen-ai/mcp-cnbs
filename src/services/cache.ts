// src/services/cache.ts
// Cloudflare Workers 版本 — 移除 fs/定时器/磁盘持久化，改为按需清理

// ─── 类型定义 ────────────────────────────────────────────────────────────────

interface CnbsCacheEntry<T> {
  key: string;
  value: T;
  expireAt: number;
  hitCount: number;
  lastHit: number;
  prev: CnbsCacheEntry<T> | null;
  next: CnbsCacheEntry<T> | null;
  size: number;
}

interface CnbsCacheOptions {
  capacity?: number;
  defaultExpire?: number;
  maxMemorySize?: number;
  cleanupInterval?: number;
}

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
  persistenceCount: number; // 保留字段兼容上层调用，恒为 0
}

// ─── LRU 缓存 ────────────────────────────────────────────────────────────────

export class CnbsLruCache<T> {
  private entryMap = new Map<string, CnbsCacheEntry<T>>();
  private head: CnbsCacheEntry<T> | null = null;
  private tail: CnbsCacheEntry<T> | null = null;

  private capacity: number;
  private defaultExpire: number;
  private maxMemorySize: number;
  private currentMemorySize: number = 0;
  private cleanupInterval: number;
  private lastCleanupTime: number = 0;

  private totalHits: number = 0;
  private totalMisses: number = 0;
  private evictionCount: number = 0;
  private expirationCount: number = 0;

  constructor(options: CnbsCacheOptions = {}) {
    this.capacity = options.capacity ?? 1000;
    this.defaultExpire = options.defaultExpire ?? 24 * 60 * 60 * 1000;
    this.maxMemorySize = options.maxMemorySize ?? 100 * 1024 * 1024;
    this.cleanupInterval = options.cleanupInterval ?? 60 * 1000;
    // ✅ 构造函数无任何副作用，不启动定时器
  }

  // ─── 按需清理（替代 setInterval）────────────────────────────────────────────

  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanupTime < this.cleanupInterval) return;
    this.lastCleanupTime = now;
    this.cleanupExpired();
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    this.entryMap.forEach((entry, key) => {
      if (now > entry.expireAt) expiredKeys.push(key);
    });

    for (const key of expiredKeys) {
      const entry = this.entryMap.get(key);
      if (entry) {
        this.removeEntryFromList(entry);
        this.entryMap.delete(key);
        this.expirationCount++;
      }
    }
  }

  // ─── 双向链表操作 ────────────────────────────────────────────────────────────

  private prependEntry(entry: CnbsCacheEntry<T>): void {
    entry.prev = null;
    entry.next = this.head;
    if (this.head !== null) this.head.prev = entry;
    this.head = entry;
    if (this.tail === null) this.tail = entry;
  }

  private removeEntryFromList(entry: CnbsCacheEntry<T>): void {
    if (entry.prev !== null) entry.prev.next = entry.next;
    else this.head = entry.next;

    if (entry.next !== null) entry.next.prev = entry.prev;
    else this.tail = entry.prev;

    this.currentMemorySize -= entry.size;
  }

  private promoteEntry(entry: CnbsCacheEntry<T>): void {
    this.removeEntryFromList(entry);
    this.prependEntry(entry);
  }

  private dropTail(): CnbsCacheEntry<T> | null {
    if (this.tail === null) return null;
    const tailEntry = this.tail;
    this.removeEntryFromList(tailEntry);
    this.evictionCount++;
    return tailEntry;
  }

  // ─── 工具 ────────────────────────────────────────────────────────────────────

  private calculateSize(value: T): number {
    try { return JSON.stringify(value).length; } catch { return 0; }
  }

  // ─── 公开 API ────────────────────────────────────────────────────────────────

  fetch(key: string): T | null {
    this.maybeCleanup();

    const entry = this.entryMap.get(key);
    if (!entry) {
      this.totalMisses++;
      return null;
    }

    if (Date.now() > entry.expireAt) {
      this.removeEntryFromList(entry);
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

  fetchMultiple(keys: string[]): Map<string, T> {
    const result = new Map<string, T>();
    for (const key of keys) {
      const value = this.fetch(key);
      if (value !== null) result.set(key, value);
    }
    return result;
  }

  store(key: string, value: T, ttl: number = this.defaultExpire): void {
    const size = this.calculateSize(value);

    // 内存压力淘汰
    while (this.currentMemorySize + size > this.maxMemorySize && this.entryMap.size > 0) {
      const tail = this.dropTail();
      if (tail) this.entryMap.delete(tail.key);
    }

    const existing = this.entryMap.get(key);
    if (existing) {
      this.currentMemorySize -= existing.size;
      existing.value = value;
      existing.size = size;
      existing.expireAt = Date.now() + ttl;
      existing.hitCount = 1;
      existing.lastHit = Date.now();
      this.promoteEntry(existing);
      this.currentMemorySize += size;
    } else {
      if (this.entryMap.size >= this.capacity) {
        const tail = this.dropTail();
        if (tail) this.entryMap.delete(tail.key);
      }

      const newEntry: CnbsCacheEntry<T> = {
        key, value,
        expireAt: Date.now() + ttl,
        hitCount: 1,
        lastHit: Date.now(),
        prev: null, next: null, size,
      };

      this.entryMap.set(key, newEntry);
      this.prependEntry(newEntry);
      this.currentMemorySize += size;
    }
  }

  storeMultiple(items: Array<{ key: string; value: T; ttl?: number }>): void {
    for (const item of items) this.store(item.key, item.value, item.ttl);
  }

  remove(key: string): void {
    const entry = this.entryMap.get(key);
    if (entry) {
      this.removeEntryFromList(entry);
      this.entryMap.delete(key);
    }
  }

  removeMultiple(keys: string[]): void {
    for (const key of keys) this.remove(key);
  }

  flush(): void {
    this.entryMap.clear();
    this.head = null;
    this.tail = null;
    this.currentMemorySize = 0;
  }

  count(): number { return this.entryMap.size; }

  getMemorySize(): number { return this.currentMemorySize; }

  getStats(): CnbsCacheStats {
    let oldestEntry: { key: string; age: number } | null = null;
    let topHit: { key: string; count: number } | null = null;

    this.entryMap.forEach((item, key) => {
      const age = Date.now() - item.lastHit;
      if (!oldestEntry || age > oldestEntry.age) oldestEntry = { key, age };
      if (!topHit || item.hitCount > topHit.count) topHit = { key, count: item.hitCount };
    });

    const total = this.totalHits + this.totalMisses;
    return {
      size: this.entryMap.size,
      capacity: this.capacity,
      memorySize: this.currentMemorySize,
      maxMemorySize: this.maxMemorySize,
      oldestEntry,
      topHit,
      hitRate: total > 0 ? parseFloat(((this.totalHits / total) * 100).toFixed(2)) : 0,
      missRate: total > 0 ? parseFloat(((this.totalMisses / total) * 100).toFixed(2)) : 0,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      evictionCount: this.evictionCount,
      expirationCount: this.expirationCount,
      persistenceCount: 0, // Workers 环境无持久化
    };
  }

  getCacheInfo(key: string): { timestamp: number; size: number; ttl: number; hits: number } | null {
    const entry = this.entryMap.get(key);
    if (!entry) return null;
    return {
      timestamp: entry.lastHit,
      size: entry.size,
      ttl: entry.expireAt - Date.now(),
      hits: entry.hitCount,
    };
  }

  // close() 保留空实现，防止上层调用报错
  close(): void {}
}

// ─── 缓存中心 ────────────────────────────────────────────────────────────────

export class CnbsCacheHub {
  private caches: Map<string, CnbsLruCache<any>> = new Map();
  private defaultOptions: CnbsCacheOptions = {
    capacity: 1000,
    defaultExpire: 24 * 60 * 60 * 1000,
    maxMemorySize: 100 * 1024 * 1024,
    cleanupInterval: 60 * 1000,
  };

  getCache<T>(name: string, options: CnbsCacheOptions = {}): CnbsLruCache<T> {
    if (!this.caches.has(name)) {
      this.caches.set(name, new CnbsLruCache<T>({ ...this.defaultOptions, ...options }));
    }
    return this.caches.get(name) as CnbsLruCache<T>;
  }

  removeCache(name: string): void {
    const cache = this.caches.get(name);
    if (cache) {
      cache.close();
      this.caches.delete(name);
    }
  }

  flushAll(): void {
    this.caches.forEach(cache => cache.flush());
  }

  getAllStats(): Record<string, CnbsCacheStats> {
    const stats: Record<string, CnbsCacheStats> = {};
    this.caches.forEach((cache, name) => { stats[name] = cache.getStats(); });
    return stats;
  }

  closeAll(): void {
    this.caches.forEach(cache => cache.close());
    this.caches.clear();
  }
}

// ─── 懒加载单例（✅ 模块加载时零副作用）────────────────────────────────────

let _hub: CnbsCacheHub | null = null;

export function getCnbsCacheHub(): CnbsCacheHub {
  if (!_hub) _hub = new CnbsCacheHub();
  return _hub;
}

/**
 * 兼容旧版 `cnbsCacheHub.getCache(...)` 调用方式。
 * ⚠️  只能在 handler / 函数体内使用，不能在模块顶层赋值后立即调用方法。
 *
 * 旧代码：import { cnbsCacheHub } from './services/cache.js'
 *         cnbsCacheHub.getCache('xxx')
 *
 * 无需改动上层调用，直接替换导出即可。
 */
export const cnbsCacheHub: CnbsCacheHub = new Proxy({} as CnbsCacheHub, {
  get(_target, prop) {
    return (getCnbsCacheHub() as any)[prop];
  },
});

// ─── 缓存键工具 ──────────────────────────────────────────────────────────────

export class CacheKeyGenerator {
  static generateSearchKey(keyword: string, pageNum: number = 1, pageSize: number = 10): string {
    return `search_${keyword.toLowerCase()}_${pageNum}_${pageSize}`;
  }

  static generateNodeKey(category: string, parentId?: string): string {
    return `node_${category}_${parentId ?? 'root'}`;
  }

  static generateMetricKey(setId: string, name?: string): string {
    return `metric_${setId}_${name ?? 'all'}`;
  }

  static generateSeriesKey(
      setId: string,
      metricIds: string[],
      periods: string[],
      areas?: Array<{ text: string; code: string }>,
  ): string {
    const metricKey = [...metricIds].sort().join('_');
    const periodKey = [...periods].sort().join('_');
    const areaKey = areas ? areas.map(a => a.code).sort().join('_') : '000000000000';
    return `series_${setId}_${metricKey}_${periodKey}_${areaKey}`;
  }

  static generateDataSourceKey(source: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');
    return `datasource_${source}_${sortedParams}`;
  }
}