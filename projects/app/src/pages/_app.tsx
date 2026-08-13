import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { appWithTranslation } from 'next-i18next';
import { clientI18nConfig } from '@fastgpt/web/i18n/clientConfig';
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

export default appWithTranslation(AppRouter, clientI18nConfig);
