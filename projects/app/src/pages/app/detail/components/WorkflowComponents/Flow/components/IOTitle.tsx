import React from 'react';
import { Box, Flex, FlexProps } from '@chakra-ui/react';

const IOTitle = ({ text, ...props }: { text?: 'Input' | 'Output' | string } & FlexProps) => {
  return (
    <Flex fontSize={'md'} alignItems={'center'} fontWeight={'medium'} mb={3} {...props}>
      <Box w={'3px'} h={'14px'} borderRadius={'13px'} bg={'primary.600'} mr={1.5} />
      {text}
    </Flex>
  );
};

export default React.memo(IOTitle);
