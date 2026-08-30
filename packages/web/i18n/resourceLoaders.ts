import type { I18nNsType } from './i18next';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { generatedLoaders } from './resourceLoaders.generated';

export type ResourceStatus = 'pending' | 'loaded' | 'failed';

const resourceStatus = new Map<string, ResourceStatus>();
const resourceErrors = new Map<string, unknown>();
const RESOURCE_RETRY_DELAYS = [300, 1000, 3000] as const;

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
