import React from 'react';
import { Box, Flex } from '@chakra-ui/react';

const IOTitle = ({ text }: { text?: 'Input' | 'Output' | string }) => {
  return (
    <Flex fontSize={'md'} alignItems={'center'} fontWeight={'medium'} mb={3}>
      <Box w={'3px'} h={'14px'} borderRadius={'13px'} bg={'primary.600'} mr={1.5} />
      {text}
    </Flex>
  );
};

export default React.memo(IOTitle);
