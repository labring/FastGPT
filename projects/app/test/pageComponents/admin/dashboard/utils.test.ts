import { describe, expect, it } from 'vitest';
import {
  formatList2ChartsData,
  getDashboardFilters,
  getStartTime
} from '@/pageComponents/admin/dashboard/utils';

describe('getDashboardFilters', () => {
  it('defaults invalid ranges and forces seven days to daily buckets', () => {
    expect(getDashboardFilters({})).toEqual({ dateRange: 7, granularity: 'day' });
    expect(getDashboardFilters({ dateRange: '7', granularity: 'quarter' })).toEqual({
      dateRange: 7,
      granularity: 'day'
    });
    expect(getDashboardFilters({ dateRange: ['30'], granularity: ['month'] })).toEqual({
      dateRange: 7,
      granularity: 'day'
    });
    for (const range of ['30', '90', '360']) {
      for (const granularity of ['day', 'month', 'quarter']) {
        expect(getDashboardFilters({ dateRange: range, granularity })).toEqual({
          dateRange: Number(range),
          granularity
        });
      }
    }
  });
});

describe('getStartTime', () => {
  it('includes today and expands longer ranges to the first day of the month', () => {
    expect(getStartTime(7, '2026-09-09T12:00:00').slice(0, 10)).toBe('2026-09-03');
    expect(getStartTime(30, '2026-09-09T12:00:00').slice(0, 10)).toBe('2026-08-01');
    expect(getStartTime(90, '2026-09-09T12:00:00').slice(0, 10)).toBe('2026-06-01');
    expect(getStartTime(360, '2026-09-09T12:00:00').slice(0, 10)).toBe('2025-09-01');
    expect(getStartTime(7, '2024-03-01T12:00:00').slice(0, 10)).toBe('2024-02-24');
  });
});

describe('formatList2ChartsData', () => {
  it('fills missing days and keeps different years distinct', () => {
    const data = formatList2ChartsData(
      [
        { date: '2025-09-01T00:00:00Z', count: 2 },
        { date: '2026-09-01T00:00:00Z', count: 5 }
      ],
      { defaultValues: { count: 0 }, startTime: '2025-09-01', now: '2026-09-01' }
    );
    expect(data).toHaveLength(366);
    expect(data[0].count).toBe(2);
    expect(data[1].count).toBe(0);
    expect(data[365].count).toBe(5);
  });
  it('fills monthly and quarterly buckets, including a partial first quarter', () => {
    const monthly = formatList2ChartsData([{ date: '2026-09-01', count: 9 }], {
      defaultValues: { count: 0 },
      startTime: '2026-08-01',
      now: '2026-09-09',
      granularity: 'month'
    });
    expect(monthly.map((x) => [x.x, x.count])).toEqual([
      ['2026/08', 0],
      ['2026/09', 9]
    ]);
    const quarterly = formatList2ChartsData([{ date: '2026-01-01', count: 9 }], {
      defaultValues: { count: 0 },
      startTime: '2025-11-01',
      now: '2026-04-01',
      granularity: 'quarter'
    });
    expect(quarterly.map((x) => [x.x, x.count])).toEqual([
      ['2025 Q4', 0],
      ['2026 Q1', 9],
      ['2026 Q2', 0]
    ]);
  });
  it('does not emit buckets for a future range', () => {
    expect(
      formatList2ChartsData([], {
        defaultValues: { count: 0 },
        startTime: '2026-10-01',
        now: '2026-09-09'
      })
    ).toEqual([]);
  });
});
