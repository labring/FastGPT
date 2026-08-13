import type { AppProps } from 'next/app';
import type { NextPage } from 'next';
import { type ReactElement } from 'react';
import { useTranslation } from 'next-i18next';
import ClientI18nBoundary from '@fastgpt/web/i18n/ClientI18nBoundary';
import ClientI18nGate from '@fastgpt/web/i18n/ClientI18nGate';
import { LANG_KEY } from '@fastgpt/web/i18n/utils';
import ClientBootLoading from './ClientBootLoading';

type NextPageWithLayout = NextPage & {
  setLayout?: (page: ReactElement) => JSX.Element;
};

type ClientOnlyPageProps = AppProps & {
  Component: NextPageWithLayout;
};

/**
 * 只隔离客户端页面内容，避免路由切换时卸载 AppShell、全局 Provider 和 Navbar。
 * 该组件由 `next/dynamic` 以 `ssr: false` 加载，确保迁移中的页面不输出服务端业务内容。
 */
const ClientOnlyPage = ({ Component, pageProps }: ClientOnlyPageProps) => {
  const { i18n } = useTranslation();
  const setLayout = Component.setLayout || ((page: ReactElement) => <>{page}</>);

  return (
    <ClientI18nGate defaultLanguage="en" storageKey={LANG_KEY} fallback={<ClientBootLoading />}>
      <ClientI18nBoundary language={i18n.language} fallback={<ClientBootLoading />}>
        {setLayout(<Component {...pageProps} />)}
      </ClientI18nBoundary>
    </ClientI18nGate>
  );
};

export default ClientOnlyPage;
