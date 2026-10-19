import { describe, it, expect } from 'vitest';
import {
  formatI18nLocationToZhEn,
  i18nT,
  parseI18nString,
  parseLocale,
  selectPluginText,
  selectReadmeUrl
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

  it('should accept legacy translation objects without zh-CN', () => {
    expect(parseI18nString({ en: 'Hello' }, 'ko-KR')).toBe('Hello');
  });

  it('falls back to an empty string when all translations are omitted', () => {
    expect(parseI18nString({ 'zh-CN': '你好' }, 'en')).toBe('');
  });

  it('should return empty string when locale exists but empty', () => {
    const i18n: I18nStringType = {
      en: 'Hello',
      'zh-CN': ''
    };

    expect(parseI18nString(i18n, 'zh-CN')).toBe('');
  });
});

describe('selectPluginText', () => {
  it('keeps legacy strings and selects available translations with plugin fallbacks', () => {
    expect(selectPluginText('Legacy label', 'zh-CN')).toBe('Legacy label');
    expect(selectPluginText({ en: 'Search' }, 'zh-Hant')).toBe('Search');
    expect(selectPluginText({ en: 'Search', 'zh-CN': '检索' }, 'zh-Hant')).toBe('检索');
    expect(selectPluginText({ en: 'Search', 'zh-CN': '检索' }, 'fr')).toBe('Search');
    expect(selectPluginText({ en: 'Search', 'zh-CN': '' }, 'zh-CN')).toBe('');
    expect(selectPluginText(undefined, 'en')).toBe('');
  });
});

describe('selectReadmeUrl', () => {
  it('selects the current language before Chinese, English, and the legacy URL', () => {
    expect(
      selectReadmeUrl(
        {
          readmeUrls: { en: 'https://example.com/en', 'zh-CN': 'https://example.com/zh' },
          readmeUrl: 'https://example.com/legacy'
        },
        'zh-Hant'
      )
    ).toBe('https://example.com/zh');
    expect(
      selectReadmeUrl(
        { readmeUrls: { en: 'https://example.com/en' }, readmeUrl: 'https://example.com/legacy' },
        'ko-KR'
      )
    ).toBe('https://example.com/en');
    expect(selectReadmeUrl({ readmeUrl: 'https://example.com/legacy' }, 'en')).toBe(
      'https://example.com/legacy'
    );
    expect(selectReadmeUrl({}, 'en')).toBeUndefined();
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
