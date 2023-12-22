import { extendTheme, defineStyleConfig, ComponentStyleConfig } from '@chakra-ui/react';
import {
  modalAnatomy,
  switchAnatomy,
  selectAnatomy,
  numberInputAnatomy,
  checkboxAnatomy
} from '@chakra-ui/anatomy';
import { createMultiStyleConfigHelpers } from '@chakra-ui/styled-system';

const { definePartsStyle, defineMultiStyleConfig } = createMultiStyleConfigHelpers(
  modalAnatomy.keys
);
const { definePartsStyle: switchPart, defineMultiStyleConfig: switchMultiStyle } =
  createMultiStyleConfigHelpers(switchAnatomy.keys);
const { definePartsStyle: selectPart, defineMultiStyleConfig: selectMultiStyle } =
  createMultiStyleConfigHelpers(selectAnatomy.keys);
const { definePartsStyle: numInputPart, defineMultiStyleConfig: numInputMultiStyle } =
  createMultiStyleConfigHelpers(numberInputAnatomy.keys);
const { definePartsStyle: checkBoxPart, defineMultiStyleConfig: checkBoxMultiStyle } =
  createMultiStyleConfigHelpers(checkboxAnatomy.keys);

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
      px: 4,
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
      bg: 'primary.600',
      color: 'white',
      border: 'none',
      boxShadow: '0px 0px 1px 0px rgba(19, 51, 107, 0.08), 0px 1px 2px 0px rgba(19, 51, 107, 0.05)',
      _hover: {
        filter: 'brightness(120%)'
      },
      _disabled: {
        bg: 'primary.7 !important'
      }
    },
    solidGray: {
      bg: 'myGray.150',
      color: 'myGray.900',
      _hover: {
        color: 'primary.600',
        bg: 'primary.50'
      },
      _disabled: {
        bg: 'myGray.50'
      }
    },
    solidWhite: {
      color: 'myGray.600',
      border: '1px solid',
      borderColor: 'myGray.250',
      bg: 'white',
      transition: 'background 0.1s',
      boxShadow: '0px 0px 1px 0px rgba(19, 51, 107, 0.08), 0px 1px 2px 0px rgba(19, 51, 107, 0.05)',
      _hover: {
        color: 'primary.600',
        background: 'primary.1',
        borderColor: 'primary.300'
      },
      _active: {
        color: 'primary.600'
      }
    },
    ghostDanger: {
      color: 'myGray.600',
      border: '1px solid',
      borderColor: 'myGray.250',
      bg: 'white',
      transition: 'background 0.1s',
      boxShadow: '0px 0px 1px 0px rgba(19, 51, 107, 0.08), 0px 1px 2px 0px rgba(19, 51, 107, 0.05)',
      _hover: {
        color: 'red.600',
        background: 'red.1',
        borderColor: 'red.300'
      },
      _active: {
        color: 'red.600'
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
          borderColor: 'primary.500',
          boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
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

const NumberInput = numInputMultiStyle({
  variants: {
    outline: numInputPart({
      field: {
        bg: 'myWhite.300',
        border: '1px solid',
        borderRadius: 'base',
        borderColor: 'myGray.200',
        _focus: {
          borderColor: 'primary.500 !important',
          boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15) !important',
          bg: 'transparent'
        },
        _disabled: {
          color: 'myGray.400 !important',
          bg: 'myWhite.300 !important'
        }
      },
      stepper: {
        bg: 'transparent',
        border: 'none',
        color: 'myGray.600',
        _active: {
          color: 'primary.500'
        }
      }
    })
  },
  defaultProps: {
    variant: 'outline'
  }
});

const Textarea: ComponentStyleConfig = {
  variants: {
    outline: {
      border: '1px solid',
      borderRadius: 'base',
      borderColor: 'myGray.200',
      _hover: {
        borderColor: ''
      },
      _focus: {
        borderColor: 'primary.500',
        boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
        bg: 'white'
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
        bg: 'primary.600'
      }
    }
  })
});

const Select = selectMultiStyle({
  variants: {
    outline: selectPart({
      field: {
        borderColor: 'myGray.200',
        _focusWithin: {
          boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
          borderColor: 'primary.500'
        }
      }
    })
  }
});

