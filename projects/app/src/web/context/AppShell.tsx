import type { AppProps } from 'next/app';
import Script from 'next/script';
import Layout from '@/components/Layout';
import QueryClientContext from '@/web/context/QueryClient';
import ChakraUIContext from '@/web/context/ChakraUI';
import { useInitApp } from '@/web/context/useInitApp';
import { useTranslation } from 'next-i18next';
import NextHead from '@/components/common/NextHead';
import { type ReactElement, useEffect } from 'react';
import { type NextPage } from 'next';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import SystemStoreContextProvider from '@fastgpt/web/context/useSystem';
import { useRouter } from 'next/router';
import { errorLogger } from '@/web/common/utils/errorLogger';
import { appClientEnv } from '@/web/common/system/env';
import ClientBootLoading from './ClientBootLoading';

type NextPageWithLayout = NextPage & {
  setLayout?: (page: ReactElement) => JSX.Element;
};
type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
  waitForSystemSize?: boolean;
  renderPage?: () => ReactElement;
};

const routesWithCustomHead = ['/chat', '/chat/share', '/app/detail', '/dataset/detail'];
const openAPIReferenceRoutes = ['/apidoc/devapi', '/apidoc/systemopenapi'];
const routesWithoutLayout = openAPIReferenceRoutes;

const AppShell = ({
  Component,
  pageProps,
  waitForSystemSize = false,
  renderPage
}: AppPropsWithLayout) => {
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
  const page = renderPage ? renderPage() : setLayout(<Component {...pageProps} />);

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
      <QueryClientContext>
        <SystemStoreContextProvider
          waitForReady={waitForSystemSize}
          fallback={<ClientBootLoading />}
        >
          <ChakraUIContext>{shouldUseLayout ? <Layout>{page}</Layout> : page}</ChakraUIContext>
        </SystemStoreContextProvider>
      </QueryClientContext>
    </>
  );
};

export default AppShell;
