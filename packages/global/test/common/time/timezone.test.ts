import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSystemTime,
  getTimeZoneList,
  getTimezoneCodeFromStr,
  getTimezoneOffset,
  timeZoneList
} from '@fastgpt/global/common/time/timezone';

describe('getTimezoneOffset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-03T04:05:06Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return 0 for UTC', () => {
    expect(getTimezoneOffset('UTC')).toBe(0);
  });
});

describe('getTimeZoneList', () => {
  it('should include UTC and valid entries', () => {
    const list = getTimeZoneList();

    expect(list.length).toBeGreaterThan(1);
    expect(list[0]).toEqual({ name: 'UTC', time: 0, value: 'UTC' });

    const rest = list.slice(1);
    rest.forEach((item) => {
      expect(typeof item.name).toBe('string');
      expect(typeof item.value).toBe('string');
      expect(typeof item.time).toBe('number');
    });

    for (let i = 1; i < rest.length; i += 1) {
      expect(rest[i].time).toBeGreaterThanOrEqual(rest[i - 1].time);
    }
  });
});

describe('timeZoneList', () => {
  it('should include UTC at the beginning', () => {
    expect(timeZoneList[0]).toEqual({ name: 'UTC', time: 0, value: 'UTC' });
  });
});

describe('getTimezoneCodeFromStr', () => {
  it('should parse timezone offset from strings', () => {
    expect(getTimezoneCodeFromStr('2024-01-01 12:00:00+08:00')).toBe('+08:00');
    expect(getTimezoneCodeFromStr('2024-01-01 12:00:00-05:30')).toBe('-05:30');
  });

  it('should return default for missing or invalid timezone', () => {
    expect(getTimezoneCodeFromStr('2024-01-01 12:00:00')).toBe('+00:00');
    expect(getTimezoneCodeFromStr('UTC')).toBe('+00:00');
    expect(getTimezoneCodeFromStr(new Date())).toBe('+00:00');
  });
});

describe('getSystemTime', () => {
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-03T04:05:06Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
  });

  it('should format the current time in the requested time zone', () => {
    expect(getSystemTime('UTC')).toBe('2024-02-03 04:05:06 Saturday');
    expect(getSystemTime('Asia/Shanghai')).toBe('2024-02-03 12:05:06 Saturday');
    expect(getSystemTime('America/New_York')).toBe('2024-02-02 23:05:06 Friday');
  });

  it('should not depend on the process time zone', () => {
    process.env.TZ = 'Asia/Shanghai';

    expect(getSystemTime('Asia/Shanghai')).toBe('2024-02-03 12:05:06 Saturday');
    expect(getSystemTime('UTC')).toBe('2024-02-03 04:05:06 Saturday');
    expect(getSystemTime('Asia/Kolkata')).toBe('2024-02-03 09:35:06 Saturday');
  });
});
