import type { I18nNsType } from './i18next';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { clearLocaleResourceFailure, loadLocaleResource } from './resourceLoaders';
import { ClientI18nLoadError } from './ClientI18nLoadError';

const pendingLoads = new Map<string, Promise<Record<string, unknown>>>();
const MAX_RETRY_COUNT = 3;

const loadWithRetry = async (language: localeType, namespace: I18nNsType[number]) => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRY_COUNT; attempt++) {
    try {
      return await loadLocaleResource(language, namespace);
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRY_COUNT) throw error;
      clearLocaleResourceFailure(language, namespace);
    }
  }
  throw lastError;
};

const dynamicImportBackend = {
  type: 'backend' as const,
  init() {},
  read(
    language: localeType,
    namespace: I18nNsType[number],
    callback: (error: Error | null, data?: unknown) => void
  ) {
    const key = `${language}|${namespace}`;
    let pending = pendingLoads.get(key);
    if (!pending) {
      pending = loadWithRetry(language, namespace).then(
        (resource) => resource as Record<string, unknown>
      );
      pendingLoads.set(key, pending);
      pending.then(
        () => pendingLoads.delete(key),
        () => pendingLoads.delete(key)
      );
    }

    pending.then(
      (resource) => callback(null, resource),
      (error) => callback(new ClientI18nLoadError({ language, namespace, cause: error }))
    );
  }
};

export default dynamicImportBackend;
