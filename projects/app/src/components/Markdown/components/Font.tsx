import React from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';

export type FontProps = {
  color?: string;
  size?: string;
  face?: string;
  children?: React.ReactNode;
} & BoxProps;

export const Font = ({ color, size, face, children, ...props }: FontProps) => (
  <Box as="span" color={color} fontSize={size} fontFamily={face} {...props}>
    {children}
  </Box>
);

export default React.memo(Font);
