import React, { useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex, IconButton, useTheme, Progress } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import Avatar from '@/components/Avatar';
import { DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import DatasetTypeTag from '@/components/core/dataset/DatasetTypeTag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import SideTabs from '@/components/SideTabs';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
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
  const { isPc } = useSystemStore();
  const { datasetDetail, vectorTrainingMap, agentTrainingMap, rebuildingCount } =
    useContextSelector(DatasetPageContext, (v) => v);

  const tabList = [
    {
      label: t('core.dataset.Collection'),
      value: TabEnum.collectionCard,
      icon: 'common/overviewLight'
    },
    { label: t('core.dataset.test.Search Test'), value: TabEnum.test, icon: 'kbTest' },
    ...(datasetDetail.permission.hasManagePer
      ? [{ label: t('common.Config'), value: TabEnum.info, icon: 'common/settingLight' }]
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
              </Flex>
            )}
          </Box>
          <SideTabs<TabEnum>
            px={4}
            flex={1}
            mx={'auto'}
            w={'100%'}
            list={tabList}
            value={currentTab}
            onChange={setCurrentTab}
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
            fontSize={'sm'}
            onClick={() => router.replace('/dataset/list')}
          >
            <IconButton
              mr={3}
              icon={<MyIcon name={'common/backFill'} w={'1rem'} color={'primary.500'} />}
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
          <LightRowTabs<TabEnum>
            m={'auto'}
            w={'260px'}
            size={isPc ? 'md' : 'sm'}
            list={tabList}
            value={currentTab}
            onChange={setCurrentTab}
          />
        </Box>
      )}
    </>
  );
};

export default Slider;
