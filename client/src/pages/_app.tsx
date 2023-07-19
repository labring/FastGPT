import { useEffect, useState } from 'react';
import type { AppProps } from 'next/app';
import Script from 'next/script';
import Head from 'next/head';
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import Layout from '@/components/Layout';
import { theme } from '@/constants/theme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NProgress from 'nprogress'; //nprogress module
import Router from 'next/router';
import 'nprogress/nprogress.css';
import '@/styles/reset.scss';
import { clientInitData, feConfigs } from '@/store/static';
import { NextPageContext } from 'next';
import { useGlobalStore } from '@/store/global';

//Binding events.
Router.events.on('routeChangeStart', () => NProgress.start());
Router.events.on('routeChangeComplete', () => NProgress.done());
Router.events.on('routeChangeError', () => NProgress.done());

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      cacheTime: 0
    }
  }
});

function App({ Component, pageProps, isPc }: AppProps & { isPc?: boolean; response: any }) {
  const [googleVerKey, setGoogleVerKey] = useState<string>();
  const [baiduTongji, setBaiduTongji] = useState<string>();
  const { initIsPc } = useGlobalStore();

  if (isPc !== undefined) {
    initIsPc(isPc);
  }

  useEffect(() => {
    (async () => {
      const { googleVerKey, baiduTongji } = await clientInitData();
      setGoogleVerKey(googleVerKey);
      setBaiduTongji(baiduTongji);
    })();
  }, []);

  return (
    <>
      <Head>
        <title>{feConfigs?.systemTitle || 'FastAI'}</title>
        <meta name="description" content="Embedding + LLM, Build AI knowledge base" />
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1.0,maximum-scale=1.0,minimum-scale=1.0,user-scalable=no, viewport-fit=cover"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Script src="/js/particles.js"></Script>
      <Script src="/js/qrcode.min.js" strategy="lazyOnload"></Script>
      <Script src="/js/pdf.js" strategy="lazyOnload"></Script>
      <Script src="/js/html2pdf.bundle.min.js" strategy="lazyOnload"></Script>
      {baiduTongji && <Script src={baiduTongji} strategy="lazyOnload"></Script>}
      {googleVerKey && (
        <>
          <Script
            src={`https://www.recaptcha.net/recaptcha/api.js?render=${googleVerKey}`}
            strategy="afterInteractive"
          ></Script>
        </>
      )}
      <QueryClientProvider client={queryClient}>
        <ChakraProvider theme={theme}>
          <ColorModeScript initialColorMode={theme.config.initialColorMode} />
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </ChakraProvider>
      </QueryClientProvider>
    </>
  );
}

App.getInitialProps = async ({ ctx }: { ctx: NextPageContext }) => {
  const reg = /mobile/gi;

  const isPc = !reg.test(ctx.req?.headers?.['user-agent'] || '');

  return { isPc };
};

export default App;
