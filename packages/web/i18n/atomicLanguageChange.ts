import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { I18nNsType } from './i18next';
import { I18N_NAMESPACES } from './constants';
import { loadLocaleResourceWithRetry } from './resourceLoaders';
import {
  getLanguageStorageKind,
  getLangMapping,
  getRequiredI18nLanguages,
  persistLanguagePreference,
  restoreLanguagePreference,
  snapshotLanguagePreference,
  type LanguageStorageKind
} from './utils';

type I18nLike = {
  language?: string;
  options?: { ns?: string | readonly string[] };
  reportNamespaces?: { getUsedNamespaces?: () => string[] };
  hasResourceBundle: (language: string, namespace: string) => boolean;
  getResourceBundle?: (language: string, namespace: string) => Record<string, unknown>;
  addResourceBundle: (
    language: string,
    namespace: string,
    resource: Record<string, unknown>,
    deep?: boolean,
    overwrite?: boolean
  ) => void;
  removeResourceBundle?: (language: string, namespace: string) => void;
  changeLanguage: (language: string) => Promise<unknown>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback: (...args: unknown[]) => void) => void;
};

type StagedResource = {
  language: localeType;
  namespace: I18nNsType[number];
  resource: Record<string, unknown>;
  existed: boolean;
  previousResource?: Record<string, unknown>;
};

type LanguagePreferenceSnapshot = ReturnType<typeof snapshotLanguagePreference> & {
  key: string;
};

export type AtomicLanguageChangeOptions = {
  i18n: I18nLike;
  language: string;
  storageKey: string;
  namespaces?: I18nNsType[number][];
};

let languageChangeQueue = Promise.resolve();

/** 获取当前页面实际使用的 namespace，至少包含 common。 */
export const getActiveI18nNamespaces = (i18n: I18nLike): I18nNsType[number][] => {
  const reportNamespaces = i18n.reportNamespaces?.getUsedNamespaces?.() || [];
  const configuredNamespaces = i18n.options?.ns
    ? Array.isArray(i18n.options.ns)
      ? i18n.options.ns
      : [i18n.options.ns]
    : [];

  return Array.from(new Set(['common', ...configuredNamespaces, ...reportNamespaces])).filter(
    (namespace): namespace is I18nNsType[number] =>
      I18N_NAMESPACES.includes(namespace as I18nNsType[number])
  );
};

const preloadResources = async (
  languages: localeType[],
  namespaces: I18nNsType[number][],
  i18n: I18nLike
) => {
  const resources: StagedResource[] = [];

  for (const language of languages) {
    for (const namespace of namespaces) {
      resources.push({
        language,
        namespace,
        resource: (await loadLocaleResourceWithRetry(language, namespace)) as Record<
          string,
          unknown
        >,
        existed: i18n.hasResourceBundle(language, namespace),
        previousResource: i18n.getResourceBundle?.(language, namespace)
      });
    }
  }

  return resources;
};

const addResources = (i18n: I18nLike, resources: StagedResource[]) => {
  for (const item of resources) {
    i18n.addResourceBundle(item.language, item.namespace, item.resource, true, true);
  }
};

const removeNewResources = (i18n: I18nLike, resources: StagedResource[]) => {
  for (const item of resources) {
    if (item.existed && item.previousResource) {
      i18n.addResourceBundle(item.language, item.namespace, item.previousResource, true, true);
    } else if (!item.existed && i18n.removeResourceBundle) {
      i18n.removeResourceBundle(item.language, item.namespace);
    }
  }
};

const hasRequiredResources = (
  i18n: I18nLike,
  languages: localeType[],
  namespaces: I18nNsType[number][]
) =>
  languages.every((language) =>
    namespaces.every((namespace) => i18n.hasResourceBundle(language, namespace))
  );

const restoreLanguage = async (i18n: I18nLike, language: localeType) => {
  if (getLangMapping(i18n.language || '') === language) return;
  try {
    await i18n.changeLanguage(language);
  } catch {
    // Keep the original language-load error as the user-visible failure.
  }
};

const restorePreference = (snapshot: LanguagePreferenceSnapshot) => {
  try {
    restoreLanguagePreference(snapshot, snapshot.key);
  } catch {
    // Storage rollback is best effort; memory state and i18next still roll back below.
  }
};

const runAtomicLanguageChange = async ({
  i18n,
  language: rawLanguage,
  storageKey,
  namespaces
}: AtomicLanguageChangeOptions) => {
  const language = getLangMapping(rawLanguage);
  const previousLanguage = getLangMapping(i18n.language || language);
  const requiredLanguages = getRequiredI18nLanguages(language);
  const activeNamespaces = namespaces || getActiveI18nNamespaces(i18n);
  const storageKind: LanguageStorageKind = getLanguageStorageKind(storageKey);
  const storageSnapshot: LanguagePreferenceSnapshot = {
    ...snapshotLanguagePreference(storageKey, storageKind),
    key: storageKey,
    kind: storageKind
  };
  const failedLoading: unknown[] = [];
  const onFailedLoading = (failedLanguage: unknown, failedNamespace: unknown, error: unknown) => {
    if (
      typeof failedLanguage === 'string' &&
      typeof failedNamespace === 'string' &&
      requiredLanguages.includes(getLangMapping(failedLanguage)) &&
      activeNamespaces.includes(failedNamespace as I18nNsType[number])
    ) {
      failedLoading.push(error);
    }
  };
  let stagedResources: StagedResource[] = [];

  try {
    // Prepare：先直接加载完整语言链，避免把 changeLanguage 的 resolve 当作成功信号。
    stagedResources = await preloadResources(requiredLanguages, activeNamespaces, i18n);
    addResources(i18n, stagedResources);

    i18n.on('failedLoading', onFailedLoading);
    await i18n.changeLanguage(language);
    i18n.off('failedLoading', onFailedLoading);

    // Commit 前同时检查实际语言、资源完整性和 failedLoading 事件。
    if (
      failedLoading.length > 0 ||
      getLangMapping(i18n.language || '') !== language ||
      !hasRequiredResources(i18n, requiredLanguages, activeNamespaces)
    ) {
      throw new Error(`Language resources are incomplete: ${language}`);
    }

    // Persist：只有 i18next 状态验证成功后，才提交权威语言偏好。
    persistLanguagePreference(language, storageKey, storageKind);
  } catch (error) {
    i18n.off('failedLoading', onFailedLoading);
    await restoreLanguage(i18n, previousLanguage);
    removeNewResources(i18n, stagedResources);
    restorePreference(storageSnapshot);
    throw error;
  }
};

/**
 * 以串行队列执行语言切换：资源、i18next 当前语言和权威存储要么一起成功，要么恢复旧状态。
 */
export const changeLanguageAtomically = (options: AtomicLanguageChangeOptions) => {
  const next = languageChangeQueue.then(() => runAtomicLanguageChange(options));
  languageChangeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
};
