import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import { theme } from '@fastgpt/web/styles/theme';
import { Router } from 'next/router';
import { ReactNode } from 'react';
import NProgress from 'nprogress'; //nprogress module

import 'nprogress/nprogress.css';

Router.events.on('routeChangeStart', () => NProgress.start());
Router.events.on('routeChangeComplete', () => NProgress.done());
Router.events.on('routeChangeError', () => NProgress.done());

export const ChakraUIContext = ({ children }: { children: ReactNode }) => {
  return (
    <ChakraProvider theme={theme}>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      {children}
    </ChakraProvider>
  );
};

export default ChakraUIContext;
