import React from 'react';
import { Box, BoxProps } from '@chakra-ui/react';

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
      position={'relative'}
      flexShrink={0}
      {...props}
    >
      {required && (
        <Box color={'red.600'} position={'absolute'} top={'-4px'} left={'-6px'}>
          *
        </Box>
      )}
      {children}
    </Box>
  );
};

export default FormLabel;
