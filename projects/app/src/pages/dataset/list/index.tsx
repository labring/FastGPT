import React from 'react';
import { Box, Flex, Image } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import PageContainer from '@/components/PageContainer';
import { useTranslation } from 'next-i18next';
import { serviceSideProps } from '@/web/common/utils/i18n';
import ParentPaths from '@/components/common/folder/Path';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import List from './component/List';
import { DatasetContext } from './context';
import DatasetContextProvider from './context';
import { useContextSelector } from 'use-context-selector';

const Dataset = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { myDatasets } = useDatasetStore();

  const { paths, isFetchingDatasets } = useContextSelector(DatasetContext, (v) => v);

  return (
    <PageContainer
      isLoading={myDatasets.length === 0 && isFetchingDatasets}
      insertProps={{ px: [5, '48px'] }}
    >
      <Flex pt={[4, '30px']} alignItems={'center'} justifyContent={'space-between'}>
        {/* url path */}
        <ParentPaths
          paths={paths}
          FirstPathDom={
            <Flex flex={1} alignItems={'center'}>
              <Image src={'/imgs/workflow/db.png'} alt={''} mr={2} h={'24px'} />
              <Box className="textlg" letterSpacing={1} fontSize={'24px'} fontWeight={'bold'}>
                {t('core.dataset.My Dataset')}
              </Box>
            </Flex>
          }
          onClick={(e) => {
            router.push({
              query: {
                parentId: e
              }
            });
          }}
        />
      </Flex>
      <List />
    </PageContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['dataset']))
    }
  };
}

function DatasetContextWrapper() {
  return (
    <DatasetContextProvider>
      <Dataset />
    </DatasetContextProvider>
  );
}

export default DatasetContextWrapper;
