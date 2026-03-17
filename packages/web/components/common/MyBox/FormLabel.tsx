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
      gap={'2px'}
      {...props}
    >
      {required && (
        <Box color={'red.600'} lineHeight={1}>
          *
        </Box>
      )}
      {children}
    </Box>
  );
};

export default FormLabel;
