import { describe, expect, it } from 'vitest';
import {
  formatNumber,
  formatNumber2Million,
  formatNumber2Thousand
} from '@fastgpt/global/common/math/tools';

describe('formatNumber', () => {
  it('should round with default digit', () => {
    expect(formatNumber(1.23456)).toBeCloseTo(1.2346, 4);
    expect(formatNumber(1.23454)).toBeCloseTo(1.2345, 4);
  });

  it('should round with custom digit', () => {
    expect(formatNumber(1.23456, 100)).toBeCloseTo(1.23, 2);
  });

  it('should handle negative numbers', () => {
    expect(formatNumber(-1.23456)).toBeCloseTo(-1.2346, 4);
  });
});

describe('formatNumber2Million', () => {
  it('should round to nearest million', () => {
    expect(formatNumber2Million(2_499_999)).toBe(2);
    expect(formatNumber2Million(2_500_000)).toBe(3);
  });
});

describe('formatNumber2Thousand', () => {
  it('should round to nearest thousand', () => {
    expect(formatNumber2Thousand(1_499)).toBe(1);
    expect(formatNumber2Thousand(1_500)).toBe(2);
  });
});
