import { extendTheme, defineStyleConfig, ComponentStyleConfig } from '@chakra-ui/react';
// @ts-ignore
import { modalAnatomy, switchAnatomy, selectAnatomy, checkboxAnatomy } from '@chakra-ui/anatomy';
// @ts-ignore
import { createMultiStyleConfigHelpers } from '@chakra-ui/styled-system';

const { definePartsStyle, defineMultiStyleConfig } = createMultiStyleConfigHelpers(
  modalAnatomy.keys
);
const { definePartsStyle: switchPart, defineMultiStyleConfig: switchMultiStyle } =
  createMultiStyleConfigHelpers(switchAnatomy.keys);
const { definePartsStyle: selectPart, defineMultiStyleConfig: selectMultiStyle } =
  createMultiStyleConfigHelpers(selectAnatomy.keys);
const { definePartsStyle: checkboxPart, defineMultiStyleConfig: checkboxMultiStyle } =
  createMultiStyleConfigHelpers(checkboxAnatomy.keys);

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
  baseStyle: {
    _active: {
      transform: 'scale(0.98)'
    }
  },
  sizes: {
    xs: {
      fontSize: 'xs',
      px: 3,
      py: 0,
      fontWeight: 'normal',
      height: '22px',
      borderRadius: '2px'
    },
    sm: {
      fontSize: 'sm',
      px: 3,
      py: 0,
      fontWeight: 'normal',
      height: '26px',
      borderRadius: '2px'
    },
    md: {
      fontSize: 'md',
      px: 6,
      py: 0,
      height: '32px',
      fontWeight: 'normal',
      borderRadius: '4px'
    },
    lg: {
      fontSize: 'lg',
      px: 8,
      py: 0,
      height: '42px',
      fontWeight: 'normal',
      borderRadius: '8px'
    }
  },
  variants: {
    primary: {
      background: 'myBlue.700 !important',
      color: 'white',
      _hover: {
        filter: 'brightness(110%)'
      }
    },
    base: {
      color: 'myGray.900',
      border: '1px solid',
      borderColor: 'myGray.200',
      bg: 'transparent',
      _hover: {
        color: 'myBlue.600'
      },
      _active: {
        color: 'myBlue.700'
      }
    }
  },
  defaultProps: {
    size: 'md',
    variant: 'primary'
  }
});

const Input: ComponentStyleConfig = {
  baseStyle: {},
  variants: {
    outline: {
      field: {
        backgroundColor: 'transparent',
        border: '1px solid',
        borderRadius: 'base',
        borderColor: 'myGray.200',
        _focus: {
          borderColor: 'myBlue.600',
          boxShadow: '0px 0px 4px #A8DBFF',
          bg: 'white'
        },
        _disabled: {
          color: 'myGray.400',
          bg: 'myWhite.300'
        }
      }
    }
  },
  defaultProps: {
    size: 'md',
    variant: 'outline'
  }
};

const Textarea: ComponentStyleConfig = {
  variants: {
    outline: {
      border: '1px solid',
      borderRadius: 'base',
      borderColor: 'myGray.200',
      _focus: {
        borderColor: 'myBlue.600',
        boxShadow: '0px 0px 4px #A8DBFF'
      }
    }
  },

  defaultProps: {
    size: 'md',
    variant: 'outline'
  }
};

const Switch = switchMultiStyle({
  baseStyle: switchPart({
    track: {
      bg: 'myGray.100',
      _checked: {
        bg: 'myBlue.700'
      }
    }
  })
});

const Select = selectMultiStyle({
  variants: {
    outline: selectPart({
      field: {
        borderColor: 'myGray.100',

        _focusWithin: {
          boxShadow: '0px 0px 4px #A8DBFF',
          borderColor: 'myBlue.600'
        }
      }
    })
  }
});

// 全局主题
export const theme = extendTheme({
  styles: {
    global: {
      'html, body': {
        color: 'myGray.900',
        fontSize: 'md',
        fontWeight: 400,
        height: '100%',
        overflow: 'hidden'
      },
      a: {
        color: 'myBlue.700'
      }
    }
  },
  colors: {
    myGray: {
      100: '#EFF0F1',
      200: '#DEE0E2',
      300: '#BDC1C5',
      400: '#9CA2A8',
      500: '#7B838B',
      600: '#5A646E',
      700: '#485058',
      800: '#363C42',
      900: '#24282C',
      1000: '#121416'
    },
    myBlue: {
      100: '#f0f7ff',
      200: '#EBF7FD',
      300: '#d6e8ff',
      400: '#adceff',
      500: '#85b1ff',
      600: '#4e83fd',
      700: '#3370ff',
      800: '#2152d9',
      900: '#1237b3',
      1000: '#07228c'
    }
  },
  fonts: {
    body: '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol"'
  },
  fontSizes: {
    xs: '10px',
    sm: '12px',
    md: '14px',
    lg: '16px',
    xl: '16px',
    '2xl': '18px',
    '3xl': '20px'
  },
  borders: {
    sm: '1px solid #EFF0F1',
    base: '1px solid #DEE0E2',
    md: '1px solid #BDC1C5'
  },
  breakpoints: {
    sm: '900px',
    md: '1200px',
    lg: '1500px',
    xl: '1800px',
    '2xl': '2100px'
  },
  components: {
    Modal: ModalTheme,
    Button,
    Input,
    Textarea,
    Switch,
    Select
  }
});
