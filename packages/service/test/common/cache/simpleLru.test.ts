import { describe, expect, it, vi } from 'vitest';
import { SimpleLRUCache } from '../../../common/cache/simpleLru';

describe('SimpleLRUCache', () => {
  it('stores and retrieves values within TTL', () => {
    const cache = new SimpleLRUCache<string, number>(10, 1000);
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBeUndefined();
    expect(cache.size()).toBe(2);
  });

  it('evicts the least recently used entry when reaching capacity', () => {
    const cache = new SimpleLRUCache<string, number>(2, 10000);
    cache.set('a', 1);
    cache.set('b', 2);

    // Access 'a' so 'b' becomes least recently used
    expect(cache.get('a')).toBe(1);

    // Inserting 'c' should evict 'b'
    cache.set('c', 3);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
    expect(cache.size()).toBe(2);
  });

  it('expires entries lazily when TTL is exceeded', () => {
    vi.useFakeTimers();
    try {
      const cache = new SimpleLRUCache<string, string>(10, 100);
      cache.set('key', 'value');

      expect(cache.get('key')).toBe('value');

      // Fast forward past TTL
      vi.advanceTimersByTime(150);

      expect(cache.get('key')).toBeUndefined();
      expect(cache.size()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('supports delete, clear and custom TTL per entry', () => {
    vi.useFakeTimers();
    try {
      const cache = new SimpleLRUCache<string, string>(10, 1000);
      cache.set('short', 'lived', 50);
      cache.set('long', 'lived', 500);

      vi.advanceTimersByTime(60);
      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe('lived');

      cache.delete('long');
      expect(cache.get('long')).toBeUndefined();

      cache.set('x', '1');
      cache.set('y', '2');
      expect(cache.size()).toBe(2);
      cache.clear();
      expect(cache.size()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
