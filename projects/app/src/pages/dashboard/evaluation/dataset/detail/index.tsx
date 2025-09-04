'use client';
import React from 'react';
import { Flex } from '@chakra-ui/react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import NavBar from '@/pageComponents/dashboard/evaluation/dataset/detail/NavBar';
import { DatasetDetailPageContextProvider } from '@/web/core/evaluation/context/datasetDetailPageContext';
import NextHead from '@/components/common/NextHead';

import DataList from '@/pageComponents/dashboard/evaluation/dataset/detail/DataList';

type Props = { datasetId: string; currentTab: string };

const Detail = ({ datasetId, currentTab }: Props) => {
  return (
    <>
      {/* TODO-lyx */}
      <NextHead title="Mock 名称" />
      <Flex h={'100%'} py={3} pl={1} pr={3} gap={2}>
        <Flex flex={1} w={0} bg={'white'} flexDir={'column'} boxShadow={'2'} borderRadius={'md'}>
          <NavBar />
          <DataList />
        </Flex>
      </Flex>
    </>
  );
};

const Render = (data: Props) => (
  <DatasetDetailPageContextProvider datasetId={data.datasetId}>
    <Detail {...data} />
  </DatasetDetailPageContextProvider>
);
export default Render;

export async function getServerSideProps(context: any) {
  const currentTab = context?.query?.currentTab || '';
  const datasetId = context?.query?.datasetId;

  return {
    props: {
      currentTab,
      datasetId,
      ...(await serviceSideProps(context, ['dataset', 'file', 'user']))
    }
  };
}
