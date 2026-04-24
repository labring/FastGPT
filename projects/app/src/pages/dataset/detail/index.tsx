'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import dynamic from 'next/dynamic';
import PageContainer from '@/components/PageContainer';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import NavBar from '@/pageComponents/dataset/detail/NavBar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import {
  DatasetPageContext,
  DatasetPageContextProvider
} from '@/web/core/dataset/context/datasetPageContext';
import CollectionPageContextProvider from '@/pageComponents/dataset/detail/CollectionCard/Context';
import { useContextSelector } from 'use-context-selector';
import NextHead from '@/components/common/NextHead';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { DashboardNavbar, SIDEBAR_COLLAPSED_WIDTH } from '@/pageComponents/dashboard/Container';
import BgDecoration from '@/pageComponents/dashboard/BgDecoration';

const CollectionCard = dynamic(
  () => import('@/pageComponents/dataset/detail/RefinedCollectionCard/index')
);
const DataCard = dynamic(() => import('@/pageComponents/dataset/detail/RefinedDataCard/index'));
const FileDataCard = dynamic(() => import('@/pageComponents/dataset/detail/FileDataCard'));
const Test = dynamic(() => import('@/pageComponents/dataset/detail/Test'));
const Import = dynamic(() => import('@/pageComponents/dataset/detail/Import'));
const Synonym = dynamic(() => import('@/pageComponents/dataset/detail/Synonym'));
const Info = dynamic(() => import('@/pageComponents/dataset/detail/Info/index'));

export enum TabEnum {
  dataCard = 'dataCard',
  fileDataCard = 'fileDataCard',
  collectionCard = 'collectionCard',
  test = 'test',
  info = 'info',
  import = 'import',
  synonym = 'synonym'
}
type Props = { datasetId: string; currentTab: TabEnum };

const Detail = ({ datasetId, currentTab }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { isPc } = useSystem();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const loadDatasetDetail = useContextSelector(DatasetPageContext, (v) => v.loadDatasetDetail);

  useRequest(() => loadDatasetDetail(datasetId), {
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
        (() => {
          const showNavBar = ![TabEnum.import, TabEnum.dataCard, TabEnum.fileDataCard].includes(
            currentTab
          );
          const layout = (
            <Flex h={'100%'} pb={3} pl={4} pr={3} flexDir={'column'}>
              {showNavBar && <NavBar currentTab={currentTab} />}
              <Flex
                flex={1}
                bg={'white'}
                flexDir={'column'}
                boxShadow={'2'}
                borderRadius={'md'}
                overflow={'hidden'}
              >
                <Box flex={'1'} overflowY={'auto'}>
                  {currentTab === TabEnum.collectionCard && <CollectionCard />}
                  {currentTab === TabEnum.test && <Test datasetId={datasetId} />}
                  {currentTab === TabEnum.dataCard && <DataCard />}
                  {currentTab === TabEnum.fileDataCard && <FileDataCard />}
                  {currentTab === TabEnum.import && <Import />}
                  {currentTab === TabEnum.synonym && <Synonym />}
                </Box>
              </Flex>
            </Flex>
          );

          return currentTab === TabEnum.collectionCard ? (
            <CollectionPageContextProvider>{layout}</CollectionPageContextProvider>
          ) : (
            layout
          );
        })()
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
                {currentTab === TabEnum.synonym && <Synonym />}
                {currentTab === TabEnum.dataCard && <DataCard />}
                {currentTab === TabEnum.fileDataCard && <FileDataCard />}
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

const Render = (data: Props) => {
  const { isPc } = useSystem();
  const [isCollapsed] = useState(true);

  return (
    <>
      {isPc && (
        <DashboardNavbar isCollapsed={isCollapsed} setIsCollapsed={() => {}} hideCollapseButton />
      )}
      <Box
        h={'100%'}
        pl={isPc ? SIDEBAR_COLLAPSED_WIDTH : 0}
        position={'relative'}
        bgGradient="linear(180deg, #F2F8FF 0%, #F7F9FC 12%)"
        transition="padding-left 0.2s ease"
      >
        {/* <BgDecoration /> */}
        <DatasetPageContextProvider datasetId={data.datasetId}>
          <Detail {...data} />
        </DatasetPageContextProvider>
      </Box>
    </>
  );
};
export default Render;

export async function getServerSideProps(context: any) {
  const currentTab = context?.query?.currentTab || TabEnum.collectionCard;
  const datasetId = context?.query?.datasetId;

  return {
    props: {
      currentTab,
      datasetId,
      ...(await serviceSideProps(context, ['dataset', 'file', 'user', 'database_client', 'chat']))
    }
  };
}
