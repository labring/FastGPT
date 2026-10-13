import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { appWithTranslation } from 'next-i18next';
import { clientI18nConfig } from '@fastgpt/web/i18n/clientConfig';
import { getLangFromCookie, LANG_KEY } from '@fastgpt/web/i18n/utils';
import AppShell from '@/web/context/AppShell';
import { isClientOnlyRoute } from '@/web/context/clientOnlyRouteConfig';
import '@/web/styles/reset.scss';
import '@scalar/api-reference-react/style.css';

const ClientOnlyPage = dynamic(() => import('@/web/context/ClientOnlyPage'), {
  ssr: false
});
const AppRouter = (props: AppProps) => {
  const clientOnly = isClientOnlyRoute(props.router.pathname);

  return (
    <AppShell
      {...props}
      clientOnly={clientOnly}
      renderPage={clientOnly ? () => <ClientOnlyPage {...props} /> : undefined}
    />
  );
};

const TranslatedAppRouter = appWithTranslation(AppRouter, clientI18nConfig);

/**
 * client-only 页面没有 SSR 翻译 props；有语言 Cookie 时在 Provider 初始化前注入。
 * 没有 Cookie 时允许先使用默认语言，挂载后再由客户端 effect 恢复本地或浏览器语言。
 */
const App = (props: AppProps) => {
  const clientOnly = isClientOnlyRoute(props.router.pathname);
  if (!clientOnly || typeof window === 'undefined') {
    return <TranslatedAppRouter {...props} />;
  }

  const initialLocale = getLangFromCookie(LANG_KEY);
  if (!initialLocale) {
    return <TranslatedAppRouter {...props} />;
  }
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
