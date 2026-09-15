import { describe, expect, it } from 'vitest';
import {
  formatNumber,
  formatNumber2Million,
  formatNumber2Thousand,
  formatTokenCount
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

describe('formatTokenCount', () => {
  it('keeps raw values below one thousand', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('uses compact K/M/B units with at most two decimals', () => {
    expect(formatTokenCount(1000)).toBe('1K');
    expect(formatTokenCount(1500)).toBe('1.5K');
    expect(formatTokenCount(1_000_000)).toBe('1M');
    expect(formatTokenCount(1_500_000_000)).toBe('1.5B');
  });

  it('promotes the unit when rounding reaches one thousand', () => {
    // 999999 / 1000 保留两位是 1000，不应渲染成 "1000K"
    expect(formatTokenCount(999_999)).toBe('1M');
    expect(formatTokenCount(-999_999)).toBe('-1M');
  });

  it('falls back to a dash for non-finite input', () => {
    expect(formatTokenCount(Number.NaN)).toBe('-');
    expect(formatTokenCount(Number.POSITIVE_INFINITY)).toBe('-');
  });
});
