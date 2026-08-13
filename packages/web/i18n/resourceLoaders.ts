import type { I18nNsType } from './i18next';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { generatedLoaders } from './resourceLoaders.generated';

export type ResourceStatus = 'pending' | 'loaded' | 'failed';

const resourceStatus = new Map<string, ResourceStatus>();
const resourceErrors = new Map<string, unknown>();

const getResourceKey = (language: localeType, namespace: I18nNsType[number]) =>
  language + '|' + namespace;

export const getLocaleResourceStatus = (language: localeType, namespace: I18nNsType[number]) =>
  resourceStatus.get(getResourceKey(language, namespace));

export const getLocaleResourceError = (language: localeType, namespace: I18nNsType[number]) =>
  resourceErrors.get(getResourceKey(language, namespace));

export const clearLocaleResourceFailure = (language: localeType, namespace: I18nNsType[number]) => {
  const key = getResourceKey(language, namespace);
  resourceStatus.delete(key);
  resourceErrors.delete(key);
};

/** 动态加载单个语言 namespace，并记录资源状态供客户端门禁和错误态读取。 */
export const loadLocaleResource = async (language: localeType, namespace: I18nNsType[number]) => {
  const loader = generatedLoaders[language]?.[namespace];
  if (!loader) throw new Error('Missing i18n resource loader: ' + language + '/' + namespace);

  const key = getResourceKey(language, namespace);
  resourceStatus.set(key, 'pending');
  try {
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
