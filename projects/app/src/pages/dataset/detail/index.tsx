import React, { useCallback } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, IconButton, useTheme } from '@chakra-ui/react';
import { useToast } from '@/web/common/hooks/useToast';
import { useQuery } from '@tanstack/react-query';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import Tabs from '@/components/Tabs';
import dynamic from 'next/dynamic';
import MyIcon from '@/components/Icon';
import SideTabs from '@/components/SideTabs';
import PageContainer from '@/components/PageContainer';
import Avatar from '@/components/Avatar';
import Info from './components/Info';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';
import { getTrainingQueueLen } from '@/web/core/dataset/api';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { feConfigs } from '@/web/common/system/staticData';
import Script from 'next/script';
import CollectionCard from './components/CollectionCard';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  DatasetStatusEnum,
  DatasetTypeEnum,
  DatasetTypeMap
} from '@fastgpt/global/core/dataset/constant';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { useRequest } from '@/web/common/hooks/useRequest';

const DataCard = dynamic(() => import('./components/DataCard'), {
  ssr: false
});
const Test = dynamic(() => import('./components/Test'), {
  ssr: false
});

export enum TabEnum {
  dataCard = 'dataCard',
  collectionCard = 'collectionCard',
  test = 'test',
  info = 'info'
}

const Detail = ({ datasetId, currentTab }: { datasetId: string; currentTab: `${TabEnum}` }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { isPc } = useSystemStore();
  const { datasetDetail, loadDatasetDetail, startWebsiteSync } = useDatasetStore();
  const { userInfo } = useUserStore();

  const tabList = [
    { label: t('core.dataset.Dataset'), id: TabEnum.collectionCard, icon: 'overviewLight' },
    { label: t('core.dataset.test.Search Test'), id: TabEnum.test, icon: 'kbTest' },
    ...(userInfo?.team.canWrite && datasetDetail.isOwner
      ? [{ label: t('common.Config'), id: TabEnum.info, icon: 'settingLight' }]
      : [])
  ];

  const { ConfirmModal: ConfirmSyncModal, openConfirm: openConfirmSync } = useConfirm({
    type: 'common'
  });

  const { mutate: onUpdateDatasetWebsiteConfig, isLoading: isUpdating } = useRequest({
    mutationFn: () => startWebsiteSync(),
    errorToast: t('common.Update Failed')
  });

  const setCurrentTab = useCallback(
    (tab: `${TabEnum}`) => {
      router.replace({
        query: {
          datasetId,
          currentTab: tab
        }
      });
    },
    [datasetId, router]
  );

  useQuery([datasetId], () => loadDatasetDetail(datasetId), {
    onError(err: any) {
      router.replace(`/dataset/list`);
      toast({
        title: getErrText(err, t('common.Load Failed')),
        status: 'error'
      });
    }
  });

  const { data: trainingQueueLen = 0 } = useQuery(['getTrainingQueueLen'], getTrainingQueueLen, {
    refetchInterval: 10000
  });

  return (
    <>
      <Script src="/js/pdf.js" strategy="lazyOnload"></Script>
      <PageContainer>
        <Flex flexDirection={['column', 'row']} h={'100%'} pt={[4, 0]}>
          {isPc ? (
            <Flex
              flexDirection={'column'}
              p={4}
              h={'100%'}
              flex={'0 0 200px'}
              borderRight={theme.borders.base}
            >
              <Flex mb={4} alignItems={'center'}>
                <Avatar src={datasetDetail.avatar} w={'34px'} borderRadius={'lg'} />
                <Box ml={2}>
                  <Box fontWeight={'bold'}>{datasetDetail.name}</Box>
                </Box>
              </Flex>
              {DatasetTypeMap[datasetDetail.type] && (
                <Flex alignItems={'center'} pl={2}>
                  <MyIcon
                    name={DatasetTypeMap[datasetDetail.type]?.icon as any}
                    mr={1}
                    w={'16px'}
                  />
                  <Box flex={1}>{t(DatasetTypeMap[datasetDetail.type]?.label)}</Box>
                  {datasetDetail.type === DatasetTypeEnum.websiteDataset &&
                    datasetDetail.status === DatasetStatusEnum.active && (
                      <MyTooltip label={t('core.dataset.website.Start Sync')}>
                        <MyIcon
                          mt={1}
                          name={'common/refreshLight'}
                          w={'12px'}
                          color={'myGray.500'}
                          cursor={'pointer'}
                          onClick={() =>
                            openConfirmSync(
                              onUpdateDatasetWebsiteConfig,
                              undefined,
                              t('core.dataset.website.Confirm Create Tips')
                            )()
                          }
                        />
                      </MyTooltip>
                    )}
                </Flex>
              )}
              <SideTabs
                flex={1}
                mx={'auto'}
                mt={3}
                w={'100%'}
                list={tabList}
                activeId={currentTab}
                onChange={(e: any) => {
                  setCurrentTab(e);
                }}
              />
              <Box textAlign={'center'}>
                <Flex justifyContent={'center'} alignItems={'center'}>
                  <MyIcon mr={1} name="overviewLight" w={'16px'} color={'green.500'} />
                  <Box>{t('dataset.System Data Queue')}</Box>
                  <MyTooltip
                    label={t('dataset.Queue Desc', { title: feConfigs?.systemTitle })}
                    placement={'top'}
                  >
                    <QuestionOutlineIcon ml={1} w={'16px'} />
                  </MyTooltip>
                </Flex>
                <Box mt={1} fontWeight={'bold'}>
                  {trainingQueueLen}
                </Box>
              </Box>
              <Flex
                alignItems={'center'}
                cursor={'pointer'}
                py={2}
                px={3}
                borderRadius={'md'}
                _hover={{ bg: 'myGray.100' }}
                onClick={() => router.replace('/dataset/list')}
              >
                <IconButton
                  mr={3}
                  icon={<MyIcon name={'backFill'} w={'18px'} color={'myBlue.600'} />}
                  bg={'white'}
                  boxShadow={'1px 1px 9px rgba(0,0,0,0.15)'}
                  h={'28px'}
                  size={'sm'}
                  borderRadius={'50%'}
                  aria-label={''}
                />
                {t('core.dataset.All Dataset')}
              </Flex>
            </Flex>
          ) : (
            <Box mb={3}>
              <Tabs
                m={'auto'}
                w={'260px'}
                size={isPc ? 'md' : 'sm'}
                list={tabList.map((item) => ({
                  id: item.id,
                  label: item.label
                }))}
                activeId={currentTab}
                onChange={(e: any) => setCurrentTab(e)}
              />
            </Box>
          )}

          {!!datasetDetail._id && (
            <Box flex={'1 0 0'} pb={[4, 0]}>
              {currentTab === TabEnum.collectionCard && <CollectionCard />}
              {currentTab === TabEnum.dataCard && <DataCard />}
              {currentTab === TabEnum.test && <Test datasetId={datasetId} />}
              {currentTab === TabEnum.info && <Info datasetId={datasetId} />}
            </Box>
          )}
        </Flex>
      </PageContainer>
      <ConfirmSyncModal isLoading={isUpdating} />
    </>
  );
};

export async function getServerSideProps(context: any) {
  const currentTab = context?.query?.currentTab || TabEnum.collectionCard;
  const datasetId = context?.query?.datasetId;

  return {
    props: { currentTab, datasetId, ...(await serviceSideProps(context)) }
  };
}

export default React.memo(Detail);
