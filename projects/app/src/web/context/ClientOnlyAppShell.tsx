import type { AppProps } from 'next/app';
import AppShell from './AppShell';
import ClientI18nGate from '@fastgpt/web/i18n/ClientI18nGate';
import ClientI18nBoundary from '@fastgpt/web/i18n/ClientI18nBoundary';
import { LANG_KEY } from '@fastgpt/web/i18n/utils';
import ClientBootLoading from './ClientBootLoading';
import { useTranslation } from 'next-i18next';

const ClientOnlyAppShell = (props: AppProps) => {
  const { i18n } = useTranslation();

  return (
    <ClientI18nGate defaultLanguage="en" storageKey={LANG_KEY} fallback={<ClientBootLoading />}>
      <ClientI18nBoundary language={i18n.language} fallback={<ClientBootLoading />}>
        <AppShell {...props} waitForSystemSize />
      </ClientI18nBoundary>
    </ClientI18nGate>
  );
};

export default ClientOnlyAppShell;
