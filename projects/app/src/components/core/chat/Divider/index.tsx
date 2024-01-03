import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type.d';

const ChatBoxDivider = ({ icon, text }: { icon: IconNameType; text: string }) => {
  return (
    <Box>
      <Flex alignItems={'center'} py={2} gap={2}>
        <MyIcon name={icon} w={'14px'} color={'myGray.900'} />
        <Box color={'myGray.500'} fontSize={'sm'}>
          {text}
        </Box>
        <Box h={'1px'} mt={1} bg={'myGray.200'} flex={'1'} />
      </Flex>
    </Box>
  );
};

export default ChatBoxDivider;
