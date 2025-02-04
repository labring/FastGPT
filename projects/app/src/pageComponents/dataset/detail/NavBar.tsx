import React, { useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex, IconButton, useTheme, Progress } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useI18n } from '@/web/context/I18n';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import ParentPaths from '@/components/common/ParentPaths';

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
  const { datasetT } = useI18n();
  const router = useRouter();
  const query = router.query;
  const { isPc } = useSystem();
  const { datasetDetail, vectorTrainingMap, agentTrainingMap, rebuildingCount, paths } =
    useContextSelector(DatasetPageContext, (v) => v);

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
                      {datasetT('rebuilding_index_count', { count: rebuildingCount })}
                    </Box>
                  </Box>
                )}
                <Box mb={3}>
                  <Box fontSize={'sm'} pb={1}>
                    {t('common:core.dataset.training.Agent queue')}({agentTrainingMap.tip})
                  </Box>
                  <Progress
                    value={100}
                    size={'xs'}
                    colorScheme={agentTrainingMap.colorSchema}
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
