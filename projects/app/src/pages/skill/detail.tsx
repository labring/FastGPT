'use client';
import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { DashboardNavbar, SIDEBAR_COLLAPSED_WIDTH } from '@/pageComponents/dashboard/Container';
import SkillDetailContextProvider from '@/pageComponents/dashboard/skill/detail/context';
import Header from '@/pageComponents/dashboard/skill/detail/Header';
import Content from '@/pageComponents/dashboard/skill/detail/Content';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

const SkillDetail = () => {
  const { isPc } = useSystem();

  return (
    <>
      {isPc && <DashboardNavbar isCollapsed={true} setIsCollapsed={() => {}} hideCollapseButton />}
      <Box
        h={'100%'}
        pl={isPc ? SIDEBAR_COLLAPSED_WIDTH : 0}
        position={'relative'}
        bgGradient="linear(180deg, #F2F8FF 0%, #F7F9FC 12%)"
        transition="padding-left 0.2s ease"
      >
        <SkillDetailContextProvider>
          <Flex h={'100%'} flexDirection={'column'} px={'16px'} pb={'12px'}>
            <Header />
            <Content />
          </Flex>
        </SkillDetailContextProvider>
      </Box>
    </>
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
