import React, { useState, useRef, useMemo, useCallback } from 'react';
import StatusFilter from './StatusFilter';
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
  Text
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
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import {
  DatasetCollectionTypeEnum,
  DatasetStatusEnum,
  DatasetCollectionSyncResultMap,
  DatasetTypeEnum
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
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { collectionCanSync } from '@fastgpt/global/core/dataset/collection/utils';
import { useFolderDrag } from '@/components/common/folder/useFolderDrag';
import TagsPopOver from '../CollectionCard/TagsPopOver';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ExceptionInfoModal from './ExceptionInfoModal';
import DatabaseExceptionModal from './DatabaseExceptionModal';
import MoveCollectionDuplicateModal from './MoveCollectionDuplicateModal';
import { useTableMultipleSelect } from '@fastgpt/web/hooks/useTableMultipleSelect';

const Header = dynamic(() => import('./Header'));
const EmptyCollectionTip = dynamic(() => import('../CollectionCard/EmptyCollectionTip'));
const DatabaseListTable = dynamic(() => import('../CollectionCard/DatabaseListTable'));

const CollectionCard = () => {
  const BoxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { datasetDetail, loadDatasetDetail } = useContextSelector(DatasetPageContext, (v) => v);
  const { feConfigs } = useSystemStore();

  const [exceptionInfoCollection, setExceptionInfoCollection] = useState<{
    collectionId: string;
  }>();
  const [databaseExceptionCollection, setDatabaseExceptionCollection] = useState<{
    collectionId: string;
  }>();

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
      collections.map((collection) => {
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
    [collections, t]
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
  const [moveDuplicateData, setMoveDuplicateData] = useState<{
    duplicateFiles: string[];
    parentId: string;
    collectionId: string;
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

  // Handler for reading/downloading collection source
  const handleReadSource = useCallback(
    async (collectionId: string) => {
      try {
        const { value: url } = await getCollectionSource({ collectionId });

        if (!url) {
          throw new Error('No file found');
        }

        if (url.startsWith('/')) {
          window.open(`${location.origin}${url}`, '_blank');
        } else {
          window.open(url, '_blank');
        }
      } catch (error) {
        toast({
          title: t('common:error.fileNotFound'),
          status: 'error'
        });
      }
    },
    [t, toast]
  );

  const { runAsync: onUpdateCollection, loading: isUpdating } = useRequest2(
    putDatasetCollectionById,
    {
      onSuccess() {
        getData(pageNum);
      },
      successToast: t('common:update_success')
    }
  );

  const isDatabase = datasetDetail?.type === DatasetTypeEnum.database;
  const isStructureDocument = datasetDetail?.type === DatasetTypeEnum.structureDocument;

  const { openConfirm: openDeleteConfirm, ConfirmModal: ConfirmDeleteModal } = useConfirm({
    content: t('common:dataset.Confirm to delete the file'),
    type: 'delete',
    ...(isDatabase
      ? {
          title: t('dataset:remove_warning')
        }
      : {})
  });
  const { runAsync: onDelCollection } = useRequest2(
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
  const { runAsync: onclickStartSync, loading: isSyncing } = useRequest2(postLinkCollectionSync, {
    onSuccess(res: DatasetCollectionSyncResultEnum) {
      getData(pageNum);
      toast({
        status: 'success',
        title: t(DatasetCollectionSyncResultMap[res]?.label as any)
      });
    },
    errorToast: t('common:core.dataset.error.Start Sync Failed')
  });

  const hasTrainingData = useMemo(
    () => !!formatCollections.find((item) => item.trainingAmount > 0),
    [formatCollections]
  );

  // Check if there are any collections in processing state
  const hasProcessingCollections = useMemo(
    () => !!formatCollections.find((item) => item.statusKey === 'processing'),
    [formatCollections]
  );

  // Silent polling for processing collections (10s interval) - doesn't show loading
  useRequest2(
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
  useRequest2(
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
      <Flex ref={BoxRef} flexDirection={'column'} py={[1, 0]} h={'100%'} px={[2, 6]}>
        {/* banner */}
        {isDatabase && (
          <Alert status="info" mb={4} borderRadius="md">
            <Flex fontSize="sm">
              <MyIcon name="common/info" w={'1.25rem'} mr={2} color="primary.600" />
              <Text color={'myGray.600'}>{t('dataset:database_structure_change_tip')}</Text>
            </Flex>
          </Alert>
        )}
        {/* header */}
        <Header hasTrainingData={hasTrainingData} />

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
              openDeleteConfirm(
                () => onDelCollection([collectionId]),
                undefined,
                t('dataset:confirm_remove_database_table')
              )();
            }}
          />
        ) : (
          <TableContainer mt={3} overflowY={'auto'} fontSize={'sm'} flex={'1 0 0'} h={0}>
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
                    _hover={{ bg: 'myGray.50' }}
                    cursor={'pointer'}
                    {...getBoxProps({
                      dataId: collection._id,
                      isFolder: collection.type === DatasetCollectionTypeEnum.folder
                    })}
                    draggable={false}
                    onClick={() => {
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
                          {feConfigs?.isPlus && !!collection.tags?.length && (
                            <TagsPopOver currentCollection={collection} hoverBg={'white'} />
                          )}
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
                        <Td fontSize={'xs'} py={2} color={'myWhite.1000'} w="150px">
                          {formatTime2YMDHM(collection.createTime)}
                        </Td>
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
                          menuList={[
                            {
                              children: [
                                ...(collection.type === DatasetCollectionTypeEnum.folder
                                  ? []
                                  : [
                                      {
                                        label: (
                                          <Flex alignItems={'center'}>
                                            <MyIcon
                                              name={
                                                collection.type === DatasetCollectionTypeEnum.link
                                                  ? 'common/routePushLight'
                                                  : 'common/download'
                                              }
                                              w={'0.9rem'}
                                              mr={2}
                                            />
                                            {collection.type === DatasetCollectionTypeEnum.link ||
                                            collection.name.toLowerCase().endsWith('.txt')
                                              ? t('dataset:view_original')
                                              : t('dataset:download_file')}
                                          </Flex>
                                        ),
                                        onClick: () => handleReadSource(collection._id)
                                      }
                                    ]),
                                ...(isStructureDocument
                                  ? []
                                  : collectionCanSync(collection.type)
                                    ? [
                                        {
                                          label: (
                                            <Flex alignItems={'center'}>
                                              <MyIcon
                                                name={'common/refreshLight'}
                                                w={'0.9rem'}
                                                mr={2}
                                              />
                                              {t('dataset:collection_sync')}
                                            </Flex>
                                          ),
                                          onClick: () =>
                                            openSyncConfirm(() => {
                                              onclickStartSync(collection._id);
                                            })()
                                        }
                                      ]
                                    : []),
                                ...(isStructureDocument
                                  ? []
                                  : [
                                      {
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
                                      }
                                    ]),
                                ...(isStructureDocument
                                  ? []
                                  : [
                                      {
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
                                      }
                                    ])
                              ]
                            },
                            {
                              children: [
                                {
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
                                  type: 'danger',
                                  onClick: () =>
                                    openDeleteConfirm(
                                      () => onDelCollection([collection._id]),
                                      undefined,
                                      collection.type === DatasetCollectionTypeEnum.folder
                                        ? t(
                                            'common:dataset.collections.Confirm to delete the folder'
                                          )
                                        : t('common:dataset.Confirm to delete the file')
                                    )()
                                }
                              ]
                            }
                          ]}
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
              <Button
                variant={'whiteBase'}
                onClick={() =>
                  openDeleteConfirm(
                    () =>
                      onDelCollection(selectedItems.map((e) => e._id)).then(() =>
                        setSelectedItems([])
                      ),
                    undefined,
                    t('dataset:confirm_delete_collection', {
                      num: selectedItems.length
                    })
                  )()
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
              const checkResult = await postCheckDuplicateCollection({
                datasetId: datasetDetail._id,
                parentId: parentId || undefined,
                fileNames: [moveCollectionData.collectionName]
              });

              if (checkResult.duplicateFileNames && checkResult.duplicateFileNames.length > 0) {
                setMoveDuplicateData({
                  duplicateFiles: checkResult.duplicateFileNames,
                  parentId: parentId ?? '',
                  collectionId: moveCollectionData.collectionId
                });
              } else {
                await putDatasetCollectionById({
                  id: moveCollectionData.collectionId,
                  parentId
                });
                getData(pageNum);
                setMoveCollectionData(undefined);
                toast({
                  status: 'success',
                  title: t('common:move_success')
                });
              }
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
                  parentId: moveDuplicateData.parentId
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
                  overwriteDuplicate: true
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
      </Flex>
    </MyBox>
  );
};

export default React.memo(CollectionCard);
