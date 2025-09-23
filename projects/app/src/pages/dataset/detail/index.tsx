'use client';
import React from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import dynamic from 'next/dynamic';
import PageContainer from '@/components/PageContainer';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import MetaDataCard from '@/pageComponents/dataset/detail/MetaDataCard';
import NavBar from '@/pageComponents/dataset/detail/NavBar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import {
  DatasetPageContext,
  DatasetPageContextProvider
} from '@/web/core/dataset/context/datasetPageContext';
import CollectionPageContextProvider from '@/pageComponents/dataset/detail/CollectionCard/Context';
import { useContextSelector } from 'use-context-selector';
import NextHead from '@/components/common/NextHead';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

const CollectionCard = dynamic(
  () => import('@/pageComponents/dataset/detail/CollectionCard/index')
);
const DataCard = dynamic(() => import('@/pageComponents/dataset/detail/DataCard'));
const Test = dynamic(() => import('@/pageComponents/dataset/detail/Test'));
const Info = dynamic(() => import('@/pageComponents/dataset/detail/Info/index'));
const Import = dynamic(() => import('@/pageComponents/dataset/detail/Import'));

export enum TabEnum {
  dataCard = 'dataCard',
  collectionCard = 'collectionCard',
  test = 'test',
  info = 'info',
  import = 'import'
}
type Props = { datasetId: string; currentTab: TabEnum };

const sliderStyles: FlexProps = {
  bg: 'white',
  borderRadius: 'md',
  overflowY: 'auto',
  boxShadow: 2
};

const Detail = ({ datasetId, currentTab }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { isPc } = useSystem();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const loadDatasetDetail = useContextSelector(DatasetPageContext, (v) => v.loadDatasetDetail);

  useRequest2(() => loadDatasetDetail(datasetId), {
    onError(err: any) {
      router.replace(`/dataset/list`);
      toast({
        title: t(getErrText(err, t('common:load_failed')) as any),
        status: 'error'
      });
    },
    manual: false
  });

  return (
    <>
      <NextHead title={datasetDetail?.name} icon={datasetDetail?.avatar} />

      {isPc ? (
        <Flex h={'100%'} py={3} pl={1} pr={3} gap={2}>
          <Flex flex={1} w={0} bg={'white'} flexDir={'column'} boxShadow={'2'} borderRadius={'md'}>
            {currentTab !== TabEnum.import && <NavBar currentTab={currentTab} />}
            <Box flex={'1'} overflowY={'auto'}>
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

          {/* Slider */}
          <>
            {currentTab === TabEnum.dataCard && (
              <Flex {...sliderStyles} flex={'0 0 20rem'}>
                <MetaDataCard datasetId={datasetId} />
              </Flex>
            )}
            {[TabEnum.collectionCard, TabEnum.test].includes(currentTab) && (
              <Flex {...sliderStyles} flex={'0 0 17rem'}>
                <Info datasetId={datasetId} />
              </Flex>
            )}
          </>
        </Flex>
      ) : (
        <PageContainer insertProps={{ bg: 'white' }}>
          <MyBox display={'flex'} flexDirection={'column'} h={'100%'} pt={1}>
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
