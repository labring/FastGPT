import { describe, expect, it } from 'vitest';
import { calculateDaysBetweenDates, getMonthRemainingDays } from '@fastgpt/global/common/math/date';

describe('calculateDaysBetweenDates', () => {
  it('should return zero for same day', () => {
    const date = new Date('2024-01-01T00:00:00Z');
    expect(calculateDaysBetweenDates(date, date)).toBe(0);
  });

  it('should return absolute day difference', () => {
    const date1 = new Date('2024-01-01T00:00:00Z');
    const date2 = new Date('2024-01-03T00:00:00Z');
    expect(calculateDaysBetweenDates(date1, date2)).toBe(2);
    expect(calculateDaysBetweenDates(date2, date1)).toBe(2);
  });

  it('should floor partial days', () => {
    const date1 = new Date('2024-01-01T00:00:00Z');
    const date2 = new Date('2024-01-01T23:59:59Z');
    expect(calculateDaysBetweenDates(date1, date2)).toBe(0);
  });
});

describe('getMonthRemainingDays', () => {
  it('should calculate remaining days in January', () => {
    const startDate = new Date(2024, 0, 10, 0, 0, 0);
    expect(getMonthRemainingDays(startDate)).toBe(21);
  });

  it('should calculate remaining days in leap February', () => {
    const startDate = new Date(2024, 1, 10, 0, 0, 0);
    expect(getMonthRemainingDays(startDate)).toBe(19);
  });
});
