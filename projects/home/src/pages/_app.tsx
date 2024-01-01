import { useEffect, useState } from 'react';
import type { AppProps } from 'next/app';
import Script from 'next/script';
import Head from 'next/head';
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import { theme } from '@/web/styles/theme';
import NProgress from 'nprogress'; //nprogress module
import Router from 'next/router';
import { clientInitData, feConfigs } from '@/web/common/system/staticData';
import { appWithTranslation, useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { change2DefaultLng, setLngStore } from '@/web/common/utils/i18n';

import 'nprogress/nprogress.css';
import '@/web/styles/reset.scss';
import { FeConfigType } from '@/types';

//Binding events.
Router.events.on('routeChangeStart', () => NProgress.start());
Router.events.on('routeChangeComplete', () => NProgress.done());
Router.events.on('routeChangeError', () => NProgress.done());

function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const { i18n } = useTranslation();
  const [scripts, setScripts] = useState<FeConfigType['scripts']>([]);

  useEffect(() => {
    // get init data
    (async () => {
      const { scripts } = await clientInitData();

      setScripts(scripts || []);
    })();
  }, []);

  useEffect(() => {
    // get default language
    const targetLng = change2DefaultLng(i18n.language);
    if (targetLng) {
      setLngStore(targetLng);
      router.replace(router.asPath, undefined, { locale: targetLng });
    }
  }, []);

  return (
    <>
      <Head>
        <title>FastGPT</title>
        <meta
          name="description"
          content={`FastGPT 是一个大模型应用编排系统，提供开箱即用的数据处理、模型调用等能力，可以快速的构建知识库并通过 Flow 可视化进行工作流编排，实现复杂的知识库场景！`}
        />
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1.0,maximum-scale=1.0,minimum-scale=1.0,user-scalable=no, viewport-fit=cover"
        />
        <link rel="icon" href={'/favicon.ico'} />
      </Head>
      {scripts?.map((item, i) => <Script key={i} strategy="lazyOnload" {...item}></Script>)}

      <ChakraProvider theme={theme}>
        <ColorModeScript initialColorMode={theme.config.initialColorMode} />
        <Component {...pageProps} />
      </ChakraProvider>
    </>
  );
}

// @ts-ignore
export default appWithTranslation(App);
