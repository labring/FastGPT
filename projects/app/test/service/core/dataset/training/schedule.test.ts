import { describe, expect, it } from 'vitest';
import {
  getMinuteInTimeZone,
  isMinuteInDatasetTrainingWindow,
  parseDatasetTrainingWindow
} from '@/service/core/dataset/training/schedule';

describe('dataset training schedule', () => {
  it('parses a validated daily window', () => {
    expect(parseDatasetTrainingWindow('08:30-17:45')).toEqual({
      startMinute: 8 * 60 + 30,
      endMinute: 17 * 60 + 45
    });
  });

  it('uses a left-closed, right-open daytime window', () => {
    const window = parseDatasetTrainingWindow('08:30-17:45');

    expect(isMinuteInDatasetTrainingWindow(8 * 60 + 29, window)).toBe(false);
    expect(isMinuteInDatasetTrainingWindow(8 * 60 + 30, window)).toBe(true);
    expect(isMinuteInDatasetTrainingWindow(17 * 60 + 44, window)).toBe(true);
    expect(isMinuteInDatasetTrainingWindow(17 * 60 + 45, window)).toBe(false);
  });

  it('supports a window that crosses midnight', () => {
    const window = parseDatasetTrainingWindow('22:00-06:00');

    expect(isMinuteInDatasetTrainingWindow(21 * 60 + 59, window)).toBe(false);
    expect(isMinuteInDatasetTrainingWindow(22 * 60, window)).toBe(true);
    expect(isMinuteInDatasetTrainingWindow(0, window)).toBe(true);
    expect(isMinuteInDatasetTrainingWindow(5 * 60 + 59, window)).toBe(true);
    expect(isMinuteInDatasetTrainingWindow(6 * 60, window)).toBe(false);
  });

  it('evaluates the same instant in the configured time zone', () => {
    const date = new Date('2026-01-15T16:30:00.000Z');

    expect(getMinuteInTimeZone(date, 'UTC')).toBe(16 * 60 + 30);
    expect(getMinuteInTimeZone(date, 'Asia/Shanghai')).toBe(30);
  });
});
