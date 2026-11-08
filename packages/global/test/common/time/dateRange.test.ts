import { describe, expect, it } from 'vitest';
import { getLocalDateRange } from '@fastgpt/global/common/time/dateRange';
import { formatToISOWithTimezone } from '@fastgpt/global/common/string/time';

describe('getLocalDateRange', () => {
  it.each([
    [2026, 10, 2, 2026, 10, 9],
    [2025, 11, 31, 2026, 0, 1],
    [2026, 10, 2, 2026, 10, 2]
  ])('preserves selected dates and inputs: %j', (year, month, day, endYear, endMonth, endDay) => {
    const from = new Date(year, month, day, 12, 30);
    const to = new Date(endYear, endMonth, endDay, 16, 45);
    const originals = [from.getTime(), to.getTime()];
    const range = getLocalDateRange(from, to);
    expect(range).toEqual({
      from: new Date(year, month, day),
      to: new Date(endYear, endMonth, endDay, 23, 59, 59, 999)
    });
    expect([from.getTime(), to.getTime()]).toEqual(originals);
    expect(new Date(formatToISOWithTimezone(range.from)).getTime()).toBe(range.from.getTime());
    expect(new Date(formatToISOWithTimezone(range.to)).getTime()).toBe(range.to.getTime());
  });
});
