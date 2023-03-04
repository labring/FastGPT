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
      fontSize: 'sm',
      px: 3,
      py: 0,
      fontWeight: 'normal',
      height: '26px'
    },
    md: {
      fontSize: 'md',
      px: 6,
      py: 0,
      height: '34px',
      fontWeight: 'normal'
    },
    lg: {
      fontSize: 'lg',
      px: 8,
      py: 0,
      height: '42px',
      fontWeight: 'normal'
    }
  },
  variants: {
    outline: {
      borderWidth: '1.5px'
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
        fontSize: '14px',
        fontFamily:
          'Söhne,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif,Helvetica Neue,Arial,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji',
        height: '100%',
        overflowY: 'auto'
      }
    }
  },
  fonts: {
    body: 'system-ui, sans-serif'
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
  components: {
    Modal: ModalTheme,
    Button
  }
});
