import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { appWithTranslation } from 'next-i18next';
import { ChakraProvider } from '@chakra-ui/react';
import { theme } from '@fastgpt/web/styles/theme';
import I18nInitializer from '@/web/common/i18n/I18nInitializer';

// Simplified theme config without initialColorMode
const safeTheme = {
  ...theme,
  config: {
    ...theme.config,
    initialColorMode: undefined
  }
};

function App({ Component, pageProps }: AppProps) {
  return (
    <ChakraProvider theme={safeTheme}>
      <I18nInitializer />
      <Component {...pageProps} />
    </ChakraProvider>
  );
}

export default appWithTranslation(App);
