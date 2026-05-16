import React, { useState, useRef, useMemo, useCallback } from 'react';
import StatusFilter from './StatusFilter';
import TagFilter from './TagFilter';
import {
  Box,
  Flex,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  MenuButton,
  Switch,
  Checkbox,
  HStack,
  Button,
  Alert,
  Text,
  ModalBody,
  ModalFooter
} from '@chakra-ui/react';
import {
  delDatasetCollectionById,
  putDatasetCollectionById,
  postLinkCollectionSync,
  getCollectionSource,
  postCheckDuplicateCollection
} from '@/web/core/dataset/api';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import {
  DatasetCollectionTypeEnum,
  DatasetStatusEnum,
  DatasetCollectionSyncResultMap,
  DatasetTypeEnum,
  ApiDatasetTypeMap
} from '@fastgpt/global/core/dataset/constants';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import { TabEnum } from '../../../../pages/dataset/detail/index';
import dynamic from 'next/dynamic';
import SelectCollections from '@/web/core/dataset/components/SelectCollections';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import type { DatasetCollectionSyncResultEnum } from '@fastgpt/global/core/dataset/constants';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { CollectionPageContext } from '../CollectionCard/Context';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { formatTime2YMDHM, formatTime2YMDHMUtc } from '@fastgpt/global/common/string/time';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useFolderDrag } from '@/components/common/folder/useFolderDrag';
import TagsPopOver from './TagsPopOver';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ExceptionInfoModal from './ExceptionInfoModal';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import DatabaseExceptionModal from './DatabaseExceptionModal';
import MoveCollectionDuplicateModal from './MoveCollectionDuplicateModal';
import { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';
import type { CollectionTagValueType } from '@fastgpt/global/core/dataset/type';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { DatasetRoleList } from '@fastgpt/global/support/permission/dataset/constant';
import {
  getCollectionCollaboratorList,
  postUpdateCollectionCollaborators,
  deleteCollectionCollaborators,
  postResumeCollectionInheritPermission,
  postChangeCollectionOwner
} from '@/web/core/dataset/api/collaborator';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import type { DatasetCollectionsListItemType } from '@/global/core/dataset/type';
import ConfigPerModal from '@/components/support/permission/ConfigPerModal';

const EmptyCollectionTip = dynamic(() => import('../CollectionCard/EmptyCollectionTip'));
const DatabaseListTable = dynamic(() => import('../CollectionCard/DatabaseListTable'));
const SetTagsModal = dynamic(() => import('./SetTagsModal'));
const BatchSetTagsModal = dynamic(() => import('./BatchSetTagsModal'));

const CollectionCard = () => {
  const BoxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { datasetDetail, loadDatasetDetail, allDatasetTags } = useContextSelector(
    DatasetPageContext,
    (v) => v
  );
  const { feConfigs } = useSystemStore();

  const [exceptionInfoCollection, setExceptionInfoCollection] = useState<{
    collectionId: string;
  }>();
  const [databaseExceptionCollection, setDatabaseExceptionCollection] = useState<{
    collectionId: string;
  }>();
  const [setTagsCollectionId, setSetTagsCollectionId] = useState<string | undefined>();
  const [showBatchSetTags, setShowBatchSetTags] = useState(false);
  const [editPerCollection, setEditPerCollection] = useState<DatasetCollectionsListItemType>();
  const [syncSettingsCollection, setSyncSettingsCollection] = useState<
    DatasetCollectionsListItemType | undefined
  >();
  const [syncAutoSync, setSyncAutoSync] = useState(false);

  // Track if current getData call is from polling (to suppress loading state)
  const isPollingRef = useRef(false);

  // 格式化数据量的函数
  const formatDataAmount = (collection: any, isStructureDocument: boolean) => {
    // 文件夹类型显示 "-"
    if (collection.type === DatasetCollectionTypeEnum.folder) {
      return '-';
    }

    if (isStructureDocument && collection.metadata) {
      const metadata = collection.metadata;
      if (metadata.rows && metadata.cols) {
        return t('dataset:data_structure_rows_cols', { rows: metadata.rows, cols: metadata.cols });
      }
    }

    return collection.dataAmount || '-';
  };

  const {
    collections,
    displayedCollections,
    Pagination,
    total,
    getData,
    isGetting,
    pageNum,
    pageSize,
    handleOpenConfigPage,
    searchText,
    filterTags,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder
  } = useContextSelector(CollectionPageContext, (v) => v);

  // Add file status icon
  const formatCollections = useMemo(
    () =>
      displayedCollections.map((collection) => {
        const icon = getCollectionIcon({ type: collection.type, name: collection.name });
        const status = (() => {
          // 文件夹类型不显示状态
          if (collection.type === DatasetCollectionTypeEnum.folder) {
            return {
              statusText: '-',
              colorSchema: 'gray',
              statusKey: 'folder'
            };
          }
          if (collection.tableSchema?.hasOwnProperty('exist') && !collection.tableSchema.exist) {
            return {
              statusText: t('common:table_not_exist'),
              colorSchema: 'gray',
              statusKey: 'notExist'
            };
          }
          if (collection.hasError) {
            return {
              statusText: t('dataset:exception_state'),
              colorSchema: 'red',
              statusKey: 'error'
            };
          }
          if (collection.trainingAmount > 0) {
            return {
              statusText: t('dataset:processing'),
              colorSchema: 'blue',
              statusKey: 'processing'
            };
          }
          return {
            statusText: t('common:core.dataset.collection.status.active'),
            colorSchema: 'green',
            statusKey: 'ready'
          };
        })();

        return {
          ...collection,
          icon,
          ...status
        };
      }),
    [displayedCollections, t]
  );

  const {
    selectedItems,
    toggleSelect,
    isSelected,
    setSelectedItems,
    FloatingActionBar,
    isSelecteAll,
    selectAllTrigger
  } = useTableMultipleSelect({
    list: formatCollections,
    getItemId: (e) => e._id
  });

  const [moveCollectionData, setMoveCollectionData] = useState<{
    collectionId: string;
    collectionName: string;
  }>();
  const [pendingMoveData, setPendingMoveData] = useState<{
    collectionId: string;
    collectionName: string;
    parentId: string | null | undefined;
  }>();
  const [moveDuplicateData, setMoveDuplicateData] = useState<{
    duplicateFiles: string[];
    parentId: string;
    collectionId: string;
    inheritParentPermission: boolean;
  }>();
  const [isMoveLoading, setIsMoveLoading] = useState(false);

  const { onOpenModal: onOpenEditTitleModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('common:Rename')
  });

  /**
   * 排序处理函数
   */
  const handleSort = useCallback(
    (field: 'name' | 'updateTime' | 'createTime' | 'dataAmount') => {
      setSortBy((prevSortBy) => {
        if (prevSortBy === field) {
          // 同一字段：切换排序顺序 asc -> desc -> asc
          setSortOrder((prevOrder) => (prevOrder === 'asc' ? 'desc' : 'asc'));
          return field;
        } else {
          // 不同字段：重置为升序
          setSortOrder('asc');
          return field;
        }
      });
    },
    [setSortBy, setSortOrder]
  );

  /**
   * 渲染排序图标
   */
  const renderSortIcon = useCallback(
    (field: 'name' | 'updateTime' | 'createTime' | 'dataAmount') => {
      if (sortBy !== field) {
        return (
          <MyIcon
            name={'common/table/sort'}
            w={'12px'}
            cursor={'pointer'}
            _hover={{ color: 'primary.600' }}
          />
        );
      }

      return (
        <MyIcon
          name={sortOrder === 'asc' ? 'common/table/asc' : 'common/table/desc'}
          w={'12px'}
          cursor={'pointer'}
        />
      );
    },
    [sortBy, sortOrder]
  );

  const isDatabase = datasetDetail?.type === DatasetTypeEnum.database;
  const isStructureDocument = datasetDetail?.type === DatasetTypeEnum.structureDocument;
  const isApiDataset = !!(datasetDetail?.type && ApiDatasetTypeMap[datasetDetail.type]);

  // Handler for reading/downloading collection source
  const handleReadSource = useCallback(
    async (collectionId: string) => {
      try {
        const { value } = await getCollectionSource({ collectionId });

        if (!value) {
          throw new Error('No file found');
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
    },
    [t, toast, isApiDataset, datasetDetail?.apiDatasetServer?.apiServer?.baseUrl]
  );

  const { runAsync: onUpdateCollection, loading: isUpdating } = useRequest(
    putDatasetCollectionById,
    {
      onSuccess() {
        getData(pageNum);
      },
      successToast: t('common:update_success')
    }
  );

  const { openConfirm: openDeleteConfirm, ConfirmModal: ConfirmDeleteModal } = useConfirm({
    content: t('common:dataset.Confirm to delete the file'),
    type: 'delete',
    ...(isDatabase
      ? {
          title: t('dataset:remove_warning')
        }
      : {})
  });
  const { runAsync: onDelCollection } = useRequest(
    (collectionIds: string[]) => {
      return delDatasetCollectionById({
        collectionIds
      });
    },
    {
      onSuccess() {
        getData(pageNum);
      },
      successToast: t('common:delete_success'),
      errorToast: t('common:delete_failed')
    }
  );

  const { openConfirm: openSyncConfirm, ConfirmModal: ConfirmSyncModal } = useConfirm({
    content: t('dataset:collection_sync_confirm_tip')
  });
  const { runAsync: onclickStartSync, loading: isSyncing } = useRequest(postLinkCollectionSync, {
    onSuccess(res: DatasetCollectionSyncResultEnum) {
      getData(pageNum);
      toast({
        status: 'success',
        title: t(DatasetCollectionSyncResultMap[res]?.label as any)
      });
    },
    errorToast: t('common:core.dataset.error.Start Sync Failed')
  });

  const hasTrainingData = useContextSelector(CollectionPageContext, (v) => v.hasTrainingData);

  // Check if there are any collections in processing state
  const hasProcessingCollections = useMemo(
    () => !!formatCollections.find((item) => item.statusKey === 'processing'),
    [formatCollections]
  );

  // Silent polling for processing collections (10s interval) - doesn't show loading
  useRequest(
    async () => {
      if (!hasProcessingCollections) return;
      isPollingRef.current = true;
      await getData(pageNum);
      isPollingRef.current = false;
    },
    {
      manual: false,
      ready: hasProcessingCollections,
      pollingInterval: hasProcessingCollections ? 10000 : undefined,
      errorToast: '', // Suppress error toast during polling
      refreshDeps: [pageNum]
    }
  );

  // Original polling for training data and dataset status (6s interval)
  useRequest(
    async () => {
      if (!hasTrainingData && datasetDetail.status === DatasetStatusEnum.active) return;
      getData(pageNum);
      if (datasetDetail.status !== DatasetStatusEnum.active) {
        loadDatasetDetail(datasetDetail._id);
      }
    },
    {
      retryInterval: 6000,
      refreshDeps: [hasTrainingData, datasetDetail.status]
    }
  );

  const { getBoxProps, isDropping } = useFolderDrag({
    activeStyles: {
      bg: 'primary.100'
    },
    onDrop: async (dragId: string, targetId: string) => {
      try {
        await putDatasetCollectionById({
          id: dragId,
          parentId: targetId
        });
        getData(pageNum);
      } catch (error) {}
    }
  });

  const isLoading = isUpdating || isSyncing || (isGetting && !isPollingRef.current) || isDropping;

  return (
    <MyBox isLoading={isLoading} h={'100%'} py={[2, 4]} overflow={'hidden'}>
      <Flex ref={BoxRef} flexDirection={'column'} py={[1, 0]} h={'100%'} px={[2, 4]}>
        {/* banner */}
        {isDatabase && (
          <Alert status="info" mb={4} borderRadius="md">
            <Flex fontSize="sm">
              <MyIcon name="common/info" w={'1.25rem'} mr={2} color="primary.600" />
              <Text color={'myGray.600'}>{t('dataset:database_structure_change_tip')}</Text>
            </Flex>
          </Alert>
        )}
        {/* collection table */}
        {isDatabase ? (
          <DatabaseListTable
            formatCollections={formatCollections}
            total={total}
            onUpdateCollection={onUpdateCollection}
            onTrainingStatesClick={(collectionId) =>
              setDatabaseExceptionCollection({ collectionId })
            }
            onDataConfigClick={(databaseName, activeStep) =>
              handleOpenConfigPage('edit', databaseName, activeStep)
            }
            onRemoveClick={(collectionId) => {
              openDeleteConfirm({
                onConfirm: () => onDelCollection([collectionId]),
                customContent: t('dataset:confirm_remove_database_table')
              })();
            }}
          />
        ) : (
          <TableContainer overflowY={'auto'} fontSize={'sm'} flex={'1 0 0'} h={0}>
            <Table variant={'simple'} draggable={false}>
              <Thead draggable={false}>
                <Tr>
                  <Th py={4}>
                    <HStack>
                      <Checkbox isChecked={isSelecteAll} onChange={selectAllTrigger} />
                      <HStack spacing={1} cursor={'pointer'} onClick={() => handleSort('name')}>
                        <Box>{t('common:Name')}</Box>
                        {renderSortIcon('name')}
                      </HStack>
                    </HStack>
                  </Th>
                  {isStructureDocument ? (
                    <>
                      <Th py={4} w="100px">
                        <Box>{t('dataset:collection_data_count')}</Box>
                      </Th>
                      <Th py={4} w="150px">
                        <HStack
                          spacing={1}
                          cursor={'pointer'}
                          onClick={() => handleSort('createTime')}
                        >
                          <Box>{t('common:create_time')}</Box>
                          {renderSortIcon('createTime')}
                        </HStack>
                      </Th>
                      <Th py={4} w="150px">
                        <HStack
                          spacing={1}
                          cursor={'pointer'}
                          onClick={() => handleSort('updateTime')}
                        >
                          <Box>{t('common:update_time')}</Box>
                          {renderSortIcon('updateTime')}
                        </HStack>
                      </Th>
                    </>
                  ) : (
                    <>
                      <Th py={4} w="100px">
                        <HStack
                          spacing={1}
                          cursor={'pointer'}
                          onClick={() => handleSort('dataAmount')}
                        >
                          <Box>{t('dataset:chunk_count')}</Box>
                          {renderSortIcon('dataAmount')}
                        </HStack>
                      </Th>
                      <Th py={4} w="100px">
                        <HStack spacing={1}>
                          <Box>{t('common:Status')}</Box>
                          <StatusFilter
                            value={statusFilter}
                            onChange={setStatusFilter}
                            hideNotExist
                          />
                        </HStack>
                      </Th>
                      {feConfigs?.isPlus && (
                        <Th py={4} w="180px">
                          <HStack spacing={1}>
                            <Box>{t('dataset:tag.tags')}</Box>
                            <TagFilter />
                          </HStack>
                        </Th>
                      )}
                      <Th py={4} w="150px">
                        <HStack
                          spacing={1}
                          cursor={'pointer'}
                          onClick={() => handleSort('createTime')}
                        >
                          <Box>{t('common:create_time')}</Box>
                          {renderSortIcon('createTime')}
                        </HStack>
                      </Th>
                      <Th py={4} w="150px">
                        <HStack
                          spacing={1}
                          cursor={'pointer'}
                          onClick={() => handleSort('updateTime')}
                        >
                          <Box>{t('common:update_time')}</Box>
                          {renderSortIcon('updateTime')}
                        </HStack>
                      </Th>
                      <Th py={4} w="100px">
                        {t('dataset:Enable')}
                      </Th>
                    </>
                  )}
                  <Th py={4} w="100px" />
                </Tr>
              </Thead>
              <Tbody>
                <Tr h={'5px'} />
                {formatCollections.map((collection) => (
                  <Tr
                    key={collection._id}
                    _hover={{ bg: collection.permission.hasReadPer ? 'myGray.50' : undefined }}
                    cursor={collection.permission.hasReadPer ? 'pointer' : 'not-allowed'}
                    opacity={collection.permission.hasReadPer ? 1 : 0.5}
                    {...getBoxProps({
                      dataId: collection._id,
                      isFolder: collection.type === DatasetCollectionTypeEnum.folder
                    })}
                    draggable={false}
                    onClick={() => {
                      if (!collection.permission.hasReadPer) return;
                      if (collection.type === DatasetCollectionTypeEnum.folder) {
                        router.push({
                          query: {
                            datasetId: datasetDetail._id,
                            parentId: collection._id
                          }
                        });
                      } else {
                        router.push({
                          query: {
                            datasetId: datasetDetail._id,
                            collectionId: collection._id,
                            currentTab: isStructureDocument
                              ? TabEnum.fileDataCard
                              : TabEnum.dataCard
                          }
                        });
                      }
                    }}
                  >
                    <Td minW={'150px'} maxW={['200px', '300px']} draggable py={2}>
                      <HStack>
                        <Box onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            isChecked={isSelected(collection)}
                            onChange={(e) => toggleSelect(collection)}
                          />
                        </Box>
                        <Box minW={0}>
                          <Flex alignItems={'center'}>
                            <MyIcon
                              name={collection.icon as any}
                              w={'16px'}
                              mr={2}
                              flexShrink={0}
                            />
                            {isStructureDocument ? (
                              <Box fontSize={'xs'} color={'myWhite.1000'} className="textEllipsis">
                                {collection.name}
                              </Box>
                            ) : (
                              <MyTooltip
                                label={t('common:click_drag_tip')}
                                shouldWrapChildren={false}
                              >
                                <Box
                                  fontSize={'xs'}
                                  color={'myWhite.1000'}
                                  className="textEllipsis"
                                >
                                  {collection.name}
                                </Box>
                              </MyTooltip>
                            )}
                          </Flex>
                        </Box>
                      </HStack>
                    </Td>
                    {isStructureDocument ? (
                      <>
                        <Td fontSize={'xs'} py={2} color={'myWhite.1000'} w="100px">
                          {formatDataAmount(collection, isStructureDocument)}
                        </Td>
                        <Td fontSize={'xs'} py={2} color={'myWhite.1000'} w="150px">
                          {formatTime2YMDHM(collection.createTime)}
                        </Td>
                        <Td fontSize={'xs'} py={2} color={'myWhite.1000'} w="150px">
                          {formatTime2YMDHM(collection.updateTime)}
                        </Td>
                      </>
                    ) : (
                      <>
                        <Td fontSize={'xs'} py={2} color={'myWhite.1000'} w="100px">
                          {formatDataAmount(collection, isStructureDocument)}
                        </Td>
                        <Td py={2} w="100px">
                          {collection.statusKey === 'folder' ? (
                            <Box fontSize={'xs'} color={'myWhite.1000'}>
                              {collection.statusText}
                            </Box>
                          ) : collection.statusKey === 'error' ? (
                            <MyTooltip label={t('common:Click_to_expand')}>
                              <MyTag
                                colorSchema={collection.colorSchema as any}
                                type={'fill'}
                                h={'28px'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExceptionInfoCollection({ collectionId: collection._id });
                                }}
                              >
                                <Flex fontWeight={'medium'} alignItems={'center'} gap={1}>
                                  {t(collection.statusText as any)}
                                  <MyIcon name={'common/maximize'} w={'11px'} />
                                </Flex>
                              </MyTag>
                            </MyTooltip>
                          ) : (
                            <MyTag
                              colorSchema={collection.colorSchema as any}
                              type={'fill'}
                              h={'28px'}
                            >
                              <Flex fontWeight={'medium'} alignItems={'center'} gap={1}>
                                {t(collection.statusText as any)}
                              </Flex>
                            </MyTag>
                          )}
                        </Td>
                        {feConfigs?.isPlus && (
                          <Td py={2} w="180px" onClick={(e) => e.stopPropagation()}>
                            {(() => {
                              const tagValues = (collection.tags || []).filter(
                                (t): t is CollectionTagValueType =>
                                  typeof t === 'object' && t !== null
                              );
                              if (tagValues.length === 0) return <Box color="myGray.400">-</Box>;
                              const visible = tagValues.slice(0, 2);
                              const overflowCount = tagValues.length - 2;
                              const getTagText = (tv: CollectionTagValueType) => {
                                const tagDef = allDatasetTags.find((t) => t._id === tv.tagId);
                                return tagDef
                                  ? `${tagDef.tag}：${tagDef.tagType === 'datetime' ? formatTime2YMDHMUtc(Number(tv.value)) : tv.value}`
                                  : tv.value;
                              };
                              const tagBadge = (tv: CollectionTagValueType, idx: number) => (
                                <Box
                                  key={idx}
                                  px={2}
                                  py={1}
                                  fontSize={'xs'}
                                  bg={'#F4F4F7'}
                                  color={'#505F73'}
                                  borderRadius={'6px'}
                                  whiteSpace={'nowrap'}
                                  lineHeight={'14px'}
                                >
                                  {getTagText(tv)}
                                </Box>
                              );
                              const trigger = (
                                <Flex gap={1} align={'center'} flexWrap={'nowrap'}>
                                  {visible.map((tv, idx) => tagBadge(tv, idx))}
                                  {overflowCount > 0 && (
                                    <Box
                                      px={2}
                                      py={1}
                                      bg={'#F4F4F7'}
                                      borderRadius={'6px'}
                                      fontSize={'xs'}
                                      color={'#505F73'}
                                      whiteSpace={'nowrap'}
                                      cursor={'pointer'}
                                      lineHeight={'14px'}
                                    >
                                      {`+${overflowCount}`}
                                    </Box>
                                  )}
                                </Flex>
                              );
                              if (tagValues.length >= 3) {
                                return (
                                  <MyPopover
                                    hasArrow={true}
                                    trigger={'hover'}
                                    w="fit-content"
                                    maxW="none"
                                    Trigger={trigger}
                                  >
                                    {({}) => (
                                      <Flex flexDirection={'column'} gap={2} p={3}>
                                        {tagValues.map((tv, idx) => (
                                          <Box
                                            key={idx}
                                            px={2}
                                            py={1}
                                            fontSize={'xs'}
                                            bg={'#F4F4F7'}
                                            color={'#505F73'}
                                            borderRadius={'6px'}
                                            whiteSpace={'nowrap'}
                                            lineHeight={'14px'}
                                            alignSelf={'flex-start'}
                                          >
                                            {getTagText(tv)}
                                          </Box>
                                        ))}
                                      </Flex>
                                    )}
                                  </MyPopover>
                                );
                              }
                              return trigger;
                            })()}
                          </Td>
                        )}
                        <Td fontSize={'xs'} py={2} color={'myWhite.1000'} w="150px">
                          {formatTime2YMDHM(collection.createTime)}
                        </Td>
                        <Td fontSize={'xs'} py={2} color={'myWhite.1000'} w="150px">
                          {formatTime2YMDHM(collection.updateTime)}
                        </Td>
                        <Td py={2} onClick={(e) => e.stopPropagation()} w="100px">
                          <Switch
                            isChecked={!collection.forbid}
                            size={'sm'}
                            onChange={(e) =>
                              onUpdateCollection({
                                id: collection._id,
                                forbid: !e.target.checked
                              })
                            }
                          />
                        </Td>
                      </>
                    )}
                    <Td py={2} onClick={(e) => e.stopPropagation()} w="100px">
                      {collection.permission.hasWritePer && (
                        <MyMenu
                          width={100}
                          offset={[-70, 5]}
                          Button={
                            <MenuButton
                              w={'1.5rem'}
                              h={'1.5rem'}
                              borderRadius={'md'}
                              _hover={{
                                color: 'primary.500',
                                '& .icon': {
                                  bg: 'myGray.200'
                                }
                              }}
                            >
                              <MyIcon
                                className="icon"
                                name={'more'}
                                h={'1rem'}
                                w={'1rem'}
                                px={1}
                                py={1}
                                borderRadius={'md'}
                                cursor={'pointer'}
                              />
                            </MenuButton>
                          }
                          menuList={(() => {
                            const isFolder = collection.type === DatasetCollectionTypeEnum.folder;
                            const isLink = collection.type === DatasetCollectionTypeEnum.link;

                            const permissionItem = (() => {
                              const isPermissionSyncDisabled =
                                datasetDetail?.apiDatasetServer?.apiServer?.permissionSync === true;

                              if (isPermissionSyncDisabled) {
                                return {
                                  label: (
                                    <MyTooltip label={t('dataset:permission_sync_disabled_tip')}>
                                      <Flex alignItems={'center'} opacity={0.4}>
                                        <MyIcon name={'key'} w={'0.9rem'} mr={2} />
                                        {t('common:Permission')}
                                      </Flex>
                                    </MyTooltip>
                                  ),
                                  onClick: undefined,
                                  menuItemStyles: { cursor: 'not-allowed' }
                                };
                              }

                              return {
                                label: (
                                  <Flex
                                    alignItems={'center'}
                                    opacity={collection.permission.hasManagePer ? 1 : 0.4}
                                  >
                                    <MyIcon name={'key'} w={'0.9rem'} mr={2} />
                                    {t('common:Permission')}
                                  </Flex>
                                ),
                                onClick: collection.permission.hasManagePer
                                  ? () => setEditPerCollection(collection)
                                  : undefined,
                                menuItemStyles: collection.permission.hasManagePer
                                  ? undefined
                                  : { cursor: 'not-allowed' }
                              };
                            })();

                            const tagItem = feConfigs?.isPlus
                              ? {
                                  label: (
                                    <Flex alignItems={'center'}>
                                      <MyIcon name={'core/dataset/tag'} w={'0.9rem'} mr={2} />
                                      {t('dataset:tag.tags')}
                                    </Flex>
                                  ),
                                  onClick: () => setSetTagsCollectionId(collection._id)
                                }
                              : null;

                            const moveItem = {
                              label: (
                                <Flex alignItems={'center'}>
                                  <MyIcon name={'common/file/move'} w={'0.9rem'} mr={2} />
                                  {t('common:Move')}
                                </Flex>
                              ),
                              onClick: () =>
                                setMoveCollectionData({
                                  collectionId: collection._id,
                                  collectionName: collection.name
                                })
                            };

                            const renameItem = {
                              label: (
                                <Flex alignItems={'center'}>
                                  <MyIcon name={'edit'} w={'0.9rem'} mr={2} />
                                  {t('common:Rename')}
                                </Flex>
                              ),
                              onClick: () =>
                                onOpenEditTitleModal({
                                  defaultVal: collection.name,
                                  onSuccess: (newName) =>
                                    onUpdateCollection({
                                      id: collection._id,
                                      name: newName
                                    })
                                })
                            };

                            const deleteItem = {
                              label: (
                                <Flex alignItems={'center'}>
                                  <MyIcon
                                    mr={2}
                                    name={'delete'}
                                    w={'0.9rem'}
                                    _hover={{ color: 'red.600' }}
                                  />
                                  <Box>{t('common:Delete')}</Box>
                                </Flex>
                              ),
                              type: 'danger' as const,
                              onClick: () =>
                                openDeleteConfirm({
                                  onConfirm: () => onDelCollection([collection._id]),
                                  customContent: isFolder
                                    ? t('common:dataset.collections.Confirm to delete the folder')
                                    : t('common:dataset.Confirm to delete the file')
                                })()
                            };

                            const sourceItem = {
                              label: (
                                <Flex alignItems={'center'}>
                                  <MyIcon
                                    name={isLink ? 'common/routePushLight' : 'common/download'}
                                    w={'0.9rem'}
                                    mr={2}
                                  />
                                  {isApiDataset
                                    ? t('dataset:view_original')
                                    : isLink || collection.name.toLowerCase().endsWith('.txt')
                                      ? t('dataset:view_original')
                                      : collection.type === DatasetCollectionTypeEnum.images
                                        ? t('dataset:view_image')
                                        : t('dataset:download_file')}
                                </Flex>
                              ),
                              onClick: () => handleReadSource(collection._id)
                            };

                            if (isFolder) {
                              return [
                                { children: [permissionItem] },
                                { children: [moveItem, renameItem, deleteItem] }
                              ];
                            }

                            if (isLink) {
                              const syncNowItem = {
                                label: (
                                  <Flex alignItems={'center'}>
                                    <MyIcon name={'common/refreshLight'} w={'0.9rem'} mr={2} />
                                    {t('dataset:collection_sync')}
                                  </Flex>
                                ),
                                onClick: () =>
                                  openSyncConfirm({
                                    onConfirm: () => onclickStartSync(collection._id)
                                  })()
                              };
                              const syncSettingsItem = {
                                label: (
                                  <Flex alignItems={'center'}>
                                    <MyIcon name={'common/settingLight'} w={'0.9rem'} mr={2} />
                                    {t('dataset:sync_settings')}
                                  </Flex>
                                ),
                                onClick: () => {
                                  setSyncAutoSync(!!collection.autoSync);
                                  setSyncSettingsCollection(collection);
                                }
                              };
                              return [
                                {
                                  children: [
                                    syncNowItem,
                                    syncSettingsItem,
                                    ...(tagItem ? [tagItem] : []),
                                    permissionItem
                                  ]
                                },
                                { children: [sourceItem, moveItem, renameItem, deleteItem] }
                              ];
                            }

                            // 普通文件
                            return [
                              {
                                children: [...(tagItem ? [tagItem] : []), permissionItem]
                              },
                              { children: [sourceItem, moveItem, renameItem, deleteItem] }
                            ];
                          })()}
                        />
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            {total === 0 && <EmptyCollectionTip />}
          </TableContainer>
        )}

        <FloatingActionBar
          Controler={
            <HStack>
              {feConfigs?.isPlus && (
                <Button variant={'whiteBase'} onClick={() => setShowBatchSetTags(true)}>
                  {t('dataset:tag.batch_set_tags')}
                </Button>
              )}
              <Button
                variant={'whiteBase'}
                onClick={() => {
                  const linkItems = selectedItems.filter(
                    (e) => e.type === DatasetCollectionTypeEnum.link
                  );
                  linkItems.forEach((item) => onclickStartSync(item._id));
                }}
              >
                {t('dataset:batch_sync')}
              </Button>
              <Button
                variant={'whiteBase'}
                onClick={() =>
                  openDeleteConfirm({
                    onConfirm: () =>
                      onDelCollection(selectedItems.map((e) => e._id)).then(() =>
                        setSelectedItems([])
                      ),
                    customContent: t('dataset:confirm_delete_collection', {
                      num: selectedItems.length
                    })
                  })()
                }
              >
                {t('dataset:batch_delete')}
              </Button>
            </HStack>
          }
        >
          {total > 0 && (
            <Flex justifyContent={'center'}>
              <Pagination />
            </Flex>
          )}
        </FloatingActionBar>

        <ConfirmDeleteModal />
        <ConfirmSyncModal />
        <EditTitleModal />

        {!!exceptionInfoCollection && !isDatabase && (
          <ExceptionInfoModal
            datasetId={datasetDetail._id}
            collectionId={exceptionInfoCollection.collectionId}
            onClose={() => setExceptionInfoCollection(undefined)}
            onSuccess={() => getData(pageNum)}
          />
        )}

        {!!databaseExceptionCollection && isDatabase && (
          <DatabaseExceptionModal
            datasetId={datasetDetail._id}
            collectionId={databaseExceptionCollection.collectionId}
            onClose={() => setDatabaseExceptionCollection(undefined)}
            onSuccess={() => getData(pageNum)}
          />
        )}

        {!!moveCollectionData && (
          <SelectCollections
            datasetId={datasetDetail._id}
            type="folder"
            defaultSelectedId={[moveCollectionData.collectionId]}
            confirmLoading={isMoveLoading}
            onClose={() => {
              setMoveCollectionData(undefined);
              setMoveDuplicateData(undefined);
            }}
            onSuccess={async ({ parentId }) => {
              if (!moveCollectionData) return;
              setPendingMoveData({
                collectionId: moveCollectionData.collectionId,
                collectionName: moveCollectionData.collectionName,
                parentId
              });
              setMoveCollectionData(undefined);
            }}
          />
        )}

        {!!moveDuplicateData && (
          <MoveCollectionDuplicateModal
            isOpen={true}
            onClose={() => setMoveDuplicateData(undefined)}
            duplicateFiles={moveDuplicateData.duplicateFiles}
            onSkip={() => setMoveDuplicateData(undefined)}
            onContinueMove={async () => {
              setMoveDuplicateData(undefined);
              setIsMoveLoading(true);
              try {
                await putDatasetCollectionById({
                  id: moveDuplicateData.collectionId,
                  parentId: moveDuplicateData.parentId,
                  inheritParentPermission: moveDuplicateData.inheritParentPermission
                });
                getData(pageNum);
                setMoveCollectionData(undefined);
                toast({
                  status: 'success',
                  title: t('common:move_success')
                });
              } finally {
                setIsMoveLoading(false);
              }
            }}
            onReplaceFiles={async () => {
              setMoveDuplicateData(undefined);
              setIsMoveLoading(true);
              try {
                await putDatasetCollectionById({
                  id: moveDuplicateData.collectionId,
                  parentId: moveDuplicateData.parentId,
                  overwriteDuplicate: true,
                  inheritParentPermission: moveDuplicateData.inheritParentPermission
                });
                getData(pageNum);
                setMoveCollectionData(undefined);
                toast({
                  status: 'success',
                  title: t('common:move_success')
                });
              } finally {
                setIsMoveLoading(false);
              }
            }}
          />
        )}

        {!!setTagsCollectionId &&
          (() => {
            const col = formatCollections.find((c) => c._id === setTagsCollectionId);
            return col ? (
              <SetTagsModal collection={col} onClose={() => setSetTagsCollectionId(undefined)} />
            ) : null;
          })()}

        {showBatchSetTags && (
          <BatchSetTagsModal
            selectedCollections={selectedItems}
            datasetId={datasetDetail._id}
            onClose={() => {
              setShowBatchSetTags(false);
              setSelectedItems([]);
            }}
          />
        )}

        {!!pendingMoveData && (
          <MyModal
            isOpen
            iconSrc="common/confirm/info"
            maxW={['90vw', '400px']}
            title={t('common:Move')}
            onClose={() => setPendingMoveData(undefined)}
          >
            <ModalBody pt={5} whiteSpace={'pre-wrap'} fontSize={'sm'}>
              {t('dataset:move.permission_choice_tip')}
            </ModalBody>
            <ModalFooter gap={2}>
              <Button
                size={'sm'}
                px={5}
                variant={'whiteBase'}
                onClick={() => setPendingMoveData(undefined)}
              >
                {t('common:Cancel')}
              </Button>
              <Button
                size={'sm'}
                px={5}
                variant={'primaryOutline'}
                onClick={async () => {
                  const { collectionId, collectionName, parentId } = pendingMoveData;
                  setPendingMoveData(undefined);
                  const checkResult = await postCheckDuplicateCollection({
                    datasetId: datasetDetail._id,
                    parentId: parentId || undefined,
                    fileNames: [collectionName]
                  });
                  if (checkResult.duplicateFileNames && checkResult.duplicateFileNames.length > 0) {
                    setMoveDuplicateData({
                      duplicateFiles: checkResult.duplicateFileNames,
                      parentId: parentId ?? '',
                      collectionId,
                      inheritParentPermission: true
                    });
                  } else {
                    await putDatasetCollectionById({
                      id: collectionId,
                      parentId: parentId ?? undefined,
                      inheritParentPermission: true
                    });
                    getData(pageNum);
                    toast({ status: 'success', title: t('common:move_success') });
                  }
                }}
              >
                {t('dataset:move.inherit_folder_permission')}
              </Button>
              <Button
                size={'sm'}
                px={5}
                variant={'primaryOutline'}
                onClick={async () => {
                  const { collectionId, collectionName, parentId } = pendingMoveData;
                  setPendingMoveData(undefined);
                  const checkResult = await postCheckDuplicateCollection({
                    datasetId: datasetDetail._id,
                    parentId: parentId || undefined,
                    fileNames: [collectionName]
                  });
                  if (checkResult.duplicateFileNames && checkResult.duplicateFileNames.length > 0) {
                    setMoveDuplicateData({
                      duplicateFiles: checkResult.duplicateFileNames,
                      parentId: parentId ?? '',
                      collectionId,
                      inheritParentPermission: false
                    });
                  } else {
                    await putDatasetCollectionById({
                      id: collectionId,
                      parentId: parentId ?? undefined,
                      inheritParentPermission: false
                    });
                    getData(pageNum);
                    toast({ status: 'success', title: t('common:move_success') });
                  }
                }}
              >
                {t('dataset:move.keep_independent_permission')}
              </Button>
            </ModalFooter>
          </MyModal>
        )}

        {!!editPerCollection && (
          <ConfigPerModal
            name={editPerCollection.name}
            showEffectScope={editPerCollection.type === DatasetCollectionTypeEnum.folder}
            effectScope={editPerCollection.permissionEffectScope}
            isInheritPermission={editPerCollection.inheritPermission}
            hasParent={true}
            resumeInheritPermission={() =>
              postResumeCollectionInheritPermission(editPerCollection._id).then(() =>
                getData(pageNum)
              )
            }
            onChangeOwner={(tmbId: string) =>
              postChangeCollectionOwner({
                collectionId: editPerCollection._id,
                ownerId: tmbId
              }).then(() => getData(pageNum))
            }
            managePer={{
              defaultRole: ReadRoleVal,
              permission: editPerCollection.permission,
              onGetCollaboratorList: () => getCollectionCollaboratorList(editPerCollection._id),
              roleList: DatasetRoleList,
              onUpdateCollaborators: (props) =>
                postUpdateCollectionCollaborators({
                  ...props,
                  collectionId: editPerCollection._id
                }),
              onDelOneCollaborator: async (props) =>
                deleteCollectionCollaborators({ ...props, collectionId: editPerCollection._id }),
              refreshDeps: [editPerCollection._id, editPerCollection.inheritPermission]
            }}
            {...(editPerCollection.type === DatasetCollectionTypeEnum.folder
              ? {
                  onConfirmPermission: ({ collaborators, permissionEffectScope }) =>
                    postUpdateCollectionCollaborators({
                      collaborators,
                      collectionId: editPerCollection._id,
                      permissionEffectScope
                    }).then(() => getData(pageNum))
                }
              : {})}
            onClose={() => setEditPerCollection(undefined)}
          />
        )}

        {!!syncSettingsCollection && (
          <MyModal
            isOpen
            iconSrc="common/confirm/info"
            maxW={['90vw', '400px']}
            title={t('dataset:sync_settings')}
            onClose={() => setSyncSettingsCollection(undefined)}
          >
            <ModalBody p={8}>
              <Flex alignItems="center">
                <HStack flex="1" spacing={1}>
                  <Box fontSize="sm">{t('dataset:sync_schedule')}</Box>
                  <QuestionTip label={t('dataset:sync_schedule_tip')} />
                </HStack>
                <Switch
                  isChecked={syncAutoSync}
                  onChange={(e) => setSyncAutoSync(e.target.checked)}
                />
              </Flex>
            </ModalBody>
            <ModalFooter gap={2}>
              <Button
                size={'sm'}
                px={5}
                variant={'whiteBase'}
                onClick={() => setSyncSettingsCollection(undefined)}
              >
                {t('common:Cancel')}
              </Button>
              <Button
                size={'sm'}
                px={5}
                onClick={async () => {
                  await onUpdateCollection({
                    id: syncSettingsCollection._id,
                    autoSync: syncAutoSync
                  });
                  setSyncSettingsCollection(undefined);
                }}
              >
                {t('common:Confirm')}
              </Button>
            </ModalFooter>
          </MyModal>
        )}
      </Flex>
    </MyBox>
  );
};

export default React.memo(CollectionCard);
