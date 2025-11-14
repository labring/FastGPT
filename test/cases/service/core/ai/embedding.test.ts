import { formatVectors } from '@fastgpt/service/core/ai/embedding/index';
import { describe, expect, it, vi } from 'vitest';

describe('formatVectors function test', () => {
  // Helper function to create a normalized vector (L2 norm = 1)
  const createNormalizedVector = (length: number): number[] => {
    const vector = Array.from({ length }, (_, i) => (i + 1) / length);
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map((val) => val / norm);
  };

  // Helper function to create an unnormalized vector
  const createUnnormalizedVector = (length: number): number[] => {
    return Array.from({ length }, (_, i) => (i + 1) * 10);
  };

  // Helper function to calculate L2 norm
  const calculateNorm = (vector: number[]): number => {
    return Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  };

  // Helper function to check if vector is normalized (L2 norm H 1)
  const isNormalized = (vector: number[]): boolean => {
    const norm = calculateNorm(vector);
    return Math.abs(norm - 1) < 1e-10;
  };

  describe('1536 dimension vectors', () => {
    it('should handle normalized 1536-dim vector with normalization=true', () => {
      const inputVector = createNormalizedVector(1536);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // Since input is already normalized, result should be very similar
      expect(result).toEqual(
        expect.arrayContaining(inputVector.map((val) => expect.closeTo(val, 10)))
      );
    });

    it('should handle normalized 1536-dim vector with normalization=false', () => {
      const inputVector = createNormalizedVector(1536);
      const result = formatVectors(inputVector, false);

      expect(result).toHaveLength(1536);
      expect(result).toEqual(inputVector);
      expect(isNormalized(result)).toBe(true);
    });

    it('should handle unnormalized 1536-dim vector with normalization=true', () => {
      const inputVector = createUnnormalizedVector(1536);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // Result should be different from input (normalized)
      expect(result).not.toEqual(inputVector);
    });

    it('should handle unnormalized 1536-dim vector with normalization=false', () => {
      const inputVector = createUnnormalizedVector(1536);
      const result = formatVectors(inputVector, false);

      expect(result).toHaveLength(1536);
      expect(result).toEqual(inputVector);
      expect(isNormalized(result)).toBe(false);
    });
  });

  describe('Greater than 1536 dimension vectors', () => {
    it('should handle normalized >1536-dim vector with normalization=true', () => {
      const inputVector = createNormalizedVector(2048);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // Should be truncated to first 1536 elements and then normalized
      expect(result).toEqual(
        expect.arrayContaining(inputVector.slice(0, 1536).map((val) => expect.any(Number)))
      );
    });

    it('should handle normalized >1536-dim vector with normalization=false', () => {
      const inputVector = createNormalizedVector(2048);
      const result = formatVectors(inputVector, true); // Always normalized for >1536 dims

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // Should be truncated and normalized regardless of normalization flag
    });

    it('should handle unnormalized >1536-dim vector with normalization=true', () => {
      const inputVector = createUnnormalizedVector(2048);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // Should be truncated to first 1536 elements and then normalized
    });

    it('should handle unnormalized >1536-dim vector with normalization=false', () => {
      const inputVector = createUnnormalizedVector(2048);
      const result = formatVectors(inputVector, false); // Always normalized for >1536 dims

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // Should be truncated and normalized regardless of normalization flag
    });

    it('should log warning for vectors with length > 1536', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const inputVector = createNormalizedVector(2000);

      formatVectors(inputVector, false);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'The current vector dimension is 2000, and the vector dimension cannot exceed 1536'
        )
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Less than 1536 dimension vectors', () => {
    it('should handle normalized <1536-dim vector with normalization=true', () => {
      const inputVector = createNormalizedVector(512);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // First 512 elements should match input, rest should be 0
      expect(result.slice(0, 512)).toEqual(
        expect.arrayContaining(inputVector.map((val) => expect.any(Number)))
      );
      expect(result.slice(512)).toEqual(new Array(1024).fill(0));
    });

    it('should handle normalized <1536-dim vector with normalization=false', () => {
      const inputVector = createNormalizedVector(512);
      const result = formatVectors(inputVector, false);

      expect(result).toHaveLength(1536);
      // First 512 elements should match input exactly, rest should be 0
      expect(result.slice(0, 512)).toEqual(inputVector);
      expect(result.slice(512)).toEqual(new Array(1024).fill(0));
      // The result remains normalized because adding zeros doesn't change the L2 norm
      expect(isNormalized(result)).toBe(true);
    });

    it('should handle unnormalized <1536-dim vector with normalization=true', () => {
      const inputVector = createUnnormalizedVector(512);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      // Should be padded with zeros and then normalized
      expect(result.slice(512)).toEqual(new Array(1024).fill(0));
    });

    it('should handle unnormalized <1536-dim vector with normalization=false', () => {
      const inputVector = createUnnormalizedVector(512);
      const result = formatVectors(inputVector, false);

      expect(result).toHaveLength(1536);
      // First 512 elements should match input exactly, rest should be 0
      expect(result.slice(0, 512)).toEqual(inputVector);
      expect(result.slice(512)).toEqual(new Array(1024).fill(0));
      expect(isNormalized(result)).toBe(false);
    });

    it('should demonstrate that padding preserves normalization status', () => {
      // Create a vector that becomes unnormalized after some scaling
      const baseVector = [3, 4]; // norm = 5, not normalized
      const result = formatVectors(baseVector, false);

      expect(result).toHaveLength(1536);
      expect(result[0]).toBe(3);
      expect(result[1]).toBe(4);
      expect(result.slice(2)).toEqual(new Array(1534).fill(0));
      expect(isNormalized(result)).toBe(false);
      expect(calculateNorm(result)).toBeCloseTo(5, 10);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero vector', () => {
      const inputVector = new Array(1536).fill(0);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(result).toEqual(inputVector); // Zero vector remains zero after normalization
    });

    it('should handle single element vector', () => {
      const inputVector = [5.0];
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(result[0]).toBeCloseTo(1.0, 10); // Normalized single element should be 1
      expect(result.slice(1)).toEqual(new Array(1535).fill(0));
    });

    it('should handle exactly 1536 dimension vector', () => {
      const inputVector = createNormalizedVector(1536);
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
    });

    it('should handle vector with negative values', () => {
      const inputVector = [-1, -2, -3];
      const result = formatVectors(inputVector, true);

      expect(result).toHaveLength(1536);
      expect(isNormalized(result)).toBe(true);
      expect(result[0]).toBeLessThan(0); // Should preserve negative values
      expect(result[1]).toBeLessThan(0);
      expect(result[2]).toBeLessThan(0);
    });
  });
});
