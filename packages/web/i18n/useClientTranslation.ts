import { useTranslation } from 'next-i18next';
import { createSafeTranslation } from '../hooks/useSafeTranslation';
import type { I18nNamespaces } from './i18next';

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

  return {
    t: createSafeTranslation(originalT),
    ...rest
  };
};
