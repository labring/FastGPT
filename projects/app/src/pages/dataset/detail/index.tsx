import React from 'react';
import { useRouter } from 'next/router';
import { Box, Flex } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useQuery } from '@tanstack/react-query';
import { getErrText } from '@fastgpt/global/common/error/utils';
import dynamic from 'next/dynamic';
import PageContainer from '@/components/PageContainer';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';
import MetaDataCard from './components/MetaDataCard';
import NavBar from './components/NavBar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import {
  DatasetPageContext,
  DatasetPageContextProvider
} from '@/web/core/dataset/context/datasetPageContext';
import CollectionPageContextProvider from './components/CollectionCard/Context';
import { useContextSelector } from 'use-context-selector';
import NextHead from '@/components/common/NextHead';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

const CollectionCard = dynamic(() => import('./components/CollectionCard/index'));
const DataCard = dynamic(() => import('./components/DataCard'));
const Test = dynamic(() => import('./components/Test'));
const Info = dynamic(() => import('./components/Info'));
const Import = dynamic(() => import('./components/Import'));

export enum TabEnum {
  dataCard = 'dataCard',
  collectionCard = 'collectionCard',
  test = 'test',
  info = 'info',
  import = 'import'
}
type Props = { datasetId: string; currentTab: TabEnum };

const Detail = ({ datasetId, currentTab }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { isPc } = useSystem();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const loadDatasetDetail = useContextSelector(DatasetPageContext, (v) => v.loadDatasetDetail);
  const loadAllDatasetTags = useContextSelector(DatasetPageContext, (v) => v.loadAllDatasetTags);

  useRequest2(() => loadDatasetDetail(datasetId), {
    onSuccess: () => {
      loadAllDatasetTags({ id: datasetId });
    },
    onError(err: any) {
      router.replace(`/dataset/list`);
      toast({
        title: t(getErrText(err, t('common:common.Load Failed')) as any),
        status: 'error'
      });
    },
    manual: false
  });

  return (
    <>
      <NextHead title={datasetDetail?.name} icon={datasetDetail?.avatar} />

      {isPc ? (
        <Flex h={'100%'} w={'100%'}>
          <Flex
            flexGrow={1}
            flex={81}
            bg={'white'}
            w={'100%'}
            flexDir={'column'}
            my={3}
            mr={2}
            boxShadow={'2'}
            borderRadius={'md'}
          >
            {currentTab !== TabEnum.import && <NavBar currentTab={currentTab} />}
            <Box flex={'1 0 0'} w={'100%'} overflow={'auto'}>
              {currentTab === TabEnum.collectionCard && (
                <CollectionPageContextProvider>
                  <CollectionCard />
                </CollectionPageContextProvider>
              )}
              {currentTab === TabEnum.test && <Test datasetId={datasetId} />}
              {currentTab === TabEnum.dataCard && <DataCard />}
              {currentTab === TabEnum.import && <Import />}
            </Box>
          </Flex>
          {currentTab !== TabEnum.import && (
            <Flex
              bg={'white'}
              borderRadius={'md'}
              overflowY={'scroll'}
              boxShadow={'2'}
              my={3}
              mr={3}
              flex={19}
            >
              {currentTab === TabEnum.dataCard ? (
                <MetaDataCard datasetId={datasetId} />
              ) : (
                <Info datasetId={datasetId} />
              )}
            </Flex>
          )}
        </Flex>
      ) : (
        <PageContainer insertProps={{ bg: 'white' }}>
          <MyBox display={'flex'} flexDirection={['column', 'row']} h={'100%'} pt={[4, 0]}>
            <NavBar currentTab={currentTab} />

            {!!datasetDetail._id && (
              <Box flex={'1 0 0'} pb={0} overflow={'auto'}>
                {currentTab === TabEnum.collectionCard && (
                  <CollectionPageContextProvider>
                    <CollectionCard />
                  </CollectionPageContextProvider>
                )}
                {currentTab === TabEnum.dataCard && <DataCard />}
                {currentTab === TabEnum.test && <Test datasetId={datasetId} />}
                {currentTab === TabEnum.info && <Info datasetId={datasetId} />}
                {currentTab === TabEnum.import && <Import />}
              </Box>
            )}
          </MyBox>
        </PageContainer>
      )}
    </>
  );
};

const Render = (data: Props) => (
  <DatasetPageContextProvider datasetId={data.datasetId}>
    <Detail {...data} />
  </DatasetPageContextProvider>
);
export default Render;

export async function getServerSideProps(context: any) {
  const currentTab = context?.query?.currentTab || TabEnum.collectionCard;
  const datasetId = context?.query?.datasetId;

  return {
    props: {
      currentTab,
      datasetId,
      ...(await serviceSideProps(context, ['dataset', 'file', 'user']))
    }
  };
}
