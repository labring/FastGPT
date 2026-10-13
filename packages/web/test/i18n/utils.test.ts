import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import {
  canUseLanguageCookie,
  canUseLanguageLocalStorage,
  getClientLanguagePreference,
  getLanguageStorageKind,
  getLangMapping,
  getPersistedLang,
  getRequiredI18nLanguages,
  getLangFromLocalStorage,
  LANG_KEY,
  persistLanguagePreference,
  readLanguagePreference,
  restoreLanguagePreference,
  snapshotLanguagePreference
} from '@fastgpt/web/i18n/utils';

const originalLocalStorage = globalThis.localStorage;
const originalDocument = globalThis.document;
const originalNavigator = globalThis.navigator;

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
  const writes: string[] = [];
  const cookieDocument = {
    writes,
    get cookie() {
      return [...values].map(([key, value]) => `${key}=${value}`).join('; ');
    },
    set cookie(value: string) {
      writes.push(value);
      const [pair, ...attributes] = value.split(';').map((item) => item.trim());
      const [key, cookieValue] = pair.split('=');
      const maxAge = attributes.find((item) => item.toLowerCase().startsWith('max-age='));
      if (maxAge?.split('=')[1] === '0') values.delete(key);
      else values.set(key, cookieValue);
    }
  } as unknown as Document;
  vi.stubGlobal('document', cookieDocument);
  return cookieDocument;
};

const installBlockedCookieDocument = () => {
  vi.stubGlobal('document', {
    get cookie() {
      return '';
    },
    set cookie(_value: string) {
      // Simulate browser policy silently rejecting cookie writes.
    }
  } as unknown as Document);
};

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorage());
});

afterEach(() => {
  if (originalLocalStorage === undefined) vi.unstubAllGlobals();
  else vi.stubGlobal('localStorage', originalLocalStorage);
  if (originalDocument === undefined) vi.stubGlobal('document', undefined);
  else vi.stubGlobal('document', originalDocument);
  if (originalNavigator === undefined) vi.stubGlobal('navigator', undefined);
  else vi.stubGlobal('navigator', originalNavigator);
});

describe('getRequiredI18nLanguages', () => {
  it('returns only Simplified Chinese when it is the active language', () => {
    expect(getRequiredI18nLanguages(LangEnum.zh_CN)).toEqual([LangEnum.zh_CN]);
  });

  it.each([LangEnum.en, LangEnum.zh_Hant, LangEnum.ko_KR])(
    'appends Simplified Chinese fallback for %s',
    (language) => {
      expect(getRequiredI18nLanguages(language)).toEqual([language, LangEnum.zh_CN]);
    }
  );
});

describe('getLangMapping', () => {
  it('maps script-specific Traditional Chinese locales to zh-Hant', () => {
    expect(getLangMapping('zh-Hant-TW')).toBe(LangEnum.zh_Hant);
    expect(getLangMapping('zh-Hant-HK')).toBe(LangEnum.zh_Hant);
    expect(getLangMapping(' zh_hant_tw ')).toBe(LangEnum.zh_Hant);
  });

  it.each(['ko', 'ko-KR', 'ko-kr', 'KO_KR'])('maps Korean locale variant %s to ko-KR', (locale) => {
    expect(getLangMapping(locale)).toBe(LangEnum.ko_KR);
  });

  it('falls back to English for unsupported locale', () => {
    expect(getLangMapping('fr-FR')).toBe(LangEnum.en);
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
    const cookieDocument = installCookieDocument();
    expect(canUseLanguageCookie()).toBe(true);
    expect(getLanguageStorageKind()).toBe('cookie');

    persistLanguagePreference(LangEnum.en, 'cookie-language', 'cookie');
    expect(readLanguagePreference('cookie-language', 'cookie')).toBe(LangEnum.en);
    expect(cookieDocument.writes.some((value: string) => /path=\//i.test(value))).toBe(true);
    expect(cookieDocument.writes.some((value: string) => /expires=/i.test(value))).toBe(true);
    expect(cookieDocument.writes.some((value: string) => /max-age=/i.test(value))).toBe(false);
  });

  it('uses Cookie as the authority when localStorage is unavailable', () => {
    installCookieDocument();
    vi.stubGlobal('localStorage', undefined);

    expect(getLanguageStorageKind('cookie-only-language')).toBe('cookie');
    persistLanguagePreference(LangEnum.zh_Hant, 'cookie-only-language');
    expect(readLanguagePreference('cookie-only-language', 'cookie')).toBe(LangEnum.zh_Hant);
  });

  it('falls back to localStorage when Cookie writes are blocked', () => {
    installBlockedCookieDocument();

    expect(canUseLanguageCookie()).toBe(false);
    expect(getLanguageStorageKind()).toBe('localStorage');
    persistLanguagePreference(LangEnum.zh_CN, 'blocked-cookie-language');
    expect(readLanguagePreference('blocked-cookie-language', 'localStorage')).toBe(LangEnum.zh_CN);
  });

  it('falls back to memory when localStorage access throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('localStorage blocked');
      },
      setItem: () => {
        throw new Error('localStorage blocked');
      },
      removeItem: () => {
        throw new Error('localStorage blocked');
      }
    });

    expect(canUseLanguageLocalStorage()).toBe(false);
    expect(getLanguageStorageKind()).toBe('memory');
    expect(getLangFromLocalStorage()).toBeUndefined();
    persistLanguagePreference(LangEnum.en, 'throwing-local-storage');
    expect(readLanguagePreference('throwing-local-storage', 'memory')).toBe(LangEnum.en);
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

  it('reads the request language from localStorage before memory and navigator.language', () => {
    persistLanguagePreference(LangEnum.zh_Hant, 'request-language', 'memory');
    const storage = createLocalStorage();
    storage.getItem.mockReturnValue(LangEnum.zh_CN);
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('navigator', { language: 'en-US' });

    expect(getClientLanguagePreference()).toBe(LangEnum.zh_CN);
  });

  it('falls back to memory when localStorage is unavailable', () => {
    persistLanguagePreference(LangEnum.zh_Hant, undefined, 'memory');
    vi.stubGlobal('localStorage', undefined);
    vi.stubGlobal('navigator', { language: 'en-US' });

    expect(getClientLanguagePreference()).toBe(LangEnum.zh_Hant);
  });

  it('falls back to navigator.language when browser storage is unavailable', () => {
    restoreLanguagePreference({ kind: 'memory' });
    vi.stubGlobal('localStorage', undefined);
    vi.stubGlobal('navigator', { language: 'zh-TW' });

    expect(getClientLanguagePreference()).toBe(LangEnum.zh_Hant);
  });

  it('keeps the localStorage mirror when the language Cookie has expired', () => {
    installCookieDocument();
    const storage = createLocalStorage();
    storage.setItem(LANG_KEY, LangEnum.zh_Hant);
    vi.stubGlobal('localStorage', storage);

    expect(getPersistedLang()).toBe(LangEnum.zh_Hant);
  });
});
