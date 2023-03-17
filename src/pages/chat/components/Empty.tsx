import React from 'react';
import { Card, Flex, Box } from '@chakra-ui/react';

const Empty = () => {
  return (
    <Flex h={'100%'} alignItems={'center'} justifyContent={'center'}>
      <Card p={5} w={'70%'}>
        <Box fontSize={'xl'} fontWeight={'bold'} textAlign={'center'} pb={2}>
          Fast Gpt version1.3
        </Box>
        <Box>
          更新了聊天的数据结构，如果出现问题，请手动删除左侧旧的历史记录，并重新从模型页生成对话框进入。
        </Box>
        <Box>分享聊天使用的是分享者的 Api Key 进行收费，请确认分享安全</Box>
        <br />
        <Box>分享空白聊天，会分享一个该模型的空白聊天页</Box>
        <br />
        <Box>分享当前聊天，会把当前聊天的内容分享出去，请注意不会多人同时使用一个对话框</Box>
      </Card>
    </Flex>
  );
};

export default Empty;
