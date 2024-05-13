import React, { useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { useUserStore } from '@/web/support/user/useUserStore';
import { Box, Flex, IconButton, useTheme, Progress } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import Avatar from '@/components/Avatar';
import {
  DatasetStatusEnum,
  DatasetTypeEnum,
  DatasetTypeMap
} from '@fastgpt/global/core/dataset/constants';
import DatasetTypeTag from '@/components/core/dataset/DatasetTypeTag';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import SideTabs from '@/components/SideTabs';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import Tabs from '@/components/Tabs';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useI18n } from '@/web/context/I18n';

export enum TabEnum {
  dataCard = 'dataCard',
  collectionCard = 'collectionCard',
  test = 'test',
  info = 'info',
  import = 'import'
}

const Slider = ({ currentTab }: { currentTab: TabEnum }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { datasetT } = useI18n();
  const router = useRouter();
  const query = router.query;
  const { datasetDetail, startWebsiteSync } = useDatasetStore();
  const { userInfo } = useUserStore();
  const { isPc, setLoading } = useSystemStore();
  const vectorTrainingMap = useContextSelector(DatasetPageContext, (v) => v.vectorTrainingMap);
  const agentTrainingMap = useContextSelector(DatasetPageContext, (v) => v.agentTrainingMap);
  const rebuildingCount = useContextSelector(DatasetPageContext, (v) => v.rebuildingCount);

  const tabList = [
    {
      label: t('core.dataset.Collection'),
      id: TabEnum.collectionCard,
      icon: 'common/overviewLight'
    },
    { label: t('core.dataset.test.Search Test'), id: TabEnum.test, icon: 'kbTest' },
    ...(userInfo?.team.canWrite && datasetDetail.isOwner
      ? [{ label: t('common.Config'), id: TabEnum.info, icon: 'common/settingLight' }]
      : [])
  ];

  const setCurrentTab = useCallback(
    (tab: TabEnum) => {
      router.replace({
        query: {
          ...query,
          currentTab: tab
        }
      });
    },
    [query, router]
  );

  const { ConfirmModal: ConfirmSyncModal, openConfirm: openConfirmSync } = useConfirm({
    type: 'common'
  });
  const { mutate: onUpdateDatasetWebsiteConfig } = useRequest({
    mutationFn: () => {
      setLoading(true);
      return startWebsiteSync();
    },
    onSettled() {
      setLoading(false);
    },
    errorToast: t('common.Update Failed')
  });

  return (
    <>
      {isPc ? (
        <Flex
          flexDirection={'column'}
          py={4}
          h={'100%'}
          flex={'0 0 200px'}
          borderRight={theme.borders.base}
        >
          <Box px={4} borderBottom={'1px'} borderColor={'myGray.200'} pb={4} mb={4}>
            <Flex mb={4} alignItems={'center'}>
              <Avatar src={datasetDetail.avatar} w={'34px'} borderRadius={'md'} />
              <Box ml={2}>
                <Box fontWeight={'bold'}>{datasetDetail.name}</Box>
              </Box>
            </Flex>
            {DatasetTypeMap[datasetDetail.type] && (
              <Flex alignItems={'center'} pl={2} justifyContent={'space-between'}>
                <DatasetTypeTag type={datasetDetail.type} />
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
          </Box>
          <SideTabs
            px={4}
            flex={1}
            mx={'auto'}
            w={'100%'}
            list={tabList}
            activeId={currentTab}
            onChange={(e: any) => {
              setCurrentTab(e);
            }}
          />
          <Box px={4}>
            {rebuildingCount > 0 && (
              <Box mb={3}>
                <Box fontSize={'sm'}>
                  {datasetT('Rebuilding index count', { count: rebuildingCount })}
                </Box>
              </Box>
            )}
            <Box mb={3}>
              <Box fontSize={'sm'}>
                {t('core.dataset.training.Agent queue')}({agentTrainingMap.tip})
              </Box>
              <Progress
                value={100}
                size={'xs'}
                colorScheme={agentTrainingMap.colorSchema}
                borderRadius={'10px'}
                isAnimated
                hasStripe
              />
            </Box>
            <Box mb={3}>
              <Box fontSize={'sm'}>
                {t('core.dataset.training.Vector queue')}({vectorTrainingMap.tip})
              </Box>
              <Progress
                value={100}
                size={'xs'}
                colorScheme={vectorTrainingMap.colorSchema}
                borderRadius={'10px'}
                isAnimated
                hasStripe
              />
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
              icon={<MyIcon name={'common/backFill'} w={'18px'} color={'primary.500'} />}
              bg={'white'}
              boxShadow={'1px 1px 9px rgba(0,0,0,0.15)'}
              size={'smSquare'}
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

      <ConfirmSyncModal />
    </>
  );
};

export default Slider;
