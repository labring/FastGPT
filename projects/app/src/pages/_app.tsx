import type { AppProps } from 'next/app';
import Script from 'next/script';

import Layout from '@/components/Layout';
import { appWithTranslation } from 'next-i18next';

import QueryClientContext from '@/web/context/QueryClient';
import ChakraUIContext from '@/web/context/ChakraUI';
import { useInitApp } from '@/web/context/useInitApp';
import { useTranslation } from 'next-i18next';
import '@/web/styles/reset.scss';
import NextHead from '@/components/common/NextHead';
import { type ReactElement, useEffect } from 'react';
import { type NextPage } from 'next';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import SystemStoreContextProvider from '@fastgpt/web/context/useSystem';
import { useRouter } from 'next/router';

type NextPageWithLayout = NextPage & {
  setLayout?: (page: ReactElement) => JSX.Element;
};
type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

// 哪些路由有自定义 Head
const routesWithCustomHead = ['/chat', '/chat/share', '/app/detail/', '/dataset/detail'];

function App({ Component, pageProps }: AppPropsWithLayout) {
  const { feConfigs, scripts, title } = useInitApp();
  const { t } = useTranslation();

  // Forbid touch scale
  useEffect(() => {
    document.addEventListener(
      'wheel',
      function (e) {
        if (e.ctrlKey && Math.abs(e.deltaY) !== 0) {
          e.preventDefault();
        }
      },
      { passive: false }
    );
  }, []);

  const setLayout = Component.setLayout || ((page) => <>{page}</>);

  const router = useRouter();
  const showHead = !router?.pathname || !routesWithCustomHead.includes(router.pathname);

  return (
    <>
      {showHead && (
        <NextHead
          title={title}
          desc={process.env.SYSTEM_DESCRIPTION || t('common:system_intro', { title })}
          icon={getWebReqUrl(feConfigs?.favicon || process.env.SYSTEM_FAVICON)}
        />
      )}

      {scripts?.map((item, i) => <Script key={i} strategy="lazyOnload" {...item}></Script>)}

      <QueryClientContext>
        <SystemStoreContextProvider device={pageProps.deviceSize}>
          <ChakraUIContext>
            <Layout>{setLayout(<Component {...pageProps} />)}</Layout>
          </ChakraUIContext>
        </SystemStoreContextProvider>
      </QueryClientContext>
    </>
  );
}

// @ts-ignore
export default appWithTranslation(App);
