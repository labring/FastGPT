import { describe, it, expect } from 'vitest';
import { getMinPointsByMonth, calculatePrice } from '@fastgpt/global/support/wallet/bill/tools';
import type { PriceOption } from '@fastgpt/global/support/wallet/bill/type';

describe('wallet/bill/tools', () => {
  describe('getMinPointsByMonth', () => {
    it('should return 200 for 12 months', () => {
      const result = getMinPointsByMonth(12);
      expect(result).toBe(200);
    });

    it('should return 100 for 6 months', () => {
      const result = getMinPointsByMonth(6);
      expect(result).toBe(100);
    });

    it('should return 50 for 3 months', () => {
      const result = getMinPointsByMonth(3);
      expect(result).toBe(50);
    });

    it('should return 1 for 1 month', () => {
      const result = getMinPointsByMonth(1);
      expect(result).toBe(1);
    });

    it('should return 1 for unknown month values', () => {
      expect(getMinPointsByMonth(0)).toBe(1);
      expect(getMinPointsByMonth(2)).toBe(1);
      expect(getMinPointsByMonth(4)).toBe(1);
      expect(getMinPointsByMonth(5)).toBe(1);
      expect(getMinPointsByMonth(7)).toBe(1);
      expect(getMinPointsByMonth(8)).toBe(1);
      expect(getMinPointsByMonth(9)).toBe(1);
      expect(getMinPointsByMonth(10)).toBe(1);
      expect(getMinPointsByMonth(11)).toBe(1);
      expect(getMinPointsByMonth(24)).toBe(1);
    });

    it('should handle negative month values', () => {
      const result = getMinPointsByMonth(-1);
      expect(result).toBe(1);
    });
  });

  describe('calculatePrice', () => {
    describe('points type', () => {
      it('should calculate price for points option', () => {
        const option: PriceOption = {
          type: 'points',
          points: 100
        };
        const result = calculatePrice(10, option);
        expect(result).toBe(1000);
      });

      it('should calculate price for zero points', () => {
        const option: PriceOption = {
          type: 'points',
          points: 0
        };
        const result = calculatePrice(10, option);
        expect(result).toBe(0);
      });

      it('should calculate price with decimal unit price', () => {
        const option: PriceOption = {
          type: 'points',
          points: 50
        };
        const result = calculatePrice(0.5, option);
        expect(result).toBe(25);
      });
    });

    describe('dataset type', () => {
      it('should calculate price for dataset option', () => {
        const option: PriceOption = {
          type: 'dataset',
          size: 10,
          month: 3
        };
        const result = calculatePrice(5, option);
        expect(result).toBe(150);
      });

      it('should calculate price for zero size', () => {
        const option: PriceOption = {
          type: 'dataset',
          size: 0,
          month: 3
        };
        const result = calculatePrice(5, option);
        expect(result).toBe(0);
      });

      it('should calculate price for zero month', () => {
        const option: PriceOption = {
          type: 'dataset',
          size: 10,
          month: 0
        };
        const result = calculatePrice(5, option);
        expect(result).toBe(0);
      });

      it('should calculate price with decimal values', () => {
        const option: PriceOption = {
          type: 'dataset',
          size: 2.5,
          month: 2
        };
        const result = calculatePrice(10, option);
        expect(result).toBe(50);
      });

      it('should calculate price for 12 months', () => {
        const option: PriceOption = {
          type: 'dataset',
          size: 100,
          month: 12
        };
        const result = calculatePrice(1, option);
        expect(result).toBe(1200);
      });
    });

    describe('invalid type', () => {
      it('should throw error for invalid type', () => {
        const option = {
          type: 'invalid'
        } as unknown as PriceOption;
        expect(() => calculatePrice(10, option)).toThrow('Invalid price option type');
      });

      it('should throw error for undefined type', () => {
        const option = {} as PriceOption;
        expect(() => calculatePrice(10, option)).toThrow('Invalid price option type');
      });
    });
  });
});
