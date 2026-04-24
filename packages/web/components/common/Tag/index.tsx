import React, { useMemo } from 'react';
import { Box, type BoxProps, Flex, type FlexProps } from '@chakra-ui/react';

export type ColorSchemaType =
  | 'white'
  | 'blue'
  | 'primary'
  | 'green'
  | 'red'
  | 'yellow'
  | 'gray'
  | 'purple'
  | 'adora'
  | 'orange'
  | 'pink'
  | 'lightBlue';

export type TagProps = FlexProps & {
  children: React.ReactNode | React.ReactNode[];
  colorSchema?: ColorSchemaType;
  type?: 'fill' | 'borderFill' | 'borderSolid';
  showDot?: boolean;
  DotStyles?: BoxProps;
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
    bg: 'green.25',
    color: 'green.700'
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
  primary: {
    borderColor: 'primary.200',
    bg: 'primary.50',
    color: 'primary.600'
  },
  blue: {
    borderColor: 'blue.200',
    bg: 'blue.50',
    color: 'blue.600'
  },
  purple: {
    borderColor: 'violet.50',
    bg: 'violet.25',
    color: 'violet.500'
  },
  adora: {
    borderColor: 'adora.200',
    bg: 'adora.50',
    color: 'adora.600'
  },
  orange: {
    borderColor: 'orange.200',
    bg: 'orange.50',
    color: 'orange.600'
  },
  pink: {
    borderColor: 'pink.50',
    bg: 'pink.25',
    color: 'pink.500'
  },
  lightBlue: {
    borderColor: '#B3D4FF',
    bg: 'rgba(230, 241, 255, 0.6)',
    color: 'blue.600'
  }
};

const MyTag = ({
  children,
  colorSchema = 'blue',
  type = 'fill',
  showDot,
  DotStyles,
  ...props
}: TagProps) => {
  const theme = useMemo(() => {
    return colorMap[colorSchema];
  }, [colorSchema]);

  return (
    <Flex
      display={'inline-flex'}
      px={2}
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
      {showDot && (
        <Box w={1.5} h={1.5} borderRadius={'md'} bg={theme.color} mr={1.5} {...DotStyles}></Box>
      )}
      {children}
    </Flex>
  );
};

export default React.memo(MyTag);
