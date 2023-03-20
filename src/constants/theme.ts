import { extendTheme, defineStyleConfig } from '@chakra-ui/react';
// @ts-ignore
import { modalAnatomy as parts } from '@chakra-ui/anatomy';
// @ts-ignore
import { createMultiStyleConfigHelpers } from '@chakra-ui/styled-system';

const { definePartsStyle, defineMultiStyleConfig } = createMultiStyleConfigHelpers(parts.keys);

// modal 弹窗
const ModalTheme = defineMultiStyleConfig({
  baseStyle: definePartsStyle({
    dialog: {
      width: '90%'
    }
  })
});

// 按键
const Button = defineStyleConfig({
  baseStyle: {},
  sizes: {
    sm: {
      fontSize: 'xs',
      px: 3,
      py: 0,
      fontWeight: 'normal',
      height: '26px',
      lineHeight: '26px'
    },
    md: {
      fontSize: 'sm',
      px: 6,
      py: 0,
      height: '34px',
      lineHeight: '34px',
      fontWeight: 'normal'
    },
    lg: {
      fontSize: 'md',
      px: 8,
      py: 0,
      height: '42px',
      lineHeight: '42px',
      fontWeight: 'normal'
    }
  },
  variants: {
    white: {
      color: '#fff',
      backgroundColor: 'transparent',
      border: '1px solid #ffffff',
      _hover: {
        backgroundColor: 'rgba(255,255,255,0.1)'
      }
    }
  },
  defaultProps: {
    size: 'md',
    colorScheme: 'blue'
  }
});

// 全局主题
export const theme = extendTheme({
  styles: {
    global: {
      'html, body': {
        color: 'blackAlpha.800',
        height: '100%',
        maxHeight: '100vh',
        overflowY: 'hidden'
      }
    }
  },
  fontSizes: {
    xs: '0.8rem',
    sm: '0.9rem',
    md: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
    '5xl': '3rem',
    '6xl': '3.75rem',
    '7xl': '4.5rem',
    '8xl': '6rem',
    '9xl': '8rem'
  },
  fonts: {
    body: '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol"'
  },
  breakpoints: {
    sm: '900px',
    md: '1200px',
    lg: '1500px',
    xl: '1800',
    '2xl': '2100'
  },
  components: {
    Modal: ModalTheme,
    Button
  }
});
