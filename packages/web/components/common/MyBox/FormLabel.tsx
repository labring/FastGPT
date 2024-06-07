import React from 'react';
import { Box, BoxProps } from '@chakra-ui/react';

const FormLabel = ({
  children,
  ...props
}: BoxProps & {
  children: React.ReactNode;
}) => {
  return (
    <Box color={'myGray.900'} fontSize={'sm'} {...props}>
      {children}
    </Box>
  );
};

export default FormLabel;
