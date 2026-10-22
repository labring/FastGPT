// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FILTER_STORAGE_KEY,
  readFilterSelection,
  writeFilterSelection
} from '../../../../components/common/TagFilter/storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('readFilterSelection', () => {
  it('returns only owned keys and tolerates missing, invalid and unavailable storage', () => {
    expect(readFilterSelection('missing')).toBeUndefined();
    expect(readFilterSelection('toString')).toBeUndefined();
    for (const value of ['null', '[]', '1', 'broken']) {
      localStorage.setItem(FILTER_STORAGE_KEY, value);
      expect(readFilterSelection('range')).toBeUndefined();
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });
    expect(readFilterSelection('range')).toBeUndefined();
  });
});

describe('writeFilterSelection', () => {
  it('merges independent selections in one object and preserves primitive types', () => {
    writeFilterSelection('range', 90);
    writeFilterSelection('granularity', 'month');
    writeFilterSelection('enabled', false);
    writeFilterSelection('empty', '');
    expect(JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY)!)).toEqual({
      range: 90,
      granularity: 'month',
      enabled: false,
      empty: ''
    });
    expect(readFilterSelection('range')).toBe(90);
    expect(readFilterSelection('enabled')).toBe(false);
    writeFilterSelection('range', undefined);
    expect(readFilterSelection('range')).toBeUndefined();
    expect(readFilterSelection('granularity')).toBe('month');
  });

  it('recovers malformed data and ignores write failures', () => {
    localStorage.setItem(FILTER_STORAGE_KEY, '{');
    writeFilterSelection('range', 30);
    expect(readFilterSelection('range')).toBe(30);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    expect(() => writeFilterSelection('range', 90)).not.toThrow();
    expect(readFilterSelection('range')).toBe(30);
  });
});
