import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

const ChatErrorCard = ({ title, message }: { title: string; message: string }) => {
  return (
    <Box
      w={'100%'}
      maxW={'420px'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      borderRadius={'8px'}
      bg={'white'}
      px={'16px'}
      py={'12px'}
    >
      <Flex alignItems={'center'} gap={'8px'} color={'myGray.700'}>
        <MyIcon name={'common/warn'} w={'18px'} color={'#F79009'} flexShrink={0} />
        <Box fontSize={'14px'} lineHeight={'20px'} fontWeight={500}>
          {title}
        </Box>
      </Flex>
      <Box mt={'4px'} pl={'26px'} color={'myGray.500'} fontSize={'13px'} lineHeight={'20px'}>
        {message}
      </Box>
    </Box>
  );
};

export default React.memo(ChatErrorCard);
