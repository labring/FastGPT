import type { FlexProps } from '@chakra-ui/react';

export type MySelectSize = 'sm' | 'md' | 'lg';

export const selectSizeStyleMap: Record<MySelectSize, Pick<FlexProps, 'h' | 'borderRadius'>> = {
  sm: {
    h: 8,
    borderRadius: 'sm'
  },
  md: {
    h: 9,
    borderRadius: 'sm'
  },
  lg: {
    h: 10,
    borderRadius: 'md'
  }
};