const Checkbox = checkBoxMultiStyle({
  baseStyle: checkBoxPart({
    label: {
      fontFamily: 'mono' // change the font family of the label
    }
  })
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
        // lineHeight: 'unset'
      },
      a: {
        color: 'primary.600'
      }
    }
  },
  colors: {
    myWhite: {
      100: '#FEFEFE',
      200: '#FDFDFE',
      300: '#FBFBFC',
      400: '#F8FAFB',
      500: '#F6F8F9',
      600: '#F4F6F8',
      700: '#C3C5C6',
      800: '#929495',
      900: '#626263',
      1000: '#313132'
    },
    myGray: {
      25: '#FBFBFC',
      50: '#F7F8FA',
      100: '#F4F4F7',
      150: '#F0F1F6',
      200: '#E8EBF0',
      250: '#DFE2EA',
      300: '#C4CBD7',
      400: '#8A95A7',
      500: '#667085',
      600: '#485264',
      700: '#383F50',
      800: '#1D2532',
      900: '#111824'
    },
    primary: {
      1: 'rgba(51, 112, 255, 0.1)',
      3: 'rgba(51, 112, 255, 0.3)',
      5: 'rgba(51, 112, 255, 0.5)',
      7: 'rgba(51, 112, 255, 0.7)',
      9: 'rgba(51, 112, 255, 0.9)',

      50: '#F0F4FF',
      100: '#E1EAFF',
      200: '#C5D7FF',
      300: '#94B5FF',
      400: '#5E8FFF',
      500: '#487FFF',
      600: '#3370FF',
      700: '#2B5FD9',
      800: '#2450B5',
      900: '#1D4091'
    },
    red: {
      1: 'rgba(217,45,32,0.1)',
      3: 'rgba(217,45,32,0.3)',
      5: 'rgba(217,45,32,0.5)',

      25: '#FFFBFA',
      50: '#FEF3F2',
      100: '#FEE4E2',
      200: '#FECDCA',
      300: '#FDA29B',
      400: '#F97066',
      500: '#F04438',
      600: '#D92D20',
      700: '#B42318',
      800: '#912018',
      900: '#7A271A'
    },
    green: {
      25: '#F9FEFB',
      50: '#EDFBF3',
      100: '#D1FADF',
      200: '#B9F4D1',
      300: '#76E4AA',
      400: '#32D583',
      500: '#12B76A',
      600: '#039855',
      700: '#027A48',
      800: '#05603A',
      900: '#054F31'
    }
  },
  fonts: {
    body: 'PingFang,Noto Sans,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol"'
  },
  fontSizes: {
    xs: '10',
    sm: '12px',
    md: '14px',
    lg: '16px',
    xl: '18px',
    '2xl': '20px',
    '3xl': '24px',
    '4xl': '28px',
    '5xl': '32px',
    '6xl': '36px'
  },
  borderColor: {
    low: 'myGray.200',
    common: 'myGray.250',
    high: 'myGray.300',
    highest: 'myGray.400'
  },
  borders: {
    sm: '1px solid #EFF0F1',
    base: '1px solid #DEE0E2',
    md: '1px solid #DAE0E2',
    lg: '1px solid #D0E0E2'
  },
  shadows: {
    sm: '0 0 5px rgba(0,0,0,0.1)',
    md: '0 0 8px rgba(0,0,0,0.1)',
    base: '0 0 10px rgba(0,0,0,0.15)',
    lg: '0 0 10px rgba(0,0,0,0.2)'
  },
  breakpoints: {
    sm: '900px',
    md: '1200px',
    lg: '1500px',
    xl: '1800px',
    '2xl': '2100px'
  },
  lgColor: {
    activeBlueGradient: 'linear-gradient(to bottom right, #d6e8ff 0%, #f0f7ff 100%)',
    hoverBlueGradient: 'linear-gradient(to top left, #d6e8ff 0%, #f0f7ff 100%)',
    primary: 'linear-gradient(to bottom right, #2152d9 0%,#3370ff 40%, #4e83fd 100%)',
    primary2: 'linear-gradient(to bottom right, #2152d9 0%,#3370ff 30%,#4e83fd 80%, #85b1ff 100%)'
  },
  components: {
    Button,
    Input,
    Textarea,
    Switch,
    Select,
    NumberInput,
    Checkbox
  }
});
