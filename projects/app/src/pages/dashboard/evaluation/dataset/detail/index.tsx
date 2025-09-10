'use client';
import React from 'react';
import { Flex } from '@chakra-ui/react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import NavBar from '@/pageComponents/dashboard/evaluation/dataset/detail/NavBar';
import { DatasetDetailPageContextProvider } from '@/web/core/evaluation/context/datasetDetailPageContext';
import NextHead from '@/components/common/NextHead';

import DataList from '@/pageComponents/dashboard/evaluation/dataset/detail/DataList';

type Props = { collectionId: string; collectionName: string };

const Detail = ({ collectionId, collectionName }: Props) => {
  return (
    <>
      <NextHead title={collectionName} />
      <Flex h={'100%'} py={3} pl={1} pr={3} gap={2}>
        <Flex flex={1} w={0} bg={'white'} flexDir={'column'} boxShadow={'2'} borderRadius={'md'}>
          <NavBar />
          <DataList collectionId={collectionId} />
        </Flex>
      </Flex>
    </>
  );
};

const Render = (data: Props) => (
  <DatasetDetailPageContextProvider
    collectionId={data.collectionId}
    collectionName={data.collectionName}
  >
    <Detail {...data} />
  </DatasetDetailPageContextProvider>
);
export default Render;

export async function getServerSideProps(context: any) {
  const collectionId = context?.query?.collectionId || '';
  const collectionName = context?.query?.collectionName;

  return {
    props: {
      collectionId,
      collectionName,
      ...(await serviceSideProps(context, ['dashboard_evaluation', 'file', 'user']))
    }
  };
}
