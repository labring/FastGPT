import type { AppProps } from 'next/app';
import Script from 'next/script';
import Head from 'next/head';
import Layout from '@/components/Layout';
import { appWithTranslation } from 'next-i18next';

import QueryClientContext from '@/web/context/QueryClient';
import ChakraUIContext from '@/web/context/ChakraUI';
import I18nContextProvider from '@/web/context/I18n';
import { useInitApp } from '@/web/context/useInitApp';

import '@/web/styles/reset.scss';
import NextHead from '@/components/common/NextHead';

function App({ Component, pageProps }: AppProps) {
  // const router = useRouter();
  // const { hiId } = router.query as { hiId?: string };
  // const { i18n } = useTranslation();
  // const { loadGitStar, setInitd, feConfigs } = useSystemStore();
  // const [scripts, setScripts] = useState<FastGPTFeConfigsType['scripts']>([]);
  // const [title, setTitle] = useState(process.env.SYSTEM_NAME || 'AI');

  // useEffect(() => {
  //   // get init data
  //   (async () => {
  //     const {
  //       feConfigs: { scripts, isPlus, show_git, systemTitle }
  //     } = await clientInitData();

  //     setTitle(systemTitle || 'LLM Studio');

  //     // log fastgpt
  //     if (!isPlus) {
  //       // console.log(
  //       //   '%cWelcome to FastGPT',
  //       //   'font-family:Arial; color:#3370ff ; font-size:18px; font-weight:bold;',
  //       //   `GitHub：https://github.com/labring/FastGPT`
  //       // );
  //     }
  //     if (show_git) {
  //       loadGitStar();
  //     }

  //     setScripts(scripts || []);
  //     setInitd();
  //   })();

  //   // add window error track
  //   window.onerror = function (msg, url) {
  //     window.umami?.track('windowError', {
  //       device: {
  //         userAgent: navigator.userAgent,
  //         platform: navigator.platform,
  //         appName: navigator.appName
  //       },
  //       msg,
  //       url
  //     });
  //   };

  //   return () => {
  //     window.onerror = null;
  //   };
  // }, []);

  // useEffect(() => {
  //   // get default language
  //   const targetLng = change2DefaultLng(i18n.language);
  //   if (targetLng) {
  //     setLngStore(targetLng);
  //     router.replace(router.asPath, undefined, { locale: targetLng });
  //   }
  // }, []);

  // useEffect(() => {
  //   hiId && localStorage.setItem('inviterId', hiId);
  // }, [hiId]);
  const { feConfigs, scripts, title } = useInitApp();

  return (
    <>
      <NextHead
        title={title}
        desc={
          feConfigs?.systemDescription ||
          process.env.SYSTEM_DESCRIPTION ||
          `${title} 是一个大模型应用编排系统，提供开箱即用的数据处理、模型调用等能力，可以快速的构建知识库并通过 Flow 可视化进行工作流编排，实现复杂的知识库场景！`
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
