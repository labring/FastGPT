import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';
import { createSafeTranslation } from '../hooks/useSafeTranslation';
import type { I18nNamespaces } from './i18next';
import { getLocaleResourceError, getLocaleResourceStatus } from './resourceLoaders';
import { ClientI18nLoadError } from './ClientI18nLoadError';
import { getLangMapping, getRequiredI18nLanguages } from './utils';

type ClientNamespace = Exclude<keyof I18nNamespaces, 'common'>;
type ClientNamespaceInput = ClientNamespace | readonly ClientNamespace[];

/**
 * 加载客户端页面的业务 namespace，并隐式包含启动阶段已就绪的 common namespace。
 * 业务资源使用非 Suspense 加载，缺失期间允许先显示 key，避免路由切换触发全页 loading。
 */
export const useClientTranslation = (namespace?: ClientNamespaceInput) => {
  const namespaces = namespace
    ? Array.isArray(namespace)
      ? (['common', ...namespace] as const)
      : (['common', namespace] as const)
    : 'common';

  const { t: originalT, ...rest } = useTranslation(namespaces, { useSuspense: false });
  const t = useMemo<typeof originalT>(() => createSafeTranslation(originalT), [originalT]);
  const language = getLangMapping(rest.i18n.language);
  const requiredLanguages = getRequiredI18nLanguages(language);
  const requiredNamespaces = Array.isArray(namespaces) ? namespaces : [namespaces];

  const failedResource = requiredLanguages
    .flatMap((requiredLanguage) =>
      requiredNamespaces.map((namespace) => ({ language: requiredLanguage, namespace }))
    )
    .find(({ language, namespace }) => getLocaleResourceStatus(language, namespace) === 'failed');
  if (failedResource) {
    throw new ClientI18nLoadError({
      language: failedResource.language,
      namespace: failedResource.namespace,
      cause:
        getLocaleResourceError(failedResource.language, failedResource.namespace) ??
        new Error('Language resource failed to load')
    });
  }

  return {
    t,
    ...rest
  };
};
