import { describe, it, expect } from 'vitest';
import { computeFilterIntersection } from '@fastgpt/service/core/dataset/search/utils';

describe('computeFilterIntersection', () => {
  describe('edge cases', () => {
    it('should return undefined for empty array', () => {
      const result = computeFilterIntersection([]);
      expect(result).toBeUndefined();
    });

    it('should return undefined for all undefined arrays', () => {
      const result = computeFilterIntersection([undefined, undefined, undefined]);
      expect(result).toBeUndefined();
    });

    it('should return single array as-is', () => {
      const result = computeFilterIntersection([['a', 'b', 'c']]);
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should filter out undefined arrays', () => {
      const result = computeFilterIntersection([undefined, ['a', 'b'], undefined]);
      expect(result).toEqual(['a', 'b']);
    });

    it('should return empty array when intersection is empty', () => {
      const result = computeFilterIntersection([
        ['a', 'b'],
        ['c', 'd']
      ]);
      expect(result).toEqual([]);
    });
  });

  describe('two arrays', () => {
    it('should compute intersection of two arrays', () => {
      const result = computeFilterIntersection([
        ['a', 'b', 'c'],
        ['b', 'c', 'd']
      ]);
      expect(result).toEqual(['b', 'c']);
    });

    it('should handle duplicate elements', () => {
      const result = computeFilterIntersection([
        ['a', 'a', 'b', 'b'],
        ['a', 'b', 'c']
      ]);
      expect(result).toEqual(['a', 'a', 'b', 'b']);
    });

    it('should preserve order from first array', () => {
      const result = computeFilterIntersection([
        ['c', 'b', 'a'],
        ['a', 'b', 'c']
      ]);
      expect(result).toEqual(['c', 'b', 'a']);
    });
  });

  describe('three arrays (tags, createTime, collectionIds)', () => {
    it('should compute intersection of three arrays', () => {
      const tagIds = ['id1', 'id2', 'id3'];
      const timeIds = ['id2', 'id3', 'id4'];
      const collectionIds = ['id3', 'id4', 'id5'];

      const result = computeFilterIntersection([tagIds, timeIds, collectionIds]);
      expect(result).toEqual(['id3']);
    });

    it('should return empty when no common elements', () => {
      const tagIds = ['id1', 'id2'];
      const timeIds = ['id3', 'id4'];
      const collectionIds = ['id5', 'id6'];

      const result = computeFilterIntersection([tagIds, timeIds, collectionIds]);
      expect(result).toEqual([]);
    });

    it('should handle partial undefined', () => {
      const tagIds = ['id1', 'id2', 'id3'];
      const collectionIds = ['id2', 'id3', 'id4'];

      const result = computeFilterIntersection([tagIds, undefined, collectionIds]);
      expect(result).toEqual(['id2', 'id3']);
    });

    it('should handle all same elements', () => {
      const ids = ['id1', 'id2', 'id3'];
      const result = computeFilterIntersection([ids, ids, ids]);
      expect(result).toEqual(['id1', 'id2', 'id3']);
    });
  });

  describe('performance with Set optimization', () => {
    it('should handle large arrays efficiently', () => {
      const size = 10000;
      const arr1 = Array.from({ length: size }, (_, i) => `id${i}`);
      const arr2 = Array.from({ length: size }, (_, i) => `id${i + size / 2}`);

      const start = performance.now();
      const result = computeFilterIntersection([arr1, arr2]);
      const duration = performance.now() - start;

      expect(result?.length).toBe(size / 2);
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });
  });
});
