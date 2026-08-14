import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { appWithTranslation } from 'next-i18next';
import { clientI18nConfig } from '@fastgpt/web/i18n/clientConfig';
import { getClientLanguagePreference, LANG_KEY } from '@fastgpt/web/i18n/utils';
import AppShell from '@/web/context/AppShell';
import '@/web/styles/reset.scss';
import '@scalar/api-reference-react/style.css';

const clientOnlyRoutes = new Set([
  '/account/apikey',
  '/account/inform',
  '/account/setting',
  '/account/thirdParty',
  '/account/customDomain',
  '/account/bill',
  '/account/team',
  '/account/info',
  '/account/usage',
  '/account/model',
  '/price'
]);
const ClientOnlyPage = dynamic(() => import('@/web/context/ClientOnlyPage'), {
  ssr: false
});
const AppRouter = (props: AppProps) => {
  const isClientOnlyRoute = clientOnlyRoutes.has(props.router.pathname);

  return (
    <AppShell
      {...props}
      clientOnly={isClientOnlyRoute}
      renderPage={isClientOnlyRoute ? () => <ClientOnlyPage {...props} /> : undefined}
    />
  );
};

const TranslatedAppRouter = appWithTranslation(AppRouter, clientI18nConfig);

/**
 * client-only 页面没有 SSR 翻译 props，需要在 i18n Provider 初始化前注入客户端语言。
 * 这样路由切换不会先按 Next Router 的默认英文渲染，再由客户端门禁切回用户语言。
 */
const App = (props: AppProps) => {
  const isClientOnlyRoute = clientOnlyRoutes.has(props.router.pathname);
  if (!isClientOnlyRoute || typeof window === 'undefined') {
    return <TranslatedAppRouter {...props} />;
  }

  const initialLocale = getClientLanguagePreference(LANG_KEY);
  const pageProps = {
    ...props.pageProps,
    _nextI18Next: {
      ...props.pageProps?._nextI18Next,
      initialLocale
    }
  };

  return <TranslatedAppRouter {...props} pageProps={pageProps} />;
};

export default App;
