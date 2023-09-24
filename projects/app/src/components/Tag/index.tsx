import React, { useMemo } from 'react';
import { Flex, type FlexProps } from '@chakra-ui/react';

interface Props extends FlexProps {
  children: React.ReactNode | React.ReactNode[];
  colorSchema?: 'blue' | 'green' | 'gray' | 'purple';
}

const Tag = ({ children, colorSchema = 'blue', ...props }: Props) => {
  const theme = useMemo(() => {
    const map = {
      blue: {
        borderColor: 'myBlue.600',
        bg: '#F2FBFF',
        color: 'myBlue.700'
      },
      green: {
        borderColor: '#67c13b',
        bg: '#f8fff8',
        color: '#67c13b'
      },
      purple: {
        borderColor: '#A558C9',
        bg: '#F6EEFA',
        color: '#A558C9'
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
    <Flex
      border={'1px solid'}
      px={2}
      lineHeight={1}
      py={1}
      borderRadius={'md'}
      fontSize={'xs'}
      alignItems={'center'}
      {...theme}
      {...props}
    >
      {children}
    </Flex>
  );
};

export default Tag;
