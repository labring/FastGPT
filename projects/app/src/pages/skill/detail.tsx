'use client';
import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { serviceSideProps } from '@/web/common/i18n/utils';
import SkillDetailContextProvider, {
  SkillDetailContext
} from '@/pageComponents/dashboard/skill/detail/context';
import {
  HeaderProvider,
  LeftHeader,
  HeaderDialogs
} from '@/pageComponents/dashboard/skill/detail/Header';
import Content from '@/pageComponents/dashboard/skill/detail/Content';
import SkillPreview from '@/pageComponents/dashboard/skill/detail/preview/SkillPreview';

const MainLayout = () => {
  const chatId = useContextSelector(SkillDetailContext, (v) => v.chatId);

  if (!chatId) return null;

  return (
    <HeaderProvider>
      <Flex h={'100%'} bg={'myGray.25'} overflow={'hidden'}>
        {/* 左栏: 488px 预览对话区域 */}
        <Flex
          w={'488px'}
          flexShrink={0}
          direction={'column'}
          h={'100%'}
          sx={{
            '& .app-chat-main': {
              bg: 'transparent !important'
            },
            '& div[class*="my-box"]': {
              bg: 'transparent !important'
            }
          }}
        >
          <LeftHeader />
          <Box flex={1} minH={0} overflow={'hidden'}>
            <SkillPreview />
          </Box>
        </Flex>

        {/* 右栏: 文件树 + 编辑器区域 */}
        <Box flex={1} h={'100%'} overflow={'hidden'}>
          <Content />
        </Box>
      </Flex>
      <HeaderDialogs />
    </HeaderProvider>
  );
};

const SkillDetail = () => {
  return (
    <SkillDetailContextProvider>
      <MainLayout />
    </SkillDetailContextProvider>
  );
};

export default SkillDetail;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'chat', 'common', 'skill']))
    }
  };
}
