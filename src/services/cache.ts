import fs from 'fs';
import path from 'path';

interface CnbsCacheEntry<T> {
  key: string;
  value: T;
  expireAt: number;
  hitCount: number;
  lastHit: number;
  prev: CnbsCacheEntry<T> | null;
  next: CnbsCacheEntry<T> | null;
}

export class CnbsLruCache<T> {
  private entryMap = new Map<string, CnbsCacheEntry<T>>();
  private head: CnbsCacheEntry<T> | null = null;
  private tail: CnbsCacheEntry<T> | null = null;
  
  private persistPath: string | null = null;
  private capacity: number;
  private defaultExpire: number;

  constructor(options?: {
    persistPath?: string;
    capacity?: number;
    defaultExpire?: number;
  }) {
    this.persistPath = options?.persistPath || null;
    this.capacity = options?.capacity || 1000;
    this.defaultExpire = options?.defaultExpire || 24 * 60 * 60 * 1000;
    this.loadFromDisk();
  }

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
  }

  private promoteEntry(entry: CnbsCacheEntry<T>): void {
    this.deleteEntry(entry);
    this.prependEntry(entry);
  }

  private dropTail(): CnbsCacheEntry<T> | null {
    if (this.tail === null) return null;

    const tailEntry = this.tail;
    this.deleteEntry(tailEntry);
    return tailEntry;
  }

  fetch(key: string): T | null {
    const entry = this.entryMap.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expireAt) {
      this.deleteEntry(entry);
      this.entryMap.delete(key);
      this.saveToDisk();
      return null;
    }

    entry.hitCount++;
    entry.lastHit = Date.now();
    this.promoteEntry(entry);

    return entry.value;
  }

  store(key: string, value: T, ttl: number = this.defaultExpire): void {
    const existingEntry = this.entryMap.get(key);
    
    if (existingEntry) {
      existingEntry.value = value;
      existingEntry.expireAt = Date.now() + ttl;
      existingEntry.hitCount = 1;
      existingEntry.lastHit = Date.now();
      this.promoteEntry(existingEntry);
      this.saveToDisk();
      return;
    }

    if (this.entryMap.size >= this.capacity) {
      const tailEntry = this.dropTail();
      if (tailEntry) {
        this.entryMap.delete(tailEntry.key);
      }
    }

    const newEntry: CnbsCacheEntry<T> = {
      key,
      value,
      expireAt: Date.now() + ttl,
      hitCount: 1,
      lastHit: Date.now(),
      prev: null,
      next: null,
    };

    this.entryMap.set(key, newEntry);
    this.prependEntry(newEntry);
    this.saveToDisk();
  }

  remove(key: string): void {
    const entry = this.entryMap.get(key);
    if (entry) {
      this.deleteEntry(entry);
      this.entryMap.delete(key);
      this.saveToDisk();
    }
  }

  flush(): void {
    this.entryMap.clear();
    this.head = null;
    this.tail = null;
    this.saveToDisk();
  }

  count(): number {
    return this.entryMap.size;
  }

  getStats(): {
    size: number;
    capacity: number;
    oldestEntry: { key: string; age: number } | null;
    topHit: { key: string; count: number } | null;
  } {
    if (this.entryMap.size === 0) {
      return {
        size: 0,
        capacity: this.capacity,
        oldestEntry: null,
        topHit: null,
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

    return {
      size: this.entryMap.size,
      capacity: this.capacity,
      oldestEntry,
      topHit,
    };
  }

  private saveToDisk(): void {
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
      }> = [];

      let current = this.head;
      while (current !== null) {
        dataToSave.push({
          key: current.key,
          value: current.value,
          expireAt: current.expireAt,
          hitCount: current.hitCount,
          lastHit: current.lastHit,
        });
        current = current.next;
      }

      fs.writeFileSync(this.persistPath, JSON.stringify(dataToSave));
    } catch (error) {
      console.error('Failed to save cache to disk:', error);
    }
  }

  private loadFromDisk(): void {
    if (!this.persistPath || !fs.existsSync(this.persistPath)) return;

    try {
      const data = fs.readFileSync(this.persistPath, 'utf8');
      const cachedItems = JSON.parse(data) as Array<{
        key: string;
        value: T;
        expireAt: number;
        hitCount: number;
        lastHit: number;
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
          };

          this.entryMap.set(item.key, newEntry);
          this.prependEntry(newEntry);
        }
      }
    } catch (error) {
      console.error('Failed to load cache from disk:', error);
    }
  }
}

export class CnbsCacheHub {
  private caches: Map<string, CnbsLruCache<any>> = new Map();

  getCache<T>(name: string, options?: {
    persistPath?: string;
    capacity?: number;
    defaultExpire?: number;
  }): CnbsLruCache<T> {
    if (!this.caches.has(name)) {
      this.caches.set(name, new CnbsLruCache<T>(options));
    }
    return this.caches.get(name) as CnbsLruCache<T>;
  }

  flushAll(): void {
    this.caches.forEach(cache => cache.flush());
  }

  getAllStats(): Record<string, ReturnType<CnbsLruCache<any>['getStats']>> {
    const stats: Record<string, ReturnType<CnbsLruCache<any>['getStats']>> = {};
    this.caches.forEach((cache, name) => {
      stats[name] = cache.getStats();
    });
    return stats;
  }
}

export const cnbsCacheHub = new CnbsCacheHub();
