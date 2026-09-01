import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadLanguageBundleWithRetry } = vi.hoisted(() => ({
  loadLanguageBundleWithRetry: vi.fn()
}));

vi.mock('@fastgpt/web/i18n/resourceLoaders', () => ({ loadLanguageBundleWithRetry }));

import { changeLanguageAtomically } from '@fastgpt/web/i18n/atomicLanguageChange';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { I18N_NAMESPACES } from '@fastgpt/web/i18n/constants';

const createLanguageBundle = (language: string) =>
  Object.fromEntries(I18N_NAMESPACES.map((namespace) => [namespace, { language, namespace }]));

const createI18n = (language = LangEnum.en) => {
  let currentLanguage = language;
  const resources = new Map<string, Record<string, unknown>>();
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  const emit = (event: string, ...args: unknown[]) => {
    listeners.get(event)?.forEach((listener) => listener(...args));
  };

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
    },
    emit
  };
};

beforeEach(() => {
  vi.clearAllMocks();
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
  vi.stubGlobal('document', undefined);
});

describe('changeLanguageAtomically', () => {
  it('preloads the language chain before switching and persists only after validation', async () => {
    loadLanguageBundleWithRetry.mockImplementation(async (language: string) =>
      createLanguageBundle(language)
    );
    const i18n = createI18n();

    await changeLanguageAtomically({
      i18n,
      language: LangEnum.zh_CN,
      storageKey: 'atomic-language'
    });

    expect(loadLanguageBundleWithRetry).toHaveBeenCalledWith('zh-CN');
    expect(loadLanguageBundleWithRetry).toHaveBeenCalledTimes(1);
    expect(i18n.language).toBe(LangEnum.zh_CN);
    expect(i18n.changeLanguage).toHaveBeenCalledOnce();
    expect(localStorage.getItem('atomic-language')).toBe(LangEnum.zh_CN);
  });

  it('does not switch or persist when a required resource fails', async () => {
    const error = new Error('chunk unavailable');
    loadLanguageBundleWithRetry.mockRejectedValue(error);
    const i18n = createI18n();

    await expect(
      changeLanguageAtomically({
        i18n,
        language: LangEnum.zh_CN,
        storageKey: 'failed-language'
      })
    ).rejects.toBe(error);

    expect(i18n.language).toBe(LangEnum.en);
    expect(i18n.changeLanguage).not.toHaveBeenCalled();
    expect(localStorage.getItem('failed-language')).toBeNull();
  });

  it('复用 i18next 中已经完整注册的语言包', async () => {
    const i18n = createI18n();
    for (const namespace of I18N_NAMESPACES) {
      i18n.addResourceBundle(LangEnum.zh_CN, namespace, {
        language: LangEnum.zh_CN,
        namespace
      });
    }

    await changeLanguageAtomically({
      i18n,
      language: LangEnum.zh_CN,
      storageKey: 'cached-language'
    });

    expect(loadLanguageBundleWithRetry).not.toHaveBeenCalled();
    expect(i18n.language).toBe(LangEnum.zh_CN);
  });

  it('rolls back when changeLanguage resolves but reports failedLoading', async () => {
    loadLanguageBundleWithRetry.mockImplementation(async (language: string) =>
      createLanguageBundle(language)
    );
    const i18n = createI18n();
    i18n.changeLanguage.mockImplementationOnce(async (lng: string) => {
      i18n.emit('failedLoading', lng, 'common', new Error('backend failure'));
    });

    await expect(
      changeLanguageAtomically({
        i18n,
        language: LangEnum.zh_CN,
        storageKey: 'event-failed-language'
      })
    ).rejects.toThrow('Language resources are incomplete');

    expect(i18n.language).toBe(LangEnum.en);
    expect(localStorage.getItem('event-failed-language')).toBeNull();
  });

  it('rolls back when changeLanguage resolves without applying the target language', async () => {
    loadLanguageBundleWithRetry.mockImplementation(async (language: string) =>
      createLanguageBundle(language)
    );
    const i18n = createI18n();
    i18n.changeLanguage.mockImplementationOnce(async () => undefined);

    await expect(
      changeLanguageAtomically({
        i18n,
        language: LangEnum.zh_CN,
        storageKey: 'wrong-language'
      })
    ).rejects.toThrow('Language resources are incomplete');

    expect(i18n.language).toBe(LangEnum.en);
    expect(localStorage.getItem('wrong-language')).toBeNull();
  });

  it('rolls back when the selected storage cannot verify a write', async () => {
    loadLanguageBundleWithRetry.mockImplementation(async (language: string) =>
      createLanguageBundle(language)
    );
    const i18n = createI18n();
    const storage = globalThis.localStorage;
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = (key: string, value: string) => {
      if (key !== 'write-failure-language') originalSetItem(key, value);
    };

    await expect(
      changeLanguageAtomically({
        i18n,
        language: LangEnum.zh_CN,
        storageKey: 'write-failure-language'
      })
    ).rejects.toThrow('Failed to persist language preference');

    expect(i18n.language).toBe(LangEnum.en);
    expect(storage.getItem('write-failure-language')).toBeNull();
  });

  it('serializes concurrent changes and commits the final request', async () => {
    loadLanguageBundleWithRetry.mockImplementation(async (language: string) =>
      createLanguageBundle(language)
    );
    const i18n = createI18n();

    await Promise.all([
      changeLanguageAtomically({ i18n, language: LangEnum.zh_CN, storageKey: 'queued-language' }),
      changeLanguageAtomically({ i18n, language: LangEnum.zh_Hant, storageKey: 'queued-language' })
    ]);

    expect(i18n.language).toBe(LangEnum.zh_Hant);
    expect(localStorage.getItem('queued-language')).toBe(LangEnum.zh_Hant);
  });
});
