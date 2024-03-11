import React, { useMemo } from 'react';
import { Flex, type FlexProps } from '@chakra-ui/react';

interface Props extends FlexProps {
  children: React.ReactNode | React.ReactNode[];
  colorSchema?: 'blue' | 'green' | 'gray' | 'purple';
}

const FillTag = ({ children, colorSchema = 'blue', ...props }: Props) => {
  const theme = useMemo(() => {
    const map = {
      blue: {
        bg: 'primary.50',
        color: 'primary.600'
      },
      green: {
        bg: 'green.50',
        color: 'green.600'
      },
      purple: {
        bg: '#F6EEFA',
        color: '#A558C9'
      },
      gray: {
        bg: 'myGray.50',
        color: 'myGray.700'
      }
    };
    return map[colorSchema];
  }, [colorSchema]);

  return (
    <Flex
      {...theme}
      px={2}
      lineHeight={1}
      py={1}
      borderRadius={'sm'}
      fontSize={'xs'}
      alignItems={'center'}
      {...props}
    >
      {children}
    </Flex>
  );
};

export default FillTag;
