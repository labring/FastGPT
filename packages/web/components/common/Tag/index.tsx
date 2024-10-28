import React, { useMemo } from 'react';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';

type ColorSchemaType = 'white' | 'blue' | 'green' | 'red' | 'yellow' | 'gray' | 'purple' | 'adora';

export type TagProps = FlexProps & {
  children: React.ReactNode | React.ReactNode[];
  colorSchema?: ColorSchemaType;
  type?: 'fill' | 'borderFill' | 'borderSolid';
  showDot?: boolean;
};

const colorMap: Record<
  ColorSchemaType,
  {
    borderColor: string;
    bg: string;
    color: string;
  }
> = {
  white: {
    borderColor: 'myGray.200',
    bg: 'white',
    color: 'myGray.700'
  },
  yellow: {
    borderColor: 'yellow.200',
    bg: 'yellow.50',
    color: 'yellow.600'
  },
  green: {
    borderColor: 'green.200',
    bg: 'green.50',
    color: 'green.600'
  },
  red: {
    borderColor: 'red.200',
    bg: 'red.50',
    color: 'red.600'
  },
  gray: {
    borderColor: 'myGray.200',
    bg: 'myGray.50',
    color: 'myGray.700'
  },
  blue: {
    borderColor: 'primary.200',
    bg: 'primary.50',
    color: 'primary.600'
  },
  purple: {
    borderColor: '#ECF',
    bg: '#F6EEFA',
    color: '#A558C9'
  },
  adora: {
    borderColor: '#D3CAFF',
    bg: '#F0EEFF',
    color: '#6F5DD7'
  }
};

const MyTag = ({ children, colorSchema = 'blue', type = 'fill', showDot, ...props }: TagProps) => {
  const theme = useMemo(() => {
    return colorMap[colorSchema];
  }, [colorSchema]);

  return (
    <Box
      display={'inline-flex'}
      px={2.5}
      lineHeight={1}
      py={1}
      borderRadius={'sm'}
      fontSize={'xs'}
      alignItems={'center'}
      whiteSpace={'nowrap'}
      borderWidth={'1px'}
      {...theme}
      borderColor={type !== 'fill' ? theme.borderColor : 'transparent'}
      bg={type !== 'borderSolid' ? theme.bg : 'transparent'}
      {...props}
    >
      {showDot && <Box w={1.5} h={1.5} borderRadius={'md'} bg={theme.color} mr={1.5}></Box>}
      {children}
    </Box>
  );
};

export default React.memo(MyTag);
