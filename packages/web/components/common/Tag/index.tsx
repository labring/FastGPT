import React, { useMemo } from 'react';
import { Flex, type FlexProps } from '@chakra-ui/react';

interface Props extends FlexProps {
  children: React.ReactNode | React.ReactNode[];
  colorSchema?: 'blue' | 'green' | 'gray' | 'purple';
  type?: 'fill' | 'solid';
}

const MyTag = ({ children, colorSchema = 'blue', type = 'fill', ...props }: Props) => {
  const theme = useMemo(() => {
    const fillMap = {
      blue: {
        borderColor: 'primary.200',
        bg: 'primary.50',
        color: 'primary.700'
      },
      green: {
        borderColor: 'green.200',
        bg: 'green.50',
        color: 'green.600'
      },
      purple: {
        borderColor: '#ECF',
        bg: '#F6EEFA',
        color: '#A558C9'
      },
      gray: {
        borderColor: 'myGray.200',
        bg: 'myGray.50',
        color: 'myGray.700'
      }
    };
    const solidMap = {
      blue: {
        borderColor: 'primary.200',
        color: 'primary.600'
      },
      green: {
        borderColor: 'green.200',
        color: 'green.600'
      },
      purple: {
        borderColor: '#ECF',
        color: '#9E53C1'
      },
      gray: {
        borderColor: 'myGray.200',
        color: 'myGray.700'
      }
    };
    return type === 'fill' ? fillMap[colorSchema] : solidMap[colorSchema];
  }, [colorSchema]);

  return (
    <Flex
      px={2}
      lineHeight={1}
      py={1}
      borderRadius={'sm'}
      fontSize={'sm'}
      alignItems={'center'}
      whiteSpace={'nowrap'}
      borderWidth={'1px'}
      {...props}
      {...theme}
    >
      {children}
    </Flex>
  );
};

export default React.memo(MyTag);
