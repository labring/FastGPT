import type { IconButtonProps } from '@chakra-ui/react';

export const chatHeaderIconButtonStyle: Partial<IconButtonProps> = {
  w: '32px',
  h: '32px',
  minW: '32px',
  p: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'myGray.600',
  bg: 'white',
  border: '1px solid',
  borderColor: 'myGray.250',
  boxShadow: '0px 0px 1px 0px rgba(19, 51, 107, 0.08), 0px 1px 2px 0px rgba(19, 51, 107, 0.05)',
  borderRadius: '8px',
  _hover: {
    color: 'primary.600',
    bg: 'white',
    borderColor: 'myGray.250',
    boxShadow:
      '0px 0px 1px 0px rgba(19, 51, 107, 0.08), 0px 1px 2px 0px rgba(19, 51, 107, 0.05)'
  },
  _active: {
    color: 'primary.600',
    bg: 'white',
    borderColor: 'myGray.250',
    boxShadow:
      '0px 0px 1px 0px rgba(19, 51, 107, 0.08), 0px 1px 2px 0px rgba(19, 51, 107, 0.05)'
  }
};

export const mobileChatHeaderIconButtonStyle: Partial<IconButtonProps> = {
  w: '36px',
  h: '36px',
  minW: '36px',
  p: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'myGray.500',
  bg: 'transparent',
  border: 'none',
  boxShadow: 'none',
  borderRadius: '8px',
  _hover: {
    color: 'primary.600',
    bg: 'transparent',
    boxShadow: 'none'
  },
  _active: {
    color: 'primary.600',
    bg: 'transparent',
    boxShadow: 'none'
  }
};
