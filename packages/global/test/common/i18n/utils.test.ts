import { describe, it, expect } from 'vitest';
import {
  i18nT,
  parseI18nString,
  formatI18nLocationToZhEn,
  parseLocale
} from '@fastgpt/global/common/i18n/utils';
import type { I18nStringType } from '@fastgpt/global/common/i18n/type';

describe('i18nT', () => {
  it('should return the original i18n key', () => {
    expect(i18nT('chat:completion_finish_stop')).toBe('chat:completion_finish_stop');
  });
});

describe('parseLocale', () => {
  it.each(['ko', 'ko-KR', 'ko-kr', 'KO_KR', 'ko-KP'])(
    'should normalize Korean locale %s to ko-KR',
    (locale) => {
      expect(parseLocale(locale)).toBe('ko-KR');
    }
  );

  it('should normalize English and Chinese locale variants', () => {
    expect(parseLocale('en-US')).toBe('en');
    expect(parseLocale('zh_hant_tw')).toBe('zh-Hant');
    expect(parseLocale('zh-Hans')).toBe('zh-CN');
  });

  it('should return undefined for empty or unsupported locales', () => {
    expect(parseLocale()).toBeUndefined();
    expect(parseLocale('')).toBeUndefined();
    expect(parseLocale('fr-FR')).toBeUndefined();
  });
});

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
