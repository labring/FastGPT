import { useTranslation } from 'next-i18next';
import { createSafeTranslation } from '../hooks/useSafeTranslation';
import type { I18nNamespaces } from './i18next';
import { getLocaleResourceError, getLocaleResourceStatus } from './resourceLoaders';
import { ClientI18nLoadError } from './ClientI18nLoadError';
import { getLangMapping } from './utils';

type ClientNamespace = Exclude<keyof I18nNamespaces, 'common'>;
type ClientNamespaceInput = ClientNamespace | readonly ClientNamespace[];

/**
 * 加载客户端页面的业务 namespace，并隐式包含启动阶段已就绪的 common namespace。
 * 支持单个 namespace 或 namespace 数组，组件只需声明自己直接使用的业务资源。
 */
export const useClientTranslation = (namespace?: ClientNamespaceInput) => {
  const namespaces = namespace
    ? Array.isArray(namespace)
      ? (['common', ...namespace] as const)
      : (['common', namespace] as const)
    : 'common';

  const { t: originalT, ...rest } = useTranslation(namespaces, { useSuspense: true });
  const language = getLangMapping(rest.i18n.language);

  const failedNamespace = (Array.isArray(namespaces) ? namespaces : [namespaces]).find(
    (item) => getLocaleResourceStatus(language, item) === 'failed'
  );
  if (failedNamespace) {
    throw new ClientI18nLoadError({
      language,
      namespace: failedNamespace,
      cause:
        getLocaleResourceError(language, failedNamespace) ??
        new Error('Language resource failed to load')
    });
  }

  return {
    t: createSafeTranslation(originalT),
    ...rest
  };
};
