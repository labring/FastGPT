import type { AppProps } from 'next/app';
import { Suspense } from 'react';
import AppShell from './AppShell';
import ClientI18nGate from '@fastgpt/web/i18n/ClientI18nGate';
import { LANG_KEY } from '@fastgpt/web/i18n/utils';
import ClientBootLoading from './ClientBootLoading';

const ClientOnlyAppShell = (props: AppProps) => (
  <ClientI18nGate defaultLanguage="en" storageKey={LANG_KEY} fallback={<ClientBootLoading />}>
    <Suspense fallback={<ClientBootLoading />}>
      <AppShell {...props} waitForSystemSize />
    </Suspense>
  </ClientI18nGate>
);

export default ClientOnlyAppShell;
