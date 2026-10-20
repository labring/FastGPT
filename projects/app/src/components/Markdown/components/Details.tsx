import React from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';

export type DetailsProps = {
  dataThink?: any;
  children?: React.ReactNode;
} & BoxProps;

export const Details = ({ children, dataThink, ...props }: DetailsProps) => {
  const isThink = dataThink !== undefined;
  return (
    <Box
      as="details"
      my={2}
      p={3}
      borderRadius="md"
      border="1px solid"
      borderColor={isThink ? 'primary.200' : 'myGray.200'}
      bg={isThink ? 'primary.50' : 'myGray.50'}
      fontSize="sm"
      {...props}
    >
      {children}
    </Box>
  );
};

export default React.memo(Details);
