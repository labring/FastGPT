'use client';
import React from 'react';
import { Flex } from '@chakra-ui/react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import SkillDetailContextProvider from '@/pageComponents/dashboard/skill/detail/context';
import Header from '@/pageComponents/dashboard/skill/detail/Header';
import Content from '@/pageComponents/dashboard/skill/detail/Content';

const SkillDetail = () => {
  return (
    <SkillDetailContextProvider>
      <Flex h={'100%'} flexDirection={'column'} bg={'myGray.50'} px={'16px'} pb={'12px'}>
        <Header />
        <Content />
      </Flex>
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
