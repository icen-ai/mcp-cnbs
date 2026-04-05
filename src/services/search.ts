export class CnbsSearchHelper {
  private static queryHistory: Array<{
    keyword: string;
    timestamp: number;
    resultCount: number;
  }> = [];
  private static keywordTracker = new Set<string>();
  private static queryCountMap = new Map<string, number>();

  private static readonly HISTORY_LIMIT = 50;

  static addQueryHistory(keyword: string, resultCount: number): void {
    if (this.keywordTracker.has(keyword)) {
      this.queryHistory = this.queryHistory.filter(item => item.keyword !== keyword);
    }

    this.queryHistory.unshift({
      keyword,
      timestamp: Date.now(),
      resultCount
    });
    this.keywordTracker.add(keyword);
    this.queryCountMap.set(keyword, (this.queryCountMap.get(keyword) || 0) + 1);

    if (this.queryHistory.length > this.HISTORY_LIMIT) {
      const removedItem = this.queryHistory.pop();
      if (removedItem) {
        this.keywordTracker.delete(removedItem.keyword);
      }
    }
  }

  static clearQueryHistory(): void {
    this.queryHistory = [];
    this.keywordTracker.clear();
    this.queryCountMap.clear();
  }

  static getQueryHistory(limit: number = 10): Array<{
    keyword: string;
    timestamp: number;
    resultCount: number;
  }> {
    return this.queryHistory.slice(0, limit);
  }

  static getPopularQueries(limit: number = 10): Array<{
    keyword: string;
    count: number;
  }> {
    return Array.from(this.queryCountMap.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}
