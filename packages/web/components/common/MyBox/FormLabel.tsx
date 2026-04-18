import React from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';

const FormLabel = ({
  children,
  required,
  ...props
}: BoxProps & {
  required?: boolean;
  children: React.ReactNode;
}) => {
  return (
    <Box
      color={'myGray.900'}
      fontWeight={'medium'}
      fontSize={'sm'}
      flexShrink={0}
      display={'flex'}
      alignItems={'center'}
      position={'relative'}
      {...props}
    >
      {required && (
        <Box color={'red.600'} lineHeight={1} position={'absolute'} left={'-8px'}>
          *
        </Box>
      )}
      {children}
    </Box>
  );
};

export default FormLabel;
