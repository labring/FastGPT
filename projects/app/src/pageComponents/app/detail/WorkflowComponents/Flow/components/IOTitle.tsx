import React from 'react';
import { Box, StackProps, HStack } from '@chakra-ui/react';

const IOTitle = ({ text, ...props }: { text?: 'Input' | 'Output' | string } & StackProps) => {
  return (
    <HStack fontSize={'md'} alignItems={'center'} fontWeight={'medium'} mb={4} {...props}>
      <Box w={'3px'} h={'14px'} borderRadius={'13px'} bg={'primary.600'} />
      <Box color={'myGray.900'}>{text}</Box>
    </HStack>
  );
};

export default React.memo(IOTitle);
