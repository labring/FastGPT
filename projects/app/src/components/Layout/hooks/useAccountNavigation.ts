import { useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { changeLanguageAtomically } from '@fastgpt/web/i18n/atomicLanguageChange';
import { getLangMapping, LANG_KEY } from '@fastgpt/web/i18n/utils';
import type { I18nNsType } from '@fastgpt/web/i18n/i18next';

const accountInfoRoute = '/account/info';
const accountInfoNamespaces: I18nNsType[number][] = [
  'common',
  'price',
  'account',
  'account_info',
  'user'
];

/**
 * 进入账号首页前预加载页面代码和首屏翻译资源。
 * 加载期间保留当前页面；失败时仍执行导航，由现有路由或 i18n 错误边界展示错误。
 */
export const useAccountNavigation = () => {
  const router = useRouter();
  const { i18n } = useTranslation();
  const pendingNavigation = useRef<Promise<boolean> | undefined>(undefined);

  return useCallback(() => {
    if (router.pathname === accountInfoRoute) return Promise.resolve(false);
    if (pendingNavigation.current) return pendingNavigation.current;

    const navigation = (async () => {
      try {
        await Promise.all([
          router.prefetch(accountInfoRoute),
          import('@/web/context/ClientOnlyPage'),
          changeLanguageAtomically({
            i18n,
            language: getLangMapping(i18n.language),
            storageKey: LANG_KEY,
            namespaces: accountInfoNamespaces
          })
        ]);
      } catch {
        // 导航后的现有错误边界负责展示页面代码或语言资源加载错误。
      }

      return router.push(accountInfoRoute).catch(() => false);
    })();

    pendingNavigation.current = navigation;
    navigation.finally(() => {
      pendingNavigation.current = undefined;
    });
    return navigation;
  }, [i18n, router]);
};
