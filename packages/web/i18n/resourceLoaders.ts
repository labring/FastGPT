import type { I18nNsType } from './i18next';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { generatedLoaders } from './resourceLoaders.generated';
import { I18N_NAMESPACES } from './constants';

export type ResourceStatus = 'pending' | 'loaded' | 'failed';
type LocaleResource = Record<string, string | Record<string, unknown>>;
type LanguageBundle = Record<I18nNsType[number], LocaleResource>;

const resourceStatus = new Map<string, ResourceStatus>();
const resourceErrors = new Map<string, unknown>();
const pendingLanguageBundles = new Map<localeType, Promise<LanguageBundle>>();
const RESOURCE_RETRY_DELAYS = [300, 1000, 3000] as const;
const LANGUAGE_BUNDLE_NAMESPACES = I18N_NAMESPACES as I18nNsType;

const getResourceKey = (language: localeType, namespace: I18nNsType[number]) =>
  language + '|' + namespace;

const shouldSimulateLoadError = (namespace: I18nNsType[number]) => {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return false;

  return new URLSearchParams(window.location.search).get('debugI18nError') === namespace;
};

export const getLocaleResourceStatus = (language: localeType, namespace: I18nNsType[number]) =>
  resourceStatus.get(getResourceKey(language, namespace));

export const getLocaleResourceError = (language: localeType, namespace: I18nNsType[number]) =>
  resourceErrors.get(getResourceKey(language, namespace));

export const clearLocaleResourceFailure = (language: localeType, namespace: I18nNsType[number]) => {
  const key = getResourceKey(language, namespace);
  resourceStatus.delete(key);
  resourceErrors.delete(key);
};

export const clearLanguageBundleFailure = (language: localeType) => {
  LANGUAGE_BUNDLE_NAMESPACES.forEach((namespace) =>
    clearLocaleResourceFailure(language, namespace)
  );
};

const waitForRetry = (delay: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delay);
  });

/** 动态加载单个语言 namespace，并记录资源状态供客户端门禁和错误态读取。 */
export const loadLocaleResource = async (language: localeType, namespace: I18nNsType[number]) => {
  const loader = generatedLoaders[language]?.[namespace];
  if (!loader) throw new Error('Missing i18n resource loader: ' + language + '/' + namespace);

  const key = getResourceKey(language, namespace);
  resourceStatus.set(key, 'pending');
  try {
    if (shouldSimulateLoadError(namespace)) {
      throw new Error(`Simulated i18n resource load failure: ${language}/${namespace}`);
    }

    const resource = (await loader()).default;
    resourceStatus.set(key, 'loaded');
    resourceErrors.delete(key);
    return resource;
  } catch (error) {
    resourceStatus.set(key, 'failed');
    resourceErrors.set(key, error);
    throw error;
  }
};

/** 加载一个语言的完整 namespace 集合，并将状态同步到既有的 language + namespace 记录。 */
export const loadLanguageBundle = async (language: localeType) => {
  const existingPending = pendingLanguageBundles.get(language);
  if (existingPending) return existingPending;

  const loaders = generatedLoaders[language];
  if (!loaders) throw new Error(`Missing i18n language bundle loader: ${language}`);

  LANGUAGE_BUNDLE_NAMESPACES.forEach((namespace) => {
    resourceStatus.set(getResourceKey(language, namespace), 'pending');
  });

  const loading = Promise.resolve()
    .then(() => {
      const simulatedNamespace = LANGUAGE_BUNDLE_NAMESPACES.find(shouldSimulateLoadError);
      if (simulatedNamespace) {
        throw new Error(`Simulated i18n resource load failure: ${language}/${simulatedNamespace}`);
      }
      return Promise.all(
        LANGUAGE_BUNDLE_NAMESPACES.map(async (namespace) => {
          const resource = (await loaders[namespace]()).default;
          return [namespace, resource] as const;
        })
      ).then((resources) => Object.fromEntries(resources) as LanguageBundle);
    })
    .then((bundle) => {
      LANGUAGE_BUNDLE_NAMESPACES.forEach((namespace) => {
        const key = getResourceKey(language, namespace);
        resourceStatus.set(key, 'loaded');
        resourceErrors.delete(key);
      });
      return bundle;
    })
    .catch((error) => {
      LANGUAGE_BUNDLE_NAMESPACES.forEach((namespace) => {
        const key = getResourceKey(language, namespace);
        resourceStatus.set(key, 'failed');
        resourceErrors.set(key, error);
      });
      throw error;
    })
    .finally(() => {
      pendingLanguageBundles.delete(language);
    });

  pendingLanguageBundles.set(language, loading);
  return loading;
};

/**
 * 以退避间隔重试动态语言资源，覆盖首次 common 初始化和后续业务 namespace 加载。
 * 每次重试前清理失败状态，最终一次失败仍保留错误上下文供统一错误态展示。
 */
export const loadLocaleResourceWithRetry = async (
  language: localeType,
  namespace: I18nNsType[number]
) => {
  for (const delay of RESOURCE_RETRY_DELAYS) {
    try {
      return await loadLocaleResource(language, namespace);
    } catch {
      clearLocaleResourceFailure(language, namespace);
      await waitForRetry(delay);
    }
  }

  return loadLocaleResource(language, namespace);
};

/** 以与单 namespace 相同的退避策略重试完整语言 chunk。 */
export const loadLanguageBundleWithRetry = async (language: localeType) => {
  for (const delay of RESOURCE_RETRY_DELAYS) {
    try {
      return await loadLanguageBundle(language);
    } catch {
      clearLanguageBundleFailure(language);
      await waitForRetry(delay);
    }
  }

  return loadLanguageBundle(language);
};
