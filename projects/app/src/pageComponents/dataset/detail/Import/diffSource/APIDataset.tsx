import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Loading from '@fastgpt/web/components/common/MyLoading';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  HStack,
  IconButton,
  Spinner,
  VStack
} from '@chakra-ui/react';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  getApiDatasetFileList,
  getApiDatasetSyncState
} from '@/web/core/dataset/api/apiDataset';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { type APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import {
  DatasetCollectionTypeEnum,
  DatasetTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useMount } from 'ahooks';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'), {
  loading: () => <Loading fixed={false} />
});
const Upload = dynamic(() => import('../commonProgress/Upload'));
const PreviewData = dynamic(() => import('../commonProgress/PreviewData'));

const ROOT_NODE_KEY = '__ROOT__';

type SelectedApiFileEntry = {
  item: APIFileItemType;
  ancestorIds: string[];
  ancestorPathLabel: string;
  isReEnableSync: boolean;
};

const APIDatasetCollection = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);

  return (
    <>
      {activeStep === 0 && <CustomAPIFileInput />}
      {activeStep === 1 && <DataProcess />}
      {activeStep === 2 && <PreviewData />}
      {activeStep === 3 && <Upload />}
    </>
  );
};

export default React.memo(APIDatasetCollection);

const CustomAPIFileInput = () => {
  const { t } = useTranslation();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const goToNext = useContextSelector(DatasetImportContext, (v) => v.goToNext);
  const currentLocalParentId = useContextSelector(DatasetImportContext, (v) => v.parentId);
  const sources = useContextSelector(DatasetImportContext, (v) => v.sources);
  const setSources = useContextSelector(DatasetImportContext, (v) => v.setSources);
  const apiDatasetSyncAll = useContextSelector(DatasetImportContext, (v) => v.apiDatasetSyncAll);
  const setApiDatasetSyncAll = useContextSelector(
    DatasetImportContext,
    (v) => v.setApiDatasetSyncAll
  );

  const [selectedMap, setSelectedMap] = useState<Map<string, SelectedApiFileEntry>>(
    () => new Map()
  );
  const [isSelectAll, setIsSelectAll] = useState(false);
  const [searchKey, setSearchKey] = useState('');

  // 树节点懒加载状态：key 为远端节点 id（根级为 ROOT_NODE_KEY）
  const [childrenMap, setChildrenMap] = useState<Record<string, APIFileItemType[]>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [loadingNodeIds, setLoadingNodeIds] = useState<Set<string>>(() => new Set());
  const loadedKeysRef = useRef<Set<string>>(new Set());
  const autoExpandedRef = useRef(false);

  const { data: syncState, loading: loadingSyncState } = useRequest(
    async () => getApiDatasetSyncState({ datasetId: datasetDetail._id }),
    {
      refreshDeps: [datasetDetail._id],
      manual: false
    }
  );

  const { loading: loadingRoot } = useRequest(
    async () => {
      const list = await getApiDatasetFileList({
        datasetId: datasetDetail._id,
        parentId: ''
      });
      loadedKeysRef.current.add(ROOT_NODE_KEY);
      setChildrenMap((prev) => ({ ...prev, [ROOT_NODE_KEY]: list }));
      return list;
    },
    {
      refreshDeps: [datasetDetail._id, datasetDetail.apiDatasetServer],
      manual: false
    }
  );

  const trimmedSearchKey = searchKey.trim();
  const { data: searchResultList = [], loading: loadingSearch } = useRequest(
    async () => {
      if (!trimmedSearchKey) return [];
      return getApiDatasetFileList({
        datasetId: datasetDetail._id,
        parentId: '',
        searchKey: trimmedSearchKey
      });
    },
    {
      refreshDeps: [datasetDetail._id, trimmedSearchKey],
      throttleWait: 400,
      manual: false
    }
  );

  // 构建本地同步状态索引：区分正文文件、同步中目录、暂停同步目录（syncChildren === false）
  const {
    serverSyncAll,
    existingFileBySourceId,
    existingFolderBySourceId,
    collectionById,
    hasAnyExisting
  } = useMemo(() => {
    const fileMap = new Map<string, NonNullable<typeof syncState>['collections'][number]>();
    const folderMap = new Map<string, NonNullable<typeof syncState>['collections'][number]>();
    const colById = new Map<string, NonNullable<typeof syncState>['collections'][number]>();

    for (const col of syncState?.collections ?? []) {
      colById.set(col.collectionId, col);
      if (col.type === DatasetCollectionTypeEnum.folder) {
        folderMap.set(col.sourceId, col);
      } else {
        fileMap.set(col.sourceId, col);
      }
    }

    return {
      serverSyncAll: Boolean(syncState?.syncAll),
      existingFileBySourceId: fileMap,
      existingFolderBySourceId: folderMap,
      collectionById: colById,
      hasAnyExisting: (syncState?.collections.length ?? 0) > 0
    };
  }, [syncState]);

  /** 懒加载并缓存指定远端父节点的直接子列表。 */
  const loadNodeChildren = useCallback(
    async (nodeId: string) => {
      if (loadedKeysRef.current.has(nodeId)) return;
      setLoadingNodeIds((prev) => {
        const next = new Set(prev);
        next.add(nodeId);
        return next;
      });
      try {
        const list = await getApiDatasetFileList({
          datasetId: datasetDetail._id,
          parentId: nodeId
        });
        loadedKeysRef.current.add(nodeId);
        setChildrenMap((prev) => ({ ...prev, [nodeId]: list }));
      } finally {
        setLoadingNodeIds((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      }
    },
    [datasetDetail._id]
  );

  // 若从列表页某个子目录点“添加文件”进入，自动展开对应的远端祖先目录链
  useEffect(() => {
    if (autoExpandedRef.current || !currentLocalParentId || collectionById.size === 0) return;
    const ancestorSourceIds: string[] = [];
    const seen = new Set<string>();
    let currId: string | null = currentLocalParentId;
    while (currId && !seen.has(currId)) {
      seen.add(currId);
      const col = collectionById.get(currId);
      if (!col) break;
      ancestorSourceIds.unshift(col.sourceId);
      currId = col.parentId;
    }
    if (ancestorSourceIds.length === 0) return;
    autoExpandedRef.current = true;

    (async () => {
      for (const sourceId of ancestorSourceIds) {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.add(sourceId);
          return next;
        });
        await loadNodeChildren(sourceId);
      }
    })();
  }, [currentLocalParentId, collectionById, loadNodeChildren]);

  // 返回上一步时恢复选中状态
  useMount(() => {
    if (apiDatasetSyncAll) {
      setIsSelectAll(true);
      setSelectedMap(new Map());
      return;
    }
    const nextMap = new Map<string, SelectedApiFileEntry>();
    for (const source of sources) {
      if (!source.apiFile) continue;
      nextMap.set(source.apiFile.id, {
        item: source.apiFile,
        ancestorIds: source.ancestorIds ?? [],
        ancestorPathLabel: source.ancestorPathLabel ?? '',
        isReEnableSync: Boolean(source.isReEnableSync)
      });
    }
    setSelectedMap(nextMap);
  });

  // 记录已选中项覆盖到的所有祖先 ID，用于在树中展示半选（indeterminate）状态
  const selectedAncestorSet = useMemo(() => {
    const set = new Set<string>();
    for (const entry of selectedMap.values()) {
      for (const ancId of entry.ancestorIds) {
        set.add(ancId);
      }
    }
    return set;
  }, [selectedMap]);

  const handleToggleExpand = useCallback(
    async (nodeId: string) => {
      const willExpand = !expandedIds.has(nodeId);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (willExpand) {
          next.add(nodeId);
        } else {
          next.delete(nodeId);
        }
        return next;
      });
      if (willExpand) {
        await loadNodeChildren(nodeId);
      }
    },
    [expandedIds, loadNodeChildren]
  );

  const handleToggleNode = useCallback(
    ({
      item,
      ancestorIds,
      ancestorNames,
      isReEnableSync
    }: {
      item: APIFileItemType;
      ancestorIds: string[];
      ancestorNames: string[];
      isReEnableSync: boolean;
    }) => {
      setSelectedMap((prev) => {
        const next = new Map(prev);
        if (next.has(item.id)) {
          next.delete(item.id);
          return next;
        }
        // 选中目录时移除其已被单独选中的子孙项，避免重复提交
        for (const [id, entry] of next.entries()) {
          if (entry.ancestorIds.includes(item.id)) {
            next.delete(id);
          }
        }
        next.set(item.id, {
          item,
          ancestorIds,
          ancestorPathLabel: ancestorNames.length > 0 ? `/${ancestorNames.join('/')}` : '/',
          isReEnableSync
        });
        return next;
      });
    },
    []
  );

  const handleToggleSelectAll = useCallback(() => {
    if (serverSyncAll || !datasetDetail.permission.hasManagePer) return;
    setIsSelectAll((prev) => {
      const next = !prev;
      if (next) {
        setSelectedMap(new Map());
      }
      return next;
    });
  }, [serverSyncAll, datasetDetail.permission.hasManagePer]);

  const { newEntries, reEnableEntries } = useMemo(() => {
    const newList: SelectedApiFileEntry[] = [];
    const reEnableList: SelectedApiFileEntry[] = [];
    for (const entry of selectedMap.values()) {
      if (entry.isReEnableSync) {
        reEnableList.push(entry);
      } else {
        newList.push(entry);
      }
    }
    return { newEntries: newList, reEnableEntries: reEnableList };
  }, [selectedMap]);

  const totalPendingCount = isSelectAll ? 1 : selectedMap.size;

  const { runAsync: onclickNext, loading: onNextLoading } = useRequest(async () => {
    if (isSelectAll) {
      setApiDatasetSyncAll(true);
      setSources([
        {
          id: '__sync_all__',
          createStatus: 'waiting',
          sourceName: t('dataset:api_dataset_sync_all_summary'),
          icon: 'common/folderFill',
          isSyncAllSummary: true
        }
      ]);
      goToNext();
      return;
    }

    setApiDatasetSyncAll(false);
    setSources(
      [...selectedMap.values()].map(({ item, ancestorIds, ancestorPathLabel, isReEnableSync }) => ({
        id: item.id,
        apiFileId: item.id,
        apiFile: item,
        ancestorIds,
        ancestorPathLabel,
        isReEnableSync,
        createStatus: 'waiting',
        sourceName: item.name,
        icon:
          item.type === 'folder'
            ? 'common/folderFill'
            : (getSourceNameIcon({ sourceName: item.name }) as any)
      }))
    );
    goToNext();
  });

  /** 渲染单个树节点及其已展开的子树；允许展开所有 hasChild 节点（含已同步/暂停目录）。 */
  const renderTreeNode = (
    item: APIFileItemType,
    depth: number,
    ancestorIds: string[],
    ancestorNames: string[],
    coveredBySelectedAncestor: boolean
  ) => {
    const localFolder = existingFolderBySourceId.get(item.id);
    const localFile = existingFileBySourceId.get(item.id);
    const isPausedFolder = Boolean(localFolder && localFolder.syncChildren === false);
    const isSyncedFolder = Boolean(localFolder && localFolder.syncChildren !== false);
    const isSyncedFileOnly = Boolean(localFile && !localFolder);
    const isSelectedSelf = selectedMap.has(item.id);
    const hasSelectedDescendant = selectedAncestorSet.has(item.id);

    const isCovered = isSelectAll || coveredBySelectedAncestor;
    const isAlreadySynced = isSyncedFolder || isSyncedFileOnly;
    const isDisabled = isCovered || isAlreadySynced;
    const isChecked = isCovered || isAlreadySynced || isSelectedSelf;
    const isIndeterminate = !isChecked && (isPausedFolder || hasSelectedDescendant);

    const isExpanded = expandedIds.has(item.id);
    const isNodeLoading = loadingNodeIds.has(item.id);
    const children = childrenMap[item.id];
    const nextAncestorIds = [...ancestorIds, item.id];
    const nextAncestorNames = [...ancestorNames, item.name];

    return (
      <React.Fragment key={item.id}>
        <Flex
          alignItems={'center'}
          py={2}
          pr={3}
          pl={`${depth * 20 + 12}px`}
          borderRadius={'sm'}
          _hover={{ bg: 'primary.50' }}
          cursor={'pointer'}
          onClick={() => {
            if (item.hasChild) {
              handleToggleExpand(item.id);
            } else if (!isDisabled) {
              handleToggleNode({
                item,
                ancestorIds,
                ancestorNames,
                isReEnableSync: isPausedFolder
              });
            }
          }}
        >
          <Box
            w={'20px'}
            h={'20px'}
            display={'flex'}
            alignItems={'center'}
            justifyContent={'center'}
            mr={1}
            flexShrink={0}
            onClick={(e) => {
              if (!item.hasChild) return;
              e.stopPropagation();
              handleToggleExpand(item.id);
            }}
          >
            {item.hasChild ? (
              isNodeLoading ? (
                <Spinner size={'xs'} color={'primary.500'} />
              ) : (
                <MyIcon
                  name={'core/chat/chevronRight'}
                  w={'14px'}
                  color={'myGray.500'}
                  transform={isExpanded ? 'rotate(90deg)' : undefined}
                  transition={'transform 0.15s ease'}
                />
              )
            ) : null}
          </Box>

          <Checkbox
            mr={2.5}
            isChecked={isChecked}
            isIndeterminate={isIndeterminate}
            isDisabled={isDisabled}
            onClick={(e) => e.stopPropagation()}
            onChange={() => {
              if (isDisabled) return;
              handleToggleNode({
                item,
                ancestorIds,
                ancestorNames,
                isReEnableSync: isPausedFolder
              });
            }}
          />

          <MyIcon
            name={
              item.type === 'folder'
                ? 'common/folderFill'
                : (getSourceNameIcon({ sourceName: item.name }) as any)
            }
            w={'18px'}
            mr={1.5}
            flexShrink={0}
          />
          <Box
            flex={'1 1 0'}
            minW={0}
            fontSize={'sm'}
            fontWeight={'medium'}
            color={'myGray.900'}
            className={'textEllipsis'}
          >
            {item.name}
          </Box>
          {isPausedFolder && !isSelectedSelf && !isCovered && (
            <MyTag ml={2} colorSchema={'gray'} type={'fill'} fontSize={'mini'} flexShrink={0}>
              {t('dataset:sync_children_paused_tag')}
            </MyTag>
          )}
          {isPausedFolder && isSelectedSelf && (
            <MyTag ml={2} colorSchema={'blue'} type={'fill'} fontSize={'mini'} flexShrink={0}>
              {t('dataset:api_dataset_re_enable_sync_tag')}
            </MyTag>
          )}
          {isAlreadySynced && !isPausedFolder && (
            <MyTag ml={2} colorSchema={'green'} type={'fill'} fontSize={'mini'} flexShrink={0}>
              {t('dataset:api_dataset_synced_tag')}
            </MyTag>
          )}
        </Flex>

        {item.hasChild && isExpanded && (
          <Box>
            {children && children.length > 0
              ? children.map((child) =>
                  renderTreeNode(
                    child,
                    depth + 1,
                    nextAncestorIds,
                    nextAncestorNames,
                    isCovered || isSelectedSelf
                  )
                )
              : !isNodeLoading && (
                  <Box
                    pl={`${(depth + 1) * 20 + 36}px`}
                    py={1.5}
                    fontSize={'xs'}
                    color={'myGray.400'}
                  >
                    {t('common:Empty')}
                  </Box>
                )}
          </Box>
        )}
      </React.Fragment>
    );
  };

  const rootItems = childrenMap[ROOT_NODE_KEY] ?? [];
  const rootCheckboxChecked = serverSyncAll || isSelectAll;
  const rootCheckboxIndeterminate =
    !rootCheckboxChecked && (hasAnyExisting || selectedMap.size > 0);
  const rootCheckboxDisabled = serverSyncAll || !datasetDetail.permission.hasManagePer;

  return (
    <MyBox
      isLoading={loadingRoot || loadingSyncState}
      h={'100%'}
      display={'flex'}
      flexDirection={'column'}
    >
      <Flex
        flex={'1 0 0'}
        minH={0}
        border={'base'}
        borderRadius={'md'}
        overflow={'hidden'}
        direction={['column', 'row']}
      >
        {/* 左栏：远端目录树 */}
        <Flex
          flex={'1 1 58%'}
          minW={0}
          minH={0}
          flexDirection={'column'}
          borderRight={['none', 'base']}
          borderBottom={['base', 'none']}
        >
          <Flex
            px={4}
            py={3}
            borderBottom={'base'}
            alignItems={'center'}
            justifyContent={'space-between'}
            gap={3}
          >
            <MyTooltip
              label={
                !datasetDetail.permission.hasManagePer
                  ? t('dataset:api_dataset_sync_all_manage_tip')
                  : t('dataset:sync_root_new_items_tip')
              }
            >
              <Box>
                <Checkbox
                  isChecked={rootCheckboxChecked}
                  isIndeterminate={rootCheckboxIndeterminate}
                  isDisabled={rootCheckboxDisabled}
                  onChange={handleToggleSelectAll}
                >
                  <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
                    {t('dataset:api_dataset_select_all_root')}
                  </Box>
                </Checkbox>
              </Box>
            </MyTooltip>

            {datasetDetail.type === DatasetTypeEnum.apiDataset && (
              <Box w={'200px'}>
                <SearchInput
                  size={'sm'}
                  value={searchKey}
                  onChange={(e) => setSearchKey(e.target.value)}
                  placeholder={t('common:Search')}
                />
              </Box>
            )}
          </Flex>

          <Box flex={'1 0 0'} minH={0} overflowY={'auto'} py={2}>
            {trimmedSearchKey ? (
              loadingSearch ? (
                <Flex justifyContent={'center'} py={8}>
                  <Spinner size={'sm'} color={'primary.500'} />
                </Flex>
              ) : searchResultList.length > 0 ? (
                searchResultList.map((item) => renderTreeNode(item, 0, [], [], false))
              ) : (
                <EmptyTip text={t('common:Empty')} />
              )
            ) : rootItems.length > 0 ? (
              rootItems.map((item) => renderTreeNode(item, 0, [], [], false))
            ) : (
              !loadingRoot && <EmptyTip text={t('common:Empty')} />
            )}
          </Box>
        </Flex>

        {/* 右栏：本次待导入与恢复同步摘要 */}
        <Flex flex={'1 1 42%'} minW={0} minH={0} flexDirection={'column'} bg={'myGray.25'}>
          <Flex
            px={4}
            py={3}
            borderBottom={'base'}
            alignItems={'center'}
            justifyContent={'space-between'}
          >
            <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
              {t('dataset:api_dataset_pending_changes')} ({totalPendingCount})
            </Box>
            {totalPendingCount > 0 && (
              <Button
                size={'xs'}
                variant={'whiteBase'}
                onClick={() => {
                  setIsSelectAll(false);
                  setSelectedMap(new Map());
                }}
              >
                {t('common:Clear')}
              </Button>
            )}
          </Flex>

          <Box flex={'1 0 0'} minH={0} overflowY={'auto'} p={4}>
            {totalPendingCount === 0 ? (
              <EmptyTip text={t('dataset:api_dataset_no_pending_selection')} />
            ) : (
              <VStack align={'stretch'} spacing={4}>
                {isSelectAll && (
                  <Box
                    p={3}
                    bg={'white'}
                    border={'base'}
                    borderRadius={'md'}
                    borderColor={'primary.300'}
                  >
                    <Flex alignItems={'center'} justifyContent={'space-between'}>
                      <HStack spacing={2} minW={0}>
                        <MyIcon name={'common/folderFill'} w={'18px'} flexShrink={0} />
                        <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
                          {t('dataset:api_dataset_sync_all_summary')}
                        </Box>
                      </HStack>
                      <IconButton
                        size={'xs'}
                        variant={'grayDanger'}
                        aria-label={'Remove'}
                        icon={<MyIcon name={'delete'} w={'14px'} />}
                        onClick={() => setIsSelectAll(false)}
                      />
                    </Flex>
                    <Box mt={1.5} fontSize={'xs'} color={'myGray.500'}>
                      {t('dataset:api_dataset_sync_all_summary_desc')}
                    </Box>
                  </Box>
                )}

                {reEnableEntries.length > 0 && (
                  <Box>
                    <Box fontSize={'xs'} fontWeight={'medium'} color={'myGray.600'} mb={2}>
                      {t('dataset:api_dataset_re_enable_sync_group')} ({reEnableEntries.length})
                    </Box>
                    <VStack align={'stretch'} spacing={2}>
                      {reEnableEntries.map((entry) => (
                        <Flex
                          key={entry.item.id}
                          p={2.5}
                          bg={'white'}
                          border={'base'}
                          borderRadius={'md'}
                          alignItems={'center'}
                          justifyContent={'space-between'}
                          gap={2}
                        >
                          <HStack spacing={2} minW={0} flex={1}>
                            <MyIcon name={'common/folderFill'} w={'16px'} flexShrink={0} />
                            <Box minW={0} flex={1}>
                              <Box
                                fontSize={'sm'}
                                fontWeight={'medium'}
                                color={'myGray.900'}
                                className={'textEllipsis'}
                              >
                                {entry.item.name}
                              </Box>
                              <Box
                                fontSize={'mini'}
                                color={'myGray.500'}
                                className={'textEllipsis'}
                              >
                                {entry.ancestorPathLabel}
                              </Box>
                            </Box>
                          </HStack>
                          <IconButton
                            size={'xs'}
                            variant={'grayDanger'}
                            aria-label={'Remove'}
                            icon={<MyIcon name={'delete'} w={'14px'} />}
                            onClick={() =>
                              setSelectedMap((prev) => {
                                const next = new Map(prev);
                                next.delete(entry.item.id);
                                return next;
                              })
                            }
                          />
                        </Flex>
                      ))}
                    </VStack>
                  </Box>
                )}

                {newEntries.length > 0 && (
                  <Box>
                    <Box fontSize={'xs'} fontWeight={'medium'} color={'myGray.600'} mb={2}>
                      {t('dataset:api_dataset_new_import_group')} ({newEntries.length})
                    </Box>
                    <VStack align={'stretch'} spacing={2}>
                      {newEntries.map((entry) => (
                        <Flex
                          key={entry.item.id}
                          p={2.5}
                          bg={'white'}
                          border={'base'}
                          borderRadius={'md'}
                          alignItems={'center'}
                          justifyContent={'space-between'}
                          gap={2}
                        >
                          <HStack spacing={2} minW={0} flex={1}>
                            <MyIcon
                              name={
                                entry.item.type === 'folder'
                                  ? 'common/folderFill'
                                  : (getSourceNameIcon({ sourceName: entry.item.name }) as any)
                              }
                              w={'16px'}
                              flexShrink={0}
                            />
                            <Box minW={0} flex={1}>
                              <Box
                                fontSize={'sm'}
                                fontWeight={'medium'}
                                color={'myGray.900'}
                                className={'textEllipsis'}
                              >
                                {entry.item.name}
                              </Box>
                              <Box
                                fontSize={'mini'}
                                color={'myGray.500'}
                                className={'textEllipsis'}
                              >
                                {entry.ancestorPathLabel}
                              </Box>
                            </Box>
                          </HStack>
                          <IconButton
                            size={'xs'}
                            variant={'grayDanger'}
                            aria-label={'Remove'}
                            icon={<MyIcon name={'delete'} w={'14px'} />}
                            onClick={() =>
                              setSelectedMap((prev) => {
                                const next = new Map(prev);
                                next.delete(entry.item.id);
                                return next;
                              })
                            }
                          />
                        </Flex>
                      ))}
                    </VStack>
                  </Box>
                )}
              </VStack>
            )}
          </Box>
        </Flex>
      </Flex>

      <Flex justifyContent={'flex-end'} pt={4}>
        <Button
          isDisabled={totalPendingCount === 0}
          isLoading={onNextLoading}
          onClick={onclickNext}
        >
          {totalPendingCount > 0 && !isSelectAll
            ? `${t('dataset:total_num_files', { total: totalPendingCount })} | `
            : ''}
          {t('common:next_step')}
        </Button>
      </Flex>
    </MyBox>
  );
};
