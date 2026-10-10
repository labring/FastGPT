/**
 * 轻量且无外部依赖的通用内存 LRU 缓存，支持 TTL 与容量淘汰策略。
 *
 * 核心特性：
 * 1. 采用 JavaScript Map 的插入迭代顺序保证 O(1) 复杂度的 LRU 序位更新与最久未访问项淘汰；
 * 2. 支持为实例设置默认 TTL，也可在单个 set 操作中指定覆盖 TTL；
 * 3. 惰性过期：get 时若当前时间超过 expiresAt，则就地移除并返回 undefined。
 */
export class SimpleLRUCache<K, V> {
  private capacity: number;
  private defaultTTL: number;
  private map: Map<K, { value: V; expiresAt: number }>;

  constructor(capacity = 1000, defaultTTL = 30 * 60 * 1000) {
    this.capacity = capacity;
    this.defaultTTL = defaultTTL;
    this.map = new Map();
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // 重新插入至 Map 末尾以更新其在 LRU 中的活跃序位
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttl = this.defaultTTL): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      // 淘汰 Map 迭代顺序中最旧的项（最久未访问项）
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttl });
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}
