import type { AppProps } from 'next/app';
import Script from 'next/script';

import Layout from '@/components/Layout';
import { appWithTranslation } from 'next-i18next';

import QueryClientContext from '@/web/context/QueryClient';
import ChakraUIContext from '@/web/context/ChakraUI';
import I18nContextProvider from '@/web/context/I18n';
import { useInitApp } from '@/web/context/useInitApp';
import { useTranslation } from 'next-i18next';
import '@/web/styles/reset.scss';
import NextHead from '@/components/common/NextHead';

function App({ Component, pageProps }: AppProps) {
  const { feConfigs, scripts, title } = useInitApp();
  const { t } = useTranslation();

  return (
    <>
      <NextHead
        title={title}
        desc={
          feConfigs?.systemDescription ||
          process.env.SYSTEM_DESCRIPTION ||
          `${title}${t('app:intro')}`
        }
        icon={feConfigs?.favicon || process.env.SYSTEM_FAVICON}
      />
      {scripts?.map((item, i) => <Script key={i} strategy="lazyOnload" {...item}></Script>)}

      <QueryClientContext>
        <I18nContextProvider>
          <ChakraUIContext>
            <Layout>
              <Component {...pageProps} />
            </Layout>
          </ChakraUIContext>
        </I18nContextProvider>
      </QueryClientContext>
    </>
  );
}

export default appWithTranslation(App);
