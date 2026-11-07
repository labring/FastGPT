import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const ChatErrorCard = ({ title, message }: { title: string; message: string }) => {
  return (
    <Box
      w={'100%'}
      minW={0}
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
        <MyTooltip label={title} showOnlyWhenOverflow>
          <Box
            minW={0}
            flex={1}
            fontSize={'14px'}
            lineHeight={'20px'}
            fontWeight={500}
            overflow={'hidden'}
            whiteSpace={'nowrap'}
            textOverflow={'ellipsis'}
          >
            {title}
          </Box>
        </MyTooltip>
      </Flex>
      <Box mt={'4px'} pl={'26px'} color={'myGray.500'} fontSize={'13px'} lineHeight={'20px'}>
        {message}
      </Box>
    </Box>
  );
};

export default React.memo(ChatErrorCard);
