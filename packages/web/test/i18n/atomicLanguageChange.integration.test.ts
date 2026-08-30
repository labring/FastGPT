import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { changeLanguageAtomically } from '@fastgpt/web/i18n/atomicLanguageChange';
import { loadLocaleResource } from '@fastgpt/web/i18n/resourceLoaders';
import { I18N_NAMESPACES } from '@fastgpt/web/i18n/constants';

const createI18n = () => {
  let currentLanguage = LangEnum.en;
  const resources = new Map<string, Record<string, unknown>>();
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  return {
    get language() {
      return currentLanguage;
    },
    options: { ns: ['common'] },
    reportNamespaces: { getUsedNamespaces: () => ['common'] },
    hasResourceBundle: (lng: string, ns: string) => resources.has(`${lng}|${ns}`),
    getResourceBundle: (lng: string, ns: string) => resources.get(`${lng}|${ns}`) || {},
    addResourceBundle: (lng: string, ns: string, resource: Record<string, unknown>) =>
      resources.set(`${lng}|${ns}`, resource),
    removeResourceBundle: (lng: string, ns: string) => resources.delete(`${lng}|${ns}`),
    changeLanguage: vi.fn(async (lng: string) => {
      currentLanguage = lng;
    }),
    on: (event: string, listener: (...args: unknown[]) => void) => {
      const set = listeners.get(event) || new Set();
      set.add(listener);
      listeners.set(event, set);
    },
    off: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(listener);
    }
  };
};

const installCookieDocument = () => {
  const values = new Map<string, string>();
  vi.stubGlobal('document', {
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
  } as unknown as Document);
};

beforeEach(() => {
  vi.stubGlobal('document', undefined);
  vi.stubGlobal('localStorage', {
    values: new Map<string, string>(),
    getItem(key: string) {
      return this.values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      this.values.set(key, value);
    },
    removeItem(key: string) {
      this.values.delete(key);
    }
  });
});

describe('atomic language change integration', () => {
  it('loads generated language resources, changes i18next and persists the preference', async () => {
    const i18n = createI18n();

    await changeLanguageAtomically({
      i18n,
      language: LangEnum.zh_CN,
      storageKey: 'integration-language'
    });

    expect(i18n.language).toBe(LangEnum.zh_CN);
    expect(i18n.hasResourceBundle(LangEnum.zh_CN, 'common')).toBe(true);
    expect(i18n.hasResourceBundle(LangEnum.en, 'common')).toBe(false);
    expect(
      I18N_NAMESPACES.every((namespace) => i18n.hasResourceBundle(LangEnum.zh_CN, namespace))
    ).toBe(true);
    expect(localStorage.getItem('integration-language')).toBe(LangEnum.zh_CN);
    expect(i18n.changeLanguage).toHaveBeenCalledWith(LangEnum.zh_CN);
    expect(await loadLocaleResource(LangEnum.zh_CN, 'common')).toHaveProperty('Confirm');
  });

  it('commits atomically to Cookie when localStorage is unavailable', async () => {
    installCookieDocument();
    vi.stubGlobal('localStorage', undefined);
    const i18n = createI18n();

    await changeLanguageAtomically({
      i18n,
      language: LangEnum.zh_Hant,
      storageKey: 'cookie-only-integration-language'
    });

    expect(i18n.language).toBe(LangEnum.zh_Hant);
    expect(i18n.hasResourceBundle(LangEnum.zh_Hant, 'common')).toBe(true);
    expect(i18n.hasResourceBundle(LangEnum.zh_CN, 'common')).toBe(true);
    expect(i18n.hasResourceBundle(LangEnum.en, 'common')).toBe(false);
  });
});
