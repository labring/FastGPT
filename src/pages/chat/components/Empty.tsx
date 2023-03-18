import React from 'react';
import { Card, Box, Mark } from '@chakra-ui/react';
import { versionIntro, chatProblem } from '@/constants/common';
import Markdown from '@/components/Markdown';

const Empty = ({ intro }: { intro: string }) => {
  const Header = ({ children }: { children: string }) => (
    <Box fontSize={'lg'} fontWeight={'bold'} textAlign={'center'} pb={2}>
      {children}
    </Box>
  );
  return (
    <Box
      minH={'100%'}
      w={'85%'}
      maxW={'600px'}
      m={'auto'}
      py={'5vh'}
      alignItems={'center'}
      justifyContent={'center'}
    >
      {!!intro && (
        <Card p={4} mb={10}>
          <Header>模型介绍</Header>
          <Box>{intro}</Box>
        </Card>
      )}
      <Card p={4} mb={10}>
        <Header>常见问题</Header>
        <Markdown source={chatProblem} />
      </Card>
      {/* version intro */}
      <Card p={4}>
        <Header>Fast Gpt version1.4</Header>
        <Box>
          聊天的数据结构发生了比较大的改动。如果出现问题，请手动删除左侧旧的历史记录，并重新从模型页生成对话框进入。
        </Box>
        <br />
        <Markdown source={versionIntro} />
      </Card>
    </Box>
  );
};

export default Empty;
