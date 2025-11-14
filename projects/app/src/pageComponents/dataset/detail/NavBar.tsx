import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex, IconButton, useTheme, Progress } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import FolderPath from '@/components/common/folder/Path';

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

  const tabList = [
    {
      label: t('common:core.dataset.Collection'),
      value: TabEnum.collectionCard
    },
    { label: t('common:core.dataset.test.Search Test'), value: TabEnum.test },
    ...(datasetDetail.permission.hasManagePer && !isPc
      ? [{ label: t('common:Config'), value: TabEnum.info }]
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
                  router.back();
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
              <FolderPath
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
