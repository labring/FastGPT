'use client';

import React from 'react';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { Box, Flex, Text } from '@chakra-ui/react';

const ModerationLogsPage = () => {
  return (
    <AdminContainer>
      <Flex flexDirection={'column'} h={'100%'} bg={'myGray.50'}>
        <Flex
          h={'64px'}
          flexShrink={0}
          px={6}
          alignItems={'center'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
          bg={'white'}
        >
          <Text fontSize={'lg'} fontWeight={'bold'} color={'myGray.900'}>
            审核服务日志
          </Text>
        </Flex>

        <Box flex={1} p={6}>
          <Flex
            h={'360px'}
            alignItems={'center'}
            justifyContent={'center'}
            bg={'white'}
            borderRadius={'md'}
            border={'1px solid'}
            borderColor={'myGray.200'}
          >
            <EmptyTip text="当前暂无内容审核服务的异常告警日志" />
          </Flex>
        </Box>
      </Flex>
    </AdminContainer>
  );
};

export default ModerationLogsPage;
