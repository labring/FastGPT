import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { MyTabs } from '@fastgpt/web/components/common/MyTabs';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import FolderPath from '@/components/common/folder/Path';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { isDatabaseDataset } from '@/pageComponents/dataset/utils/index';
import {
  DatasetTypeEnum,
  DatasetCollectionTypeEnum,
  ApiDatasetTypeMap
} from '@fastgpt/global/core/dataset/constants';
import { getDatasetCollectionPathById, getDatasetCollectionById } from '@/web/core/dataset/api';
import { getCollectionSource } from '@/web/core/dataset/api/collection';
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
  const { toast } = useToast();
  const { datasetDetail, paths } = useContextSelector(DatasetPageContext, (v) => v);
  const { parentId = '', collectionId = '' } = router.query as {
    parentId: string;
    collectionId: string;
  };

  const { data: collectionPaths = [] } = useRequest(() => getDatasetCollectionPathById(parentId), {
    refreshDeps: [parentId],
    manual: false,
    ready: currentTab === TabEnum.collectionCard
  });

  const { data: dataCardCollectionPaths = [] } = useRequest(
    () => getDatasetCollectionPathById(collectionId),
    {
      refreshDeps: [collectionId],
      manual: false,
      ready: [TabEnum.dataCard, TabEnum.fileDataCard].includes(currentTab)
    }
  );

  const combinedCollectionPaths = useMemo(
    () => [{ parentId: datasetDetail._id, parentName: datasetDetail.name }, ...collectionPaths],
    [datasetDetail._id, datasetDetail.name, collectionPaths]
  );

  const dataCardPaths = useMemo(
    () => [
      { parentId: datasetDetail._id, parentName: datasetDetail.name },
      ...dataCardCollectionPaths
    ],
    [datasetDetail._id, datasetDetail.name, dataCardCollectionPaths]
  );

  const isDataCardTab = [TabEnum.dataCard, TabEnum.fileDataCard].includes(currentTab);

  const { data: collection } = useRequest(() => getDatasetCollectionById(collectionId), {
    refreshDeps: [collectionId],
    manual: false,
    ready: isDataCardTab
  });

  const isApiDataset = !!(datasetDetail?.type && ApiDatasetTypeMap[datasetDetail.type]);
  const isLink = collection?.type === DatasetCollectionTypeEnum.link;

  const sourceLabel = useMemo(() => {
    if (!collection) return '';
    if (isApiDataset) return t('dataset:view_original');
    if (isLink || collection.name?.toLowerCase().endsWith('.txt'))
      return t('dataset:view_original');
    if (collection.type === DatasetCollectionTypeEnum.images) return t('dataset:view_image');
    return t('dataset:download_file');
  }, [collection, isApiDataset, isLink, t]);

  const handleReadSource = useCallback(async () => {
    if (!collectionId) return;
    try {
      const { value } = await getCollectionSource({ collectionId });

      if (!value) {
        toast({
          title: t('common:error.fileNotFound'),
          status: 'error'
        });
        return;
      }

      if (isApiDataset) {
        const baseUrl = datasetDetail?.apiDatasetServer?.apiServer?.baseUrl || '';
        const fullUrl = `${baseUrl.replace(/\/+$/, '')}${value}`;
        window.open(fullUrl, '_blank');
        return;
      }

      if (value.startsWith('/')) {
        window.open(`${location.origin}${value}`, '_blank');
      } else {
        window.open(value, '_blank');
      }
    } catch (error) {
      toast({
        title: t('common:error.fileNotFound'),
        status: 'error'
      });
    }
  }, [collectionId, isApiDataset, datasetDetail?.apiDatasetServer?.apiServer?.baseUrl, t, toast]);

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

  const showNavTab = useMemo(() => !isDataCardTab, [isDataCardTab]);

  return (
    <>
      {isPc ? (
        <Grid
          h={showNavTab ? '16' : '12'}
          alignItems={'center'}
          flexShrink={0}
          templateColumns={'minmax(0, 1fr) auto minmax(0, 1fr)'}
        >
          {/* 左列：面包屑路径 */}
          <Flex alignItems={'center'} py={'0.38rem'} pr={4} h={10} minW={0} overflow={'hidden'}>
            {isDataCardTab ? (
              <FolderPath
                paths={dataCardPaths}
                rootName={t('common:core.dataset.Dataset')}
                showReturnIcon
                forbidLastClick
                onClick={(id) => {
                  if (!id) {
                    router.push('/dataset/list');
                  } else if (id === datasetDetail._id) {
                    router.replace({
                      query: { datasetId: query.datasetId, currentTab: TabEnum.collectionCard }
                    });
                  } else {
                    router.replace({
                      query: {
                        datasetId: query.datasetId,
                        parentId: id,
                        currentTab: TabEnum.collectionCard
                      }
                    });
                  }
                }}
              />
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

          {/* 右列：操作按钮 */}
          <Flex
            justifyContent={'flex-end'}
            alignItems={'center'}
            pl={4}
            pr={4}
            visibility={
              currentTab === TabEnum.collectionCard || (isDataCardTab && collection && sourceLabel)
                ? 'visible'
                : 'hidden'
            }
          >
            {currentTab === TabEnum.collectionCard ? (
              <CollectionNavActions />
            ) : isDataCardTab && collection && sourceLabel ? (
              <Button
                variant={'whiteBase'}
                size={'sm'}
                flexShrink={0}
                leftIcon={
                  <MyIcon name={isLink ? 'common/routePushLight' : 'common/download'} w={'14px'} />
                }
                onClick={handleReadSource}
              >
                {sourceLabel}
              </Button>
            ) : null}
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
