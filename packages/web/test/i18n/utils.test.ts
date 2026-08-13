import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import {
  canUseLanguageCookie,
  canUseLanguageLocalStorage,
  getLanguageStorageKind,
  getRequiredI18nLanguages,
  getLangFromLocalStorage,
  persistLanguagePreference,
  readLanguagePreference,
  restoreLanguagePreference,
  snapshotLanguagePreference
} from '@fastgpt/web/i18n/utils';

const originalLocalStorage = globalThis.localStorage;
const originalDocument = globalThis.document;

const createLocalStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key))
  };
};

const installCookieDocument = () => {
  const values = new Map<string, string>();
  const cookieDocument = {
    get cookie() {
      return [...values].map(([key, value]) => `${key}=${value}`).join('; ');
    },
    set cookie(value: string) {
      const [pair, ...attributes] = value.split(';').map((item) => item.trim());
      const [key, cookieValue] = pair.split('=');
      const maxAge = attributes.find((item) => item.toLowerCase().startsWith('max-age='));
      if (maxAge?.split('=')[1] === '0') values.delete(key);
      else values.set(key, cookieValue);
    }
  } as unknown as Document;
  vi.stubGlobal('document', cookieDocument);
};

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorage());
});

afterEach(() => {
  if (originalLocalStorage === undefined) vi.unstubAllGlobals();
  else vi.stubGlobal('localStorage', originalLocalStorage);
  if (originalDocument === undefined) vi.stubGlobal('document', undefined);
  else vi.stubGlobal('document', originalDocument);
});

describe('getRequiredI18nLanguages', () => {
  it('returns only English when English is the active language', () => {
    expect(getRequiredI18nLanguages(LangEnum.en)).toEqual([LangEnum.en]);
  });

  it.each([LangEnum.zh_CN, LangEnum.zh_Hant])('appends English fallback for %s', (language) => {
    expect(getRequiredI18nLanguages(language)).toEqual([language, LangEnum.en]);
  });
});

describe('language storage capability and persistence', () => {
  it('uses localStorage when cookies are unavailable', () => {
    expect(canUseLanguageCookie()).toBe(false);
    expect(canUseLanguageLocalStorage()).toBe(true);
    expect(getLanguageStorageKind()).toBe('localStorage');

    persistLanguagePreference(LangEnum.zh_CN, 'test-language');
    expect(readLanguagePreference('test-language', 'localStorage')).toBe(LangEnum.zh_CN);
    expect(getLangFromLocalStorage('test-language')).toBe(LangEnum.zh_CN);
  });

  it('uses a real cookie when it can be written and read back', () => {
    installCookieDocument();
    expect(canUseLanguageCookie()).toBe(true);
    expect(getLanguageStorageKind()).toBe('cookie');

    persistLanguagePreference(LangEnum.en, 'cookie-language', 'cookie');
    expect(readLanguagePreference('cookie-language', 'cookie')).toBe(LangEnum.en);
  });

  it('falls back to memory when both browser stores are unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(getLanguageStorageKind()).toBe('memory');

    persistLanguagePreference(LangEnum.zh_Hant, 'memory-language', 'memory');
    expect(readLanguagePreference('memory-language', 'memory')).toBe(LangEnum.zh_Hant);
  });

  it('captures and restores a localStorage preference snapshot', () => {
    persistLanguagePreference(LangEnum.en, 'rollback-language', 'localStorage');
    const snapshot = snapshotLanguagePreference('rollback-language');
    persistLanguagePreference(LangEnum.zh_CN, 'rollback-language', 'localStorage');

    restoreLanguagePreference(snapshot, 'rollback-language');
    expect(readLanguagePreference('rollback-language', 'localStorage')).toBe(LangEnum.en);
  });
});
