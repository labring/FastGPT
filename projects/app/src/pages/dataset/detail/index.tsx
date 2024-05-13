import React, { useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { Box } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useQuery } from '@tanstack/react-query';
import { getErrText } from '@fastgpt/global/common/error/utils';
import dynamic from 'next/dynamic';
import PageContainer from '@/components/PageContainer';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';

import CollectionCard from './components/CollectionCard';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';

import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import Head from 'next/head';
import Slider from './components/Slider';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { DatasetPageContextProvider } from '@/web/core/dataset/context/datasetPageContext';

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

const Detail = ({ datasetId, currentTab }: { datasetId: string; currentTab: TabEnum }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { datasetDetail, loadDatasetDetail } = useDatasetStore();

  const { ConfirmModal: ConfirmSyncModal, openConfirm: openConfirmSync } = useConfirm({
    type: 'common'
  });

  useQuery([datasetId], () => loadDatasetDetail(datasetId), {
    onError(err: any) {
      router.replace(`/dataset/list`);
      toast({
        title: t(getErrText(err, t('common.Load Failed'))),
        status: 'error'
      });
    }
  });

  return (
    <>
      <Head>
        <title>{datasetDetail?.name}</title>
      </Head>
      <DatasetPageContextProvider
        value={{
          datasetId
        }}
      >
        <PageContainer>
          <MyBox display={'flex'} flexDirection={['column', 'row']} h={'100%'} pt={[4, 0]}>
            <Slider currentTab={currentTab} />

            {!!datasetDetail._id && (
              <Box flex={'1 0 0'} pb={0}>
                {currentTab === TabEnum.collectionCard && <CollectionCard />}
                {currentTab === TabEnum.dataCard && <DataCard />}
                {currentTab === TabEnum.test && <Test datasetId={datasetId} />}
                {currentTab === TabEnum.info && <Info datasetId={datasetId} />}
                {currentTab === TabEnum.import && <Import />}
              </Box>
            )}
          </MyBox>
        </PageContainer>
      </DatasetPageContextProvider>

      <ConfirmSyncModal />
    </>
  );
};

export async function getServerSideProps(context: any) {
  const currentTab = context?.query?.currentTab || TabEnum.collectionCard;
  const datasetId = context?.query?.datasetId;

  return {
    props: { currentTab, datasetId, ...(await serviceSideProps(context, ['dataset', 'file'])) }
  };
}

export default React.memo(Detail);
