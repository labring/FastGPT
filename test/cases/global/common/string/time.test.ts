import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  formatTime2YMDHMW,
  formatTime2YMDHMS,
  formatTime2YMDHM,
  formatTime2YMD,
  formatTime2HM,
  formatToISOWithTimezone,
  formatTimeToChatTime,
  formatTimeToChatItemTime,
  cronParser2Fields,
  getNextTimeByCronStringAndTimezone
} from '@fastgpt/global/common/string/time';

describe('formatTime2YMDHMW', () => {
  it('should format Date to YYYY-MM-DD HH:mm:ss dddd', () => {
    const date = new Date('2024-03-15T10:30:45');
    const result = formatTime2YMDHMW(date);
    expect(result).toMatch(/2024-03-15 10:30:45/);
  });

  it('should format number timestamp to YYYY-MM-DD HH:mm:ss dddd', () => {
    const timestamp = new Date('2024-03-15T10:30:45').getTime();
    const result = formatTime2YMDHMW(timestamp);
    expect(result).toMatch(/2024-03-15 10:30:45/);
  });

  it('should use current time when no parameter provided', () => {
    const result = formatTime2YMDHMW();
    expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });
});

describe('formatTime2YMDHMS', () => {
  it('should format Date to YYYY-MM-DD HH:mm:ss', () => {
    const date = new Date('2024-03-15T10:30:45');
    expect(formatTime2YMDHMS(date)).toBe('2024-03-15 10:30:45');
  });

  it('should format number timestamp to YYYY-MM-DD HH:mm:ss', () => {
    const timestamp = new Date('2024-03-15T10:30:45').getTime();
    expect(formatTime2YMDHMS(timestamp)).toBe('2024-03-15 10:30:45');
  });

  it('should return empty string when no parameter provided', () => {
    expect(formatTime2YMDHMS()).toBe('');
  });
});

describe('formatTime2YMDHM', () => {
  it('should format Date to YYYY-MM-DD HH:mm', () => {
    const date = new Date('2024-03-15T10:30:45');
    expect(formatTime2YMDHM(date)).toBe('2024-03-15 10:30');
  });

  it('should format number timestamp to YYYY-MM-DD HH:mm', () => {
    const timestamp = new Date('2024-03-15T10:30:45').getTime();
    expect(formatTime2YMDHM(timestamp)).toBe('2024-03-15 10:30');
  });

  it('should return empty string when no parameter provided', () => {
    expect(formatTime2YMDHM()).toBe('');
  });
});

describe('formatTime2YMD', () => {
  it('should format Date to YYYY-MM-DD', () => {
    const date = new Date('2024-03-15T10:30:45');
    expect(formatTime2YMD(date)).toBe('2024-03-15');
  });

  it('should format number timestamp to YYYY-MM-DD', () => {
    const timestamp = new Date('2024-03-15T10:30:45').getTime();
    expect(formatTime2YMD(timestamp)).toBe('2024-03-15');
  });

  it('should return empty string when no parameter provided', () => {
    expect(formatTime2YMD()).toBe('');
  });
});

