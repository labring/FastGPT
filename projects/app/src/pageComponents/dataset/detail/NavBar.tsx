import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex, Grid, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { MyTabs } from '@fastgpt/web/components/common/MyTabs';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import FolderPath from '@/components/common/folder/Path';
import { isDatabaseDataset } from '@/pageComponents/dataset/utils/index';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getDatasetCollectionPathById } from '@/web/core/dataset/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import dynamic from 'next/dynamic';
import { CollectionPageContext } from './CollectionCard/Context';

const CollectionNavActions = dynamic(
  () => import('@/pageComponents/dataset/detail/RefinedCollectionCard/CollectionNavActions')
);

export enum TabEnum {
  dataCard = 'dataCard',
  fileDataCard = 'fileDataCard',
  collectionCard = 'collectionCard',
  test = 'test',
  info = 'info',
  import = 'import',
  synonym = 'synonym'
}

const NavBar = ({ currentTab }: { currentTab: TabEnum }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const query = router.query;
  const { isPc } = useSystem();
  const { datasetDetail, paths } = useContextSelector(DatasetPageContext, (v) => v);
  const { parentId = '' } = router.query as { parentId: string };

  const { data: collectionPaths = [] } = useRequest(() => getDatasetCollectionPathById(parentId), {
    refreshDeps: [parentId],
    manual: false,
    ready: currentTab === TabEnum.collectionCard
  });

  const combinedCollectionPaths = useMemo(
    () => [{ parentId: datasetDetail._id, parentName: datasetDetail.name }, ...collectionPaths],
    [datasetDetail._id, datasetDetail.name, collectionPaths]
  );

  const total = useContextSelector(CollectionPageContext, (v) => v.total);

  const collectionTabLabel = useMemo(() => {
    if (datasetDetail.type === DatasetTypeEnum.websiteDataset) {
      return t('dataset:tab_collection_website', { count: total });
    }
    if (datasetDetail.type === DatasetTypeEnum.database) {
      return t('dataset:tab_collection_database', { count: total });
    }
    return t('dataset:tab_collection_file', { count: total });
  }, [datasetDetail.type, total, t]);

  const tabList = [
    {
      label: collectionTabLabel,
      value: TabEnum.collectionCard
    },
    // 同义词Tab - 仅对非数据库类型和结构化文档类型知识库显示
    ...(!isDatabaseDataset(datasetDetail.type)
      ? [{ label: t('dataset:synonym_tab_title'), value: TabEnum.synonym }]
      : []),
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

  const showNavTab = useMemo(
    () => ![TabEnum.dataCard, TabEnum.fileDataCard].includes(currentTab),
    [currentTab]
  );

  return (
    <>
      {isPc ? (
        <Grid
          h={'16'}
          alignItems={'center'}
          flexShrink={0}
          templateColumns={'minmax(0, 1fr) auto minmax(0, 1fr)'}
        >
          {/* 左列：面包屑路径 */}
          <Flex
            alignItems={'center'}
            py={'0.38rem'}
            pl={2}
            pr={4}
            h={10}
            ml={0.5}
            minW={0}
            overflow={'hidden'}
          >
            {currentTab === TabEnum.dataCard ? (
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
            ) : currentTab === TabEnum.collectionCard ? (
              <FolderPath
                paths={combinedCollectionPaths}
                rootName={t('common:core.dataset.Dataset')}
                showReturnIcon
                onClick={(id) => {
                  if (!id) {
                    router.push('/dataset/list');
                  } else if (id === datasetDetail._id) {
                    router.replace({
                      query: { datasetId: query.datasetId, currentTab: TabEnum.collectionCard }
                    });
                  } else {
                    router.replace({ query: { ...router.query, parentId: id } });
                  }
                }}
              />
            ) : (
              <FolderPath
                paths={paths}
                rootName={t('common:core.dataset.Dataset')}
                showReturnIcon
                onClick={(e) => {
                  router.push(`/dataset/list?parentId=${e}`);
                }}
              />
            )}
          </Flex>

          {/* 中列：TabList，内容宽度 auto */}
          <Flex justifyContent={'center'} alignItems={'center'}>
            {showNavTab && (
              <MyTabs
                tabs={tabList}
                value={currentTab}
                onChange={(val) => setCurrentTab(val as TabEnum)}
              />
            )}
          </Flex>

          {/* 右列：始终占位，不在 collectionCard tab 时隐藏 */}
          <Flex
            justifyContent={'flex-end'}
            alignItems={'center'}
            pl={4}
            pr={2}
            visibility={currentTab === TabEnum.collectionCard ? 'visible' : 'hidden'}
          >
            <CollectionNavActions />
          </Flex>
        </Grid>
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
