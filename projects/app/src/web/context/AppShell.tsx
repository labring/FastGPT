import type { AppProps } from 'next/app';
import Script from 'next/script';
import Layout from '@/components/Layout';
import QueryClientContext from '@/web/context/QueryClient';
import ChakraUIContext from '@/web/context/ChakraUI';
import { useInitApp } from '@/web/context/useInitApp';
import { useTranslation } from 'next-i18next';
import NextHead from '@/components/common/NextHead';
import { type ReactElement, type ReactNode, useEffect } from 'react';
import { type NextPage } from 'next';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import SystemStoreContextProvider from '@fastgpt/web/context/useSystem';
import { useRouter } from 'next/router';
import { errorLogger } from '@/web/common/utils/errorLogger';
import { appClientEnv } from '@/web/common/system/env';
import ClientI18nBoundary from '@fastgpt/web/i18n/ClientI18nBoundary';
import ClientI18nGate from '@fastgpt/web/i18n/ClientI18nGate';
import { LANG_KEY } from '@fastgpt/web/i18n/utils';

type NextPageWithLayout = NextPage & {
  setLayout?: (page: ReactElement) => JSX.Element;
};
type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
  clientOnly?: boolean;
  renderPage?: () => ReactElement;
};

const routesWithCustomHead = ['/chat', '/chat/share', '/app/detail', '/dataset/detail'];
const openAPIReferenceRoutes = ['/apidoc/devapi', '/apidoc/systemopenapi'];
const routesWithoutLayout = openAPIReferenceRoutes;

/** 渲染依赖 common 翻译资源的 Head、应用初始化、Layout 和页面内容。 */
const AppContent = ({ Component, pageProps, renderPage }: AppPropsWithLayout) => {
  const { feConfigs, scripts, title } = useInitApp();
  const { t } = useTranslation();

  useEffect(() => {
    document.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey && Math.abs(e.deltaY) !== 0) e.preventDefault();
      },
      { passive: false }
    );
    errorLogger.init();
  }, []);

  const setLayout = Component.setLayout || ((page) => <>{page}</>);
  const router = useRouter();
  const showHead = !router?.pathname || !routesWithCustomHead.includes(router.pathname);
  const shouldUseLayout = !router?.pathname || !routesWithoutLayout.includes(router.pathname);
  const headDesc = appClientEnv.systemDescription || t('common:system_intro', { title });
  const headIcon = getWebReqUrl(feConfigs?.favicon || appClientEnv.systemFavicon);
  const page = setLayout(renderPage ? renderPage() : <Component {...pageProps} />);

  if (openAPIReferenceRoutes.includes(router.pathname)) {
    return (
      <>
        {showHead && <NextHead title={title} desc={headDesc} icon={headIcon} />}
        {page}
      </>
    );
  }

  return (
    <>
      {showHead && <NextHead title={title} desc={headDesc} icon={headIcon} />}
      {scripts?.map((item, i) => (
        <Script key={i} strategy="lazyOnload" {...item} />
      ))}
      {shouldUseLayout ? <Layout>{page}</Layout> : page}
    </>
  );
};

/** 完整语言包就绪后再挂载 client-only 应用，避免页面内出现 key 或二次骨架切换。 */
const ClientI18nRoot = ({ children }: { children: ReactNode }) => {
  const { i18n } = useTranslation();

  return (
    <ClientI18nGate defaultLanguage="en" storageKey={LANG_KEY} fallback={null}>
      <ClientI18nBoundary language={i18n.language} fallback={null}>
        {children}
      </ClientI18nBoundary>
    </ClientI18nGate>
  );
};

/** 保持全局 Provider 稳定，仅让可翻译的应用壳进入客户端 i18n 门禁。 */
const AppShell = (props: AppPropsWithLayout) => {
  const content = <AppContent {...props} />;

  return (
    <QueryClientContext>
      <SystemStoreContextProvider waitForReady={props.clientOnly}>
        <ChakraUIContext>
          {props.clientOnly ? <ClientI18nRoot>{content}</ClientI18nRoot> : content}
        </ChakraUIContext>
      </SystemStoreContextProvider>
    </QueryClientContext>
  );
};

export default AppShell;
