import { describe, it, expect } from 'vitest';
import { parseI18nString, formatI18nLocationToZhEn } from '@fastgpt/global/common/i18n/utils';
import type { I18nStringType } from '@fastgpt/global/common/i18n/type';

describe('parseI18nString', () => {
  it('should return string input as-is', () => {
    expect(parseI18nString('hello', 'en')).toBe('hello');
    expect(parseI18nString('')).toBe('');
    expect(parseI18nString()).toBe('');
  });

  it('should return matched locale value', () => {
    const i18n: I18nStringType = {
      en: 'Hello',
      'zh-CN': '你好',
      'zh-Hant': '您好'
    };

    expect(parseI18nString(i18n, 'zh-CN')).toBe('你好');
    expect(parseI18nString(i18n, 'zh-Hant')).toBe('您好');
  });

  it('should fall back to zh-CN for zh-Hant when missing', () => {
    const i18n: I18nStringType = {
      en: 'Hello',
      'zh-CN': '你好'
    };

    expect(parseI18nString(i18n, 'zh-Hant')).toBe('你好');
  });

  it('should fall back to en when locale missing', () => {
    const i18n: I18nStringType = {
      en: 'Hello',
      'zh-CN': '你好'
    };

    expect(parseI18nString(i18n, 'fr')).toBe('Hello');
  });

  it('should return empty string when locale exists but empty', () => {
    const i18n: I18nStringType = {
      en: 'Hello',
      'zh-CN': ''
    };

    expect(parseI18nString(i18n, 'zh-CN')).toBe('');
  });
});

describe('formatI18nLocationToZhEn', () => {
  it('should return zh for zh locales', () => {
    expect(formatI18nLocationToZhEn('zh-CN')).toBe('zh');
    expect(formatI18nLocationToZhEn('zh-Hant')).toBe('zh');
  });

  it('should be case insensitive for zh check', () => {
    expect(formatI18nLocationToZhEn('zh-CN'.toUpperCase() as 'zh-CN')).toBe('zh');
  });

  it('should return en for non-zh locales', () => {
    expect(formatI18nLocationToZhEn('en')).toBe('en');
  });
});
