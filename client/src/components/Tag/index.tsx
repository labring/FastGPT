import React, { useMemo } from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';

interface Props extends BoxProps {
  children: string;
  colorSchema?: 'blue' | 'green' | 'gray';
}

const Tag = ({ children, colorSchema = 'blue', ...props }: Props) => {
  const theme = useMemo(() => {
    const map = {
      blue: {
        borderColor: 'myBlue.700',
        bg: '#F2FBFF',
        color: 'myBlue.700'
      },
      green: {
        borderColor: '#52C41A',
        bg: '#EDFFED',
        color: '#52C41A'
      },
      gray: {
        borderColor: '#979797',
        bg: '#F7F7F7',
        color: '#979797'
      }
    };
    return map[colorSchema];
  }, [colorSchema]);
  return (
    <Box
      display={'inline-block'}
      border={'1px solid'}
      px={2}
      lineHeight={1}
      py={'2px'}
      borderRadius={'md'}
      fontSize={'xs'}
      {...theme}
      {...props}
    >
      {children}
    </Box>
  );
};

export default Tag;
