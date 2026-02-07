import { describe, expect, it, vi } from 'vitest';
import { delay, retryFn, batchRun } from '@fastgpt/global/common/system/utils';

describe('system utils', () => {
  describe('delay', () => {
    it('should resolve after specified milliseconds', async () => {
      const start = Date.now();
      await delay(100);
      const elapsed = Date.now() - start;

      // Allow some tolerance for timing
      expect(elapsed).toBeGreaterThanOrEqual(95);
      expect(elapsed).toBeLessThan(200);
    });

    it('should resolve with empty string', async () => {
      const result = await delay(0);
      expect(result).toBe('');
    });

    it('should work with zero delay', async () => {
      const start = Date.now();
      await delay(0);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('retryFn', () => {
    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retryFn(fn, 3);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce('success');

      const result = await retryFn(fn, 3);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should reject after all attempts exhausted', async () => {
      const error = new Error('persistent failure');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(retryFn(fn, 2)).rejects.toThrow('persistent failure');
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should use default attempts of 3', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(retryFn(fn)).rejects.toThrow('fail');
      expect(fn).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    it('should work with custom attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(retryFn(fn, 1)).rejects.toThrow('fail');
      expect(fn).toHaveBeenCalledTimes(2); // initial + 1 retry
    });

    it('should handle zero attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(retryFn(fn, 0)).rejects.toThrow('fail');
      expect(fn).toHaveBeenCalledTimes(1); // only initial attempt
    });

    it('should preserve return value type', async () => {
      const objectResult = { data: 'test', count: 42 };
      const fn = vi.fn().mockResolvedValue(objectResult);

      const result = await retryFn(fn, 3);

      expect(result).toEqual(objectResult);
    });
  });

  describe('batchRun', () => {
    it('should process all items', async () => {
      const arr = [1, 2, 3, 4, 5];
      const fn = vi.fn((x: number) => x * 2);

      const result = await batchRun(arr, fn, 2);

      expect(result).toEqual([2, 4, 6, 8, 10]);
      expect(fn).toHaveBeenCalledTimes(5);
    });

    it('should use default batch size of 10', async () => {
      const arr = Array.from({ length: 15 }, (_, i) => i + 1);
      const fn = vi.fn((x: number) => x);

      const result = await batchRun(arr, fn);

      expect(result).toHaveLength(15);
      expect(fn).toHaveBeenCalledTimes(15);
      // Check all values are present (order may vary due to concurrent execution)
      expect(result.sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    });

    it('should handle empty array', async () => {
      const arr: number[] = [];
      const fn = vi.fn();

      const result = await batchRun(arr, fn, 5);

      expect(result).toEqual([]);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should process items with custom batch size', async () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8];
      const fn = vi.fn((x: number) => Promise.resolve(x * 3));

      const result = await batchRun(arr, fn, 3);

      expect(result).toEqual([3, 6, 9, 12, 15, 18, 21, 24]);
      expect(fn).toHaveBeenCalledTimes(8);
    });

    it('should handle async functions', async () => {
      const arr = ['a', 'b', 'c'];
      const fn = async (x: string) => {
        await delay(10);
        return x.toUpperCase();
      };

      const result = await batchRun(arr, fn, 2);

      expect(result).toEqual(['A', 'B', 'C']);
    });

    it('should work with batch size larger than array', async () => {
      const arr = [1, 2, 3];
      const fn = vi.fn((x: number) => x + 1);

      const result = await batchRun(arr, fn, 10);

      expect(result).toEqual([2, 3, 4]);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should work with batch size of 1', async () => {
      const arr = [10, 20, 30];
      const fn = vi.fn((x: number) => x / 10);

      const result = await batchRun(arr, fn, 1);

      expect(result).toEqual([1, 2, 3]);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should handle complex objects', async () => {
      const arr = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
      ];
      const fn = (item: { id: number; name: string }) => ({
        ...item,
        processed: true
      });

      const result = await batchRun(arr, fn, 2);

      expect(result).toEqual([
        { id: 1, name: 'Alice', processed: true },
        { id: 2, name: 'Bob', processed: true },
        { id: 3, name: 'Charlie', processed: true }
      ]);
    });

    it('should process all items even with varying processing times', async () => {
      const arr = [5, 4, 3, 2, 1];
      const fn = async (x: number) => {
        // Simulate varying processing times
        await delay(x * 2);
        return x * 10;
      };

      const result = await batchRun(arr, fn, 3);

      // All items should be processed, order may vary due to concurrent execution
      expect(result).toHaveLength(5);
      expect(result.sort((a, b) => a - b)).toEqual([10, 20, 30, 40, 50]);
    });
  });
});
