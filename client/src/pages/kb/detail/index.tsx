import React, { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, IconButton, useTheme } from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { DatasetItemType } from '@/types/core/dataset';
import { getErrText } from '@/utils/tools';
import { useGlobalStore } from '@/store/global';
import { type ComponentRef } from './components/Info';
import Tabs from '@/components/Tabs';
import dynamic from 'next/dynamic';
import MyIcon from '@/components/Icon';
import SideTabs from '@/components/SideTabs';
import PageContainer from '@/components/PageContainer';
import Avatar from '@/components/Avatar';
import Info from './components/Info';
import { serviceSideProps } from '@/utils/web/i18n';
import { useTranslation } from 'react-i18next';
import { getTrainingQueueLen } from '@/api/core/dataset/data';
import { delDatasetEmptyFiles } from '@/api/core/dataset/file';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { feConfigs } from '@/store/static';
import Script from 'next/script';
import FileCard from './components/FileCard';
import { useDatasetStore } from '@/store/dataset';

const DataCard = dynamic(() => import('./components/DataCard'), {
  ssr: false
});
const ImportData = dynamic(() => import('./components/Import'), {
  ssr: false
});
const Test = dynamic(() => import('./components/Test'), {
  ssr: false
});

enum TabEnum {
  dataCard = 'dataCard',
  dataset = 'dataset',
  import = 'import',
  test = 'test',
  info = 'info'
}

const Detail = ({ kbId, currentTab }: { kbId: string; currentTab: `${TabEnum}` }) => {
  const InfoRef = useRef<ComponentRef>(null);
  const theme = useTheme();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { isPc } = useGlobalStore();
  const { kbDetail, getKbDetail } = useDatasetStore();

  const tabList = useRef([
    { label: '数据集', id: TabEnum.dataset, icon: 'overviewLight' },
    { label: '导入数据', id: TabEnum.import, icon: 'importLight' },
    { label: '搜索测试', id: TabEnum.test, icon: 'kbTest' },
    { label: '配置', id: TabEnum.info, icon: 'settingLight' }
  ]);

  const setCurrentTab = useCallback(
    (tab: `${TabEnum}`) => {
      router.replace({
        query: {
          kbId,
          currentTab: tab
        }
      });
    },
    [kbId, router]
  );

  const form = useForm<DatasetItemType>({
    defaultValues: kbDetail
  });

  useQuery([kbId], () => getKbDetail(kbId), {
    onSuccess(res) {
      form.reset(res);
      InfoRef.current?.initInput(res.tags);
    },
    onError(err: any) {
      router.replace(`/kb/list`);
      toast({
        title: getErrText(err, '获取知识库异常'),
        status: 'error'
      });
    }
  });

  const { data: trainingQueueLen = 0 } = useQuery(['getTrainingQueueLen'], getTrainingQueueLen, {
    refetchInterval: 10000
  });

  useEffect(() => {
    return () => {
      try {
        delDatasetEmptyFiles(kbId);
      } catch (error) {}
    };
  }, [kbId]);

  return (
    <>
      <Script src="/js/pdf.js" strategy="lazyOnload"></Script>
      <PageContainer>
        <Box display={['block', 'flex']} h={'100%'} pt={[4, 0]}>
          {isPc ? (
            <Flex
              flexDirection={'column'}
              p={4}
              h={'100%'}
              flex={'0 0 200px'}
              borderRight={theme.borders.base}
            >
              <Flex mb={4} alignItems={'center'}>
                <Avatar src={kbDetail.avatar} w={'34px'} borderRadius={'lg'} />
                <Box ml={2} fontWeight={'bold'}>
                  {kbDetail.name}
                </Box>
              </Flex>
              <SideTabs
                flex={1}
                mx={'auto'}
                mt={2}
                w={'100%'}
                list={tabList.current}
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
                onClick={() => router.replace('/kb/list')}
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
                全部知识库
              </Flex>
            </Flex>
          ) : (
            <Box mb={3}>
              <Tabs
                m={'auto'}
                w={'260px'}
                size={isPc ? 'md' : 'sm'}
                list={tabList.current.map((item) => ({
                  id: item.id,
                  label: item.label
                }))}
                activeId={currentTab}
                onChange={(e: any) => setCurrentTab(e)}
              />
            </Box>
          )}

          {!!kbDetail._id && (
            <Box flex={'1 0 0'} h={'100%'} pb={[4, 0]}>
              {currentTab === TabEnum.dataset && <FileCard kbId={kbId} />}
              {currentTab === TabEnum.dataCard && <DataCard kbId={kbId} />}
              {currentTab === TabEnum.import && <ImportData kbId={kbId} />}
              {currentTab === TabEnum.test && <Test kbId={kbId} />}
              {currentTab === TabEnum.info && <Info ref={InfoRef} kbId={kbId} form={form} />}
            </Box>
          )}
        </Box>
      </PageContainer>
    </>
  );
};

export async function getServerSideProps(context: any) {
  const currentTab = context?.query?.currentTab || TabEnum.dataset;
  const kbId = context?.query?.kbId;

  return {
    props: { currentTab, kbId, ...(await serviceSideProps(context)) }
  };
}

export default React.memo(Detail);
