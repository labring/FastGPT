import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex, IconButton, useTheme, Progress } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import ParentPaths from '@/components/common/ParentPaths';
import { getTrainingQueueLen } from '@/web/core/dataset/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

export enum TabEnum {
  dataCard = 'dataCard',
  collectionCard = 'collectionCard',
  test = 'test',
  info = 'info',
  import = 'import'
}

const NavBar = ({ currentTab }: { currentTab: TabEnum }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const query = router.query;
  const { isPc } = useSystem();
  const { datasetDetail, rebuildingCount, paths } = useContextSelector(
    DatasetPageContext,
    (v) => v
  );

  // global queue
  const {
    data: {
      vectorTrainingCount = 0,
      qaTrainingCount = 0,
      autoTrainingCount = 0,
      imageTrainingCount = 0
    } = {}
  } = useRequest2(getTrainingQueueLen, {
    manual: false,
    retryInterval: 10000
  });
  const { vectorTrainingMap, qaTrainingMap, autoTrainingMap, imageTrainingMap } = useMemo(() => {
    const vectorTrainingMap = (() => {
      if (vectorTrainingCount < 1000)
        return {
          colorSchema: 'green',
          tip: t('common:core.dataset.training.Leisure')
        };
      if (vectorTrainingCount < 20000)
        return {
          colorSchema: 'yellow',
          tip: t('common:core.dataset.training.Waiting')
        };
      return {
        colorSchema: 'red',
        tip: t('common:core.dataset.training.Full')
      };
    })();

    const countLLMMap = (count: number) => {
      if (count < 100)
        return {
          colorSchema: 'green',
          tip: t('common:core.dataset.training.Leisure')
        };
      if (count < 1000)
        return {
          colorSchema: 'yellow',
          tip: t('common:core.dataset.training.Waiting')
        };
      return {
        colorSchema: 'red',
        tip: t('common:core.dataset.training.Full')
      };
    };
    const qaTrainingMap = countLLMMap(qaTrainingCount);
    const autoTrainingMap = countLLMMap(autoTrainingCount);
    const imageTrainingMap = countLLMMap(imageTrainingCount);

    return {
      vectorTrainingMap,
      qaTrainingMap,
      autoTrainingMap,
      imageTrainingMap
    };
  }, [qaTrainingCount, autoTrainingCount, imageTrainingCount, vectorTrainingCount, t]);

  const tabList = [
    {
      label: t('common:core.dataset.Collection'),
      value: TabEnum.collectionCard
    },
    { label: t('common:core.dataset.test.Search Test'), value: TabEnum.test },
    ...(datasetDetail.permission.hasManagePer && !isPc
      ? [{ label: t('common:common.Config'), value: TabEnum.info }]
      : [])
  ];

  const setCurrentTab = useCallback(
    (tab: TabEnum) => {
      router.replace({
        query: {
          datasetId: query.datasetId,
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
          pb={2}
          pt={3}
          px={4}
          justify={'space-between'}
          borderBottom={currentTab === TabEnum.dataCard ? 'none' : theme.borders.base}
          borderColor={'myGray.200'}
          position={'relative'}
        >
          {currentTab === TabEnum.dataCard ? (
            <>
              <Flex
                alignItems={'center'}
                cursor={'pointer'}
                py={'0.38rem'}
                px={2}
                ml={0}
                borderRadius={'md'}
                _hover={{ bg: 'myGray.05' }}
                fontSize={'sm'}
                fontWeight={500}
                onClick={() => {
                  router.replace({
                    query: {
                      datasetId: router.query.datasetId,
                      parentId: router.query.parentId,
                      currentTab: TabEnum.collectionCard
                    }
                  });
                }}
              >
                <IconButton
                  p={2}
                  mr={2}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  boxShadow={'1'}
                  icon={<MyIcon name={'common/arrowLeft'} w={'16px'} color={'myGray.500'} />}
                  bg={'white'}
                  size={'xsSquare'}
                  borderRadius={'50%'}
                  aria-label={''}
                  _hover={'none'}
                />
                <Box fontWeight={500} color={'myGray.600'} fontSize={'sm'}>
                  {datasetDetail.name}
                </Box>
              </Flex>
            </>
          ) : (
            <Flex py={'0.38rem'} px={2} h={10} ml={0.5}>
              <ParentPaths
                paths={paths}
                onClick={(e) => {
                  router.push(`/dataset/list?parentId=${e}`);
                }}
              />
            </Flex>
          )}

          <Box position={'absolute'} left={'50%'} transform={'translateX(-50%)'}>
            <LightRowTabs<TabEnum>
              px={4}
              py={1}
              visibility={currentTab === TabEnum.dataCard ? 'hidden' : 'visible'}
              flex={1}
              mx={'auto'}
              w={'100%'}
              list={tabList}
              value={currentTab}
              activeColor="primary.700"
              onChange={setCurrentTab}
              inlineStyles={{
                fontSize: '1rem',
                lineHeight: '1.5rem',
                fontWeight: 500,
                border: 'none',
                _hover: {
                  bg: 'myGray.05'
                },
                borderRadius: '6px'
              }}
            />
          </Box>

          {/* 训练情况hover弹窗 */}
          <MyPopover
            placement="bottom-end"
            visibility={currentTab === TabEnum.collectionCard ? 'visible' : 'hidden'}
            trigger="hover"
            Trigger={
              <Flex
                visibility={currentTab === TabEnum.collectionCard ? 'visible' : 'hidden'}
                alignItems={'center'}
                justifyContent={'center'}
                p={2}
                borderRadius={'md'}
                _hover={{
                  bg: 'myGray.05'
                }}
              >
                <MyIcon name={'common/monitor'} w={'18px'} h={'18px'} color={'myGray.500'} />
                <Box color={'myGray.600'} ml={1.5} fontWeight={500} userSelect={'none'}>
                  {t('common:core.dataset.training.tag')}
                </Box>
              </Flex>
            }
          >
            {({ onClose }) => (
              <Box p={6}>
                {rebuildingCount > 0 && (
                  <Box mb={3}>
                    <Box fontSize={'sm'}>
                      {t('dataset:rebuilding_index_count', { count: rebuildingCount })}
                    </Box>
                  </Box>
                )}
                <Box mb={3}>
                  <Box fontSize={'sm'} pb={1}>
                    {t('common:core.dataset.training.Agent queue')}({qaTrainingMap.tip})
                  </Box>
                  <Progress
                    value={100}
                    size={'xs'}
                    colorScheme={qaTrainingMap.colorSchema}
                    borderRadius={'md'}
                    isAnimated
                    hasStripe
                  />
                </Box>
                <Box mb={3}>
                  <Box fontSize={'sm'} pb={1}>
                    {t('dataset:auto_training_queue')}({autoTrainingMap.tip})
                  </Box>
                  <Progress
                    value={100}
                    size={'xs'}
                    colorScheme={autoTrainingMap.colorSchema}
                    borderRadius={'md'}
                    isAnimated
                    hasStripe
                  />
                </Box>
                <Box mb={3}>
                  <Box fontSize={'sm'} pb={1}>
                    {t('dataset:image_training_queue')}({imageTrainingMap.tip})
                  </Box>
                  <Progress
                    value={100}
                    size={'xs'}
                    colorScheme={imageTrainingMap.colorSchema}
                    borderRadius={'md'}
                    isAnimated
                    hasStripe
                  />
                </Box>
                <Box>
                  <Box fontSize={'sm'} pb={1}>
                    {t('common:core.dataset.training.Vector queue')}({vectorTrainingMap.tip})
                  </Box>
                  <Progress
                    value={100}
                    size={'xs'}
                    colorScheme={vectorTrainingMap.colorSchema}
                    borderRadius={'md'}
                    isAnimated
                    hasStripe
                  />
                </Box>
              </Box>
            )}
          </MyPopover>
        </Flex>
      ) : (
        <Box mb={2}>
          <LightRowTabs<TabEnum>
            m={'auto'}
            w={'full'}
            size={'sm'}
            list={tabList}
            value={currentTab}
            onChange={setCurrentTab}
          />
        </Box>
      )}
    </>
  );
};

export default NavBar;
