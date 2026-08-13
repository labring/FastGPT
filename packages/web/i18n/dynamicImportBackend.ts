import type { I18nNsType } from './i18next';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { loadLocaleResource } from './resourceLoaders';

const pendingLoads = new Map<string, Promise<Record<string, unknown>>>();

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
      pending = loadLocaleResource(language, namespace).then(
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
      (error) => callback(error)
    );
  }
};

export default dynamicImportBackend;