describe('formatTime2HM', () => {
  it('should format Date to HH:mm', () => {
    const date = new Date('2024-03-15T10:30:45');
    expect(formatTime2HM(date)).toBe('10:30');
  });

  it('should use current time when no parameter provided', () => {
    const result = formatTime2HM();
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('formatToISOWithTimezone', () => {
  it('should format Date to ISO-8601 with timezone offset', () => {
    const date = new Date('2024-03-15T10:30:45.123Z');
    const result = formatToISOWithTimezone(date);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
  });

  it('should format number timestamp to ISO-8601 with timezone offset', () => {
    const timestamp = new Date('2024-03-15T10:30:45.123Z').getTime();
    const result = formatToISOWithTimezone(timestamp);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
  });

  it('should return empty string when no parameter provided', () => {
    expect(formatToISOWithTimezone()).toBe('');
  });
});

describe('formatTimeToChatTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return i18n key for just now (less than 60 seconds)', () => {
    const now = new Date('2024-03-15T10:30:00');
    vi.setSystemTime(now);
    const time = new Date('2024-03-15T10:29:30');
    expect(formatTimeToChatTime(time)).toBe('common:just_now');
  });

  it('should return HH#mm format for today (more than 60 seconds)', () => {
    const now = new Date('2024-03-15T10:30:00');
    vi.setSystemTime(now);
    const time = new Date('2024-03-15T08:15:00');
    expect(formatTimeToChatTime(time)).toBe('08#15');
  });

  it('should return i18n key for yesterday', () => {
    const now = new Date('2024-03-15T10:30:00');
    vi.setSystemTime(now);
    const time = new Date('2024-03-14T08:15:00');
    expect(formatTimeToChatTime(time)).toBe('common:yesterday');
  });

  it('should return MM-DD format for same year', () => {
    const now = new Date('2024-03-15T10:30:00');
    vi.setSystemTime(now);
    const time = new Date('2024-01-10T08:15:00');
    expect(formatTimeToChatTime(time)).toBe('01-10');
  });

  it('should return YYYY-M-D format for previous years', () => {
    const now = new Date('2024-03-15T10:30:00');
    vi.setSystemTime(now);
    const time = new Date('2023-12-25T08:15:00');
    expect(formatTimeToChatTime(time)).toBe('2023-12-25');
  });
});

describe('formatTimeToChatItemTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return HH#mm format for today', () => {
    const now = new Date('2024-03-15T10:30:00');
    vi.setSystemTime(now);
    const time = new Date('2024-03-15T08:15:00');
    expect(formatTimeToChatItemTime(time)).toBe('08#15');
  });

  it('should return i18n key for yesterday', () => {
    const now = new Date('2024-03-15T10:30:00');
    vi.setSystemTime(now);
    const time = new Date('2024-03-14T08:15:00');
    expect(formatTimeToChatItemTime(time)).toBe('common:yesterday_detail_time');
  });

  it('should return MM-DD HH#mm format for same year', () => {
    const now = new Date('2024-03-15T10:30:00');
    vi.setSystemTime(now);
    const time = new Date('2024-01-10T08:15:00');
    expect(formatTimeToChatItemTime(time)).toBe('01-10 08#15');
  });

  it('should return YYYY-M-D HH#mm format for previous years', () => {
    const now = new Date('2024-03-15T10:30:00');
    vi.setSystemTime(now);
    const time = new Date('2023-12-25T08:15:00');
    expect(formatTimeToChatItemTime(time)).toBe('2023-12-25 08#15');
  });
});

describe('cronParser2Fields', () => {
  it('should parse valid cron expression', () => {
    const result = cronParser2Fields('0 0 * * *');
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('minute');
    expect(result).toHaveProperty('hour');
    expect(result).toHaveProperty('dayOfMonth');
    expect(result).toHaveProperty('month');
    expect(result).toHaveProperty('dayOfWeek');
  });

  it('should return null for invalid cron expression', () => {
    const result = cronParser2Fields('invalid cron');
    expect(result).toBeNull();
  });

  it('should parse complex cron expression', () => {
    const result = cronParser2Fields('30 14 1,15 * 1-5');
    expect(result).not.toBeNull();
    if (result) {
      expect(result.minute).toContain(30);
      expect(result.hour).toContain(14);
    }
  });
});

describe('getNextTimeByCronStringAndTimezone', () => {
  it('should return next execution time for valid cron expression', () => {
    const result = getNextTimeByCronStringAndTimezone({
      cronString: '0 0 * * *',
      timezone: 'Asia/Shanghai'
    });
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });

  it('should return current date for invalid cron expression', () => {
    const before = Date.now();
    const result = getNextTimeByCronStringAndTimezone({
      cronString: 'invalid cron',
      timezone: 'Asia/Shanghai'
    });
    const after = Date.now();
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(after);
  });

  it('should handle different timezones', () => {
    const shanghaiResult = getNextTimeByCronStringAndTimezone({
      cronString: '0 12 * * *',
      timezone: 'Asia/Shanghai'
    });
    const nyResult = getNextTimeByCronStringAndTimezone({
      cronString: '0 12 * * *',
      timezone: 'America/New_York'
    });
    expect(shanghaiResult).toBeInstanceOf(Date);
    expect(nyResult).toBeInstanceOf(Date);
  });
});
