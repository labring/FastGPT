import {
  Box,
  Button,
  Flex,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import type { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  GetDatasetTrainingErrorBody,
  GetTrainingDataDetailResponse,
  GetTrainingErrorBody,
  TrainingErrorGroupType,
  TrainingErrorItemType,
  UpdateTrainingDataBody
} from '@fastgpt/global/openapi/core/dataset/training/api';
import type { Permission } from '@fastgpt/global/support/permission/controller';
import type { PaginationResponseType } from '@fastgpt/global/openapi/api';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useMemoizedFn, useScroll, useThrottleEffect } from 'ahooks';
import { forwardRef, type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import RawSourceBox from '@/components/core/dataset/RawSourceBox';
import {
  deleteTrainingData,
  getDatasetTrainingError,
  getTrainingDataDetail,
  getTrainingError,
  updateTrainingData
} from '@/web/core/dataset/api/training';
import { formatTrainingStageText } from '@/web/core/dataset/trainingStatus';
import TrainingErrorEditView from './TrainingErrorEditView';

export type TrainingErrorScope =
  | { type: 'collection'; collectionId: string }
  | { type: 'dataset'; datasetId: string };

type TrainingErrorListItem = TrainingErrorItemType | TrainingErrorGroupType;
type TrainingErrorListParams = GetTrainingErrorBody | GetDatasetTrainingErrorBody;
type TrainingErrorListResponse = PaginationResponseType<TrainingErrorListItem>;
type TrainingErrorRequestParams =
  | Omit<GetTrainingErrorBody, 'pageNum' | 'offset' | 'pageSize'>
  | Omit<GetDatasetTrainingErrorBody, 'pageNum' | 'offset' | 'pageSize'>;
const datasetGroupItemPageSize = 5;

const ErrorActionButton = forwardRef<
  HTMLButtonElement,
  {
    icon: string;
    children: React.ReactNode;
    onClick?: () => void;
    isLoading?: boolean;
  }
>(({ icon, children, onClick, isLoading }, ref) => (
  <Button
    ref={ref}
    variant={'unstyled'}
    color={'myGray.600'}
    display={'inline-flex'}
    alignItems={'center'}
    justifyContent={'center'}
    gap={'6px'}
    px={2}
    py={'6px'}
    h={'28px'}
    minW={0}
    borderRadius={'6px'}
    fontSize={'12px'}
    lineHeight={'16px'}
    fontWeight={500}
    letterSpacing={'0.5px'}
    bg={'transparent'}
    _hover={{ bg: 'transparent', color: 'myGray.600' }}
    _active={{ bg: 'transparent' }}
    _disabled={{ opacity: 0.6, cursor: 'not-allowed' }}
    isLoading={isLoading}
    onClick={onClick}
  >
    <MyIcon name={icon as any} w={4} flexShrink={0} />
    {children}
  </Button>
));
ErrorActionButton.displayName = 'ErrorActionButton';

const ErrorMessage = ({ errorMsg }: { errorMsg?: string }) => {
  const { t } = useTranslation();
  const text = errorMsg ? t(errorMsg as any) : '-';

  return (
    <MyTooltip shouldWrapChildren={false} placement={'bottom-start'} offset={[0, 10]} label={text}>
      <Box
        className="textEllipsis"
        display={'inline-block'}
        maxW={'100%'}
        verticalAlign={'middle'}
        color={'myGray.600'}
        fontSize={'12px'}
        lineHeight={'16px'}
      >
        {text}
      </Box>
    </MyTooltip>
  );
};

const TrainingStageText = ({ item }: { item: TrainingErrorItemType }) => {
  const { t } = useTranslation();
  const text = formatTrainingStageText(item.mode, t);

  return (
    <Box
      className="textEllipsis"
      color={'myGray.900'}
      fontSize={'12px'}
      lineHeight={'16px'}
      whiteSpace={'nowrap'}
      maxW={'165px'}
    >
      {text}
    </Box>
  );
};

const ActionButtons = ({
  item,
  isRetryLoading,
  isEditLoading,
  isDeleteLoading,
  onRetry,
  onEdit,
  onDelete
}: {
  item: TrainingErrorItemType;
  isRetryLoading: boolean;
  isEditLoading: boolean;
  isDeleteLoading: boolean;
  onRetry: (item: TrainingErrorItemType) => void;
  onEdit: (item: TrainingErrorItemType) => void;
  onDelete: (item: TrainingErrorItemType) => void;
}) => {
  const { t } = useTranslation();

  return (
    <Flex alignItems={'center'} justifyContent={'flex-end'}>
      <ErrorActionButton
        icon={'common/confirm/restoreTip'}
        isLoading={isRetryLoading}
        onClick={() => onRetry(item)}
      >
        {t('dataset:dataset.ReTrain')}
      </ErrorActionButton>
      <Box w={'1px'} height={'16px'} bg={'#E8EBF0'} />
      <ErrorActionButton icon={'edit'} isLoading={isEditLoading} onClick={() => onEdit(item)}>
        {t('dataset:dataset.Edit_Chunk')}
      </ErrorActionButton>
      <Box w={'1px'} height={'16px'} bg={'#E8EBF0'} />
      <ErrorActionButton icon={'delete'} isLoading={isDeleteLoading} onClick={() => onDelete(item)}>
        {t('dataset:dataset.Delete_Chunk')}
      </ErrorActionButton>
    </Flex>
  );
};

const TrainingErrorList = ({
  scope,
  permission,
  onRefresh,
  onClose,
  showFooter = false
}: {
  scope: TrainingErrorScope;
  permission: Permission;
  onRefresh?: () => void;
  onClose?: () => void;
  showFooter?: boolean;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editChunk, setEditChunk] = useState<GetTrainingDataDetailResponse>();
  const collectionScrollRef = useRef<HTMLDivElement>(null);
  const collectionAutoFillOffsetRef = useRef<number>();
  const datasetScrollRef = useRef<HTMLDivElement>(null);
  const datasetAutoFillOffsetRef = useRef<number>();
  const pendingDatasetScrollTopRef = useRef<number>();
  const trainingErrorDataRef = useRef<TrainingErrorListItem[]>([]);

  const getErrorData = (data: TrainingErrorListParams): Promise<TrainingErrorListResponse> => {
    if (scope.type === 'collection') return getTrainingError(data as GetTrainingErrorBody);
    return getDatasetTrainingError(data as GetDatasetTrainingErrorBody);
  };
  const requestParams = useMemo(() => {
    if (scope.type === 'collection') return { collectionId: scope.collectionId };
    return { datasetId: scope.datasetId };
  }, [scope]);

  const { data, setData, setTotal, ScrollData, isLoading, total, fetchData } = useScrollPagination<
    TrainingErrorListParams,
    TrainingErrorListResponse
  >(getErrorData, {
    pageSize: scope.type === 'collection' ? 15 : 10,
    params: (scope.type === 'dataset'
      ? { ...requestParams, itemPageSize: datasetGroupItemPageSize }
      : requestParams) as TrainingErrorRequestParams,
    refreshDeps: [
      scope.type,
      scope.type === 'dataset' ? scope.datasetId : '',
      scope.type === 'collection' ? scope.collectionId : ''
    ],
    showNoMoreTip: scope.type !== 'dataset',
    EmptyTip: <EmptyTip text={t('dataset:training_error_empty')} />
  });

  useEffect(() => {
    trainingErrorDataRef.current = data;
  }, [data]);

  /**
   * 单条异常被删除、重试或编辑后都会离开异常列表，这里只修补当前列表。
   * dataset 视图保留每个 collection 已加载的 items 数量，避免“加载更多”后的内容缩回首屏数量。
   */
  const removeHandledItemFromLocalData = useMemoizedFn(
    ({ collectionId, dataId }: { collectionId?: string; dataId: string }) => {
      const targetCollectionId = collectionId ? String(collectionId) : undefined;
      const targetDataId = String(dataId);
      const currentData = trainingErrorDataRef.current;

      if (scope.type === 'collection') {
        const nextData = (currentData as TrainingErrorItemType[]).filter(
          (item) => String(item._id) !== targetDataId
        );
        const removedCount = currentData.length - nextData.length;
        if (removedCount === 0) return;

        trainingErrorDataRef.current = nextData;
        setData(nextData);
        setTotal((prev) => Math.max(prev - removedCount, 0));
        return;
      }

      let removedGroupCount = 0;
      let removedItemCount = 0;
      const nextData = (currentData as TrainingErrorGroupType[]).reduce<TrainingErrorGroupType[]>(
        (groups, group) => {
          if (
            targetCollectionId !== undefined &&
            String(group.collection.collectionId) !== targetCollectionId
          ) {
            groups.push(group);
            return groups;
          }

          const nextItems = group.items.filter((item) => String(item._id) !== targetDataId);
          const currentRemovedItemCount = group.items.length - nextItems.length;
          if (currentRemovedItemCount === 0) {
            groups.push(group);
            return groups;
          }

          removedItemCount += currentRemovedItemCount;
          const nextErrorCount = Math.max(group.errorCount - currentRemovedItemCount, 0);
          if (nextErrorCount === 0) {
            removedGroupCount += 1;
            return groups;
          }

          groups.push({
            ...group,
            items: nextItems,
            errorCount: nextErrorCount,
            hasMoreItems: nextItems.length < nextErrorCount
          });
          return groups;
        },
        []
      );

      if (removedItemCount === 0) return;

      trainingErrorDataRef.current = nextData;
      setData(nextData);
      if (removedGroupCount > 0) {
        setTotal((prev) => Math.max(prev - removedGroupCount, 0));
      }
    }
  );
  const clearLocalErrorData = useMemoizedFn(() => {
    trainingErrorDataRef.current = [];
    setData([]);
    setTotal(0);
  });

  const { runAsync: getData, loading: getDataLoading } = useRequest(
    (data: { collectionId: string; dataId: string }) => {
      return getTrainingDataDetail(data);
    },
    {
      manual: true,
      onSuccess: (data) => {
        setEditChunk(data);
      }
    }
  );
  const { runAsync: deleteData, loading: deleteLoading } = useRequest(
    (data: { collectionId: string; dataId: string }) => {
      return deleteTrainingData(data);
    },
    {
      manual: true,
      onSuccess: (_, [deletedItem]) => {
        removeHandledItemFromLocalData(deletedItem);
        onRefresh?.();
      }
    }
  );
  const { runAsync: updateData, loading: updateLoading } = useRequest(
    (data: UpdateTrainingDataBody) => {
      return updateTrainingData(data);
    },
    {
      manual: true,
      onSuccess: (_, [updatedData]) => {
        if (updatedData.dataId) {
          removeHandledItemFromLocalData({
            collectionId: updatedData.collectionId,
            dataId: updatedData.dataId
          });
        } else {
          clearLocalErrorData();
        }
        onRefresh?.();
        setEditChunk(undefined);
      }
    }
  );
  const { runAsync: loadMoreGroupItems, loading: loadMoreGroupItemsLoading } = useRequest(
    (group: TrainingErrorGroupType) => {
      if (scope.type !== 'dataset') return Promise.reject('scope error');

      return getDatasetTrainingError({
        datasetId: scope.datasetId,
        collectionId: String(group.collection.collectionId),
        offset: 0,
        pageSize: 1,
        itemOffset: group.items.length,
        itemPageSize: datasetGroupItemPageSize
      });
    },
    {
      manual: true,
      onSuccess: (res, [group]) => {
        const nextGroup = res.list[0] as TrainingErrorGroupType | undefined;
        if (!nextGroup || nextGroup.items.length === 0) {
          pendingDatasetScrollTopRef.current = undefined;
          return;
        }

        const targetCollectionId = String(group.collection.collectionId);
        setData((prev) => {
          const nextData = prev.map((item) => {
            if (!('items' in item)) return item;
            if (String(item.collection.collectionId) !== targetCollectionId) return item;

            const loadedItemIds = new Set(item.items.map((chunk) => String(chunk._id)));
            const appendItems = nextGroup.items.filter(
              (chunk) => !loadedItemIds.has(String(chunk._id))
            );

            return {
              ...item,
              items: [...item.items, ...appendItems],
              errorCount: nextGroup.errorCount,
              hasMoreItems: nextGroup.hasMoreItems
            };
          });
          trainingErrorDataRef.current = nextData;
          return nextData;
        });
        const scrollTop = pendingDatasetScrollTopRef.current;
        pendingDatasetScrollTopRef.current = undefined;

        if (scrollTop !== undefined) {
          requestAnimationFrame(() => {
            if (datasetScrollRef.current) {
              datasetScrollRef.current.scrollTop = scrollTop;
            }
          });
        }
      },
      onError: () => {
        pendingDatasetScrollTopRef.current = undefined;
      }
    }
  );

  const getItemCollectionId = (item: TrainingErrorItemType) => String(item.collectionId);
  const checkPermission = (hasPermission: boolean) => {
    if (hasPermission) return true;

    toast({
      title: t('common:error_un_permission'),
      status: 'warning'
    });
    return false;
  };
  const handleRetryItem = (item: TrainingErrorItemType) => {
    if (!checkPermission(permission.hasWritePer)) return;

    return updateData({
      collectionId: getItemCollectionId(item),
      dataId: String(item._id)
    });
  };
  const handleEditItem = (item: TrainingErrorItemType) => {
    if (!checkPermission(permission.hasWritePer)) return;

    const collectionId = getItemCollectionId(item);
    return getData({ collectionId, dataId: String(item._id) });
  };
  const handleDeleteItem = (item: TrainingErrorItemType) => {
    if (!checkPermission(permission.hasManagePer)) return;

    const collectionId = getItemCollectionId(item);
    return deleteData({ collectionId, dataId: String(item._id) });
  };
  const handleRetryAll = async () => {
    if (!checkPermission(permission.hasWritePer)) return;

    if (scope.type === 'collection') {
      await updateData({
        collectionId: scope.collectionId
      });
      return;
    }

    await updateData({
      datasetId: scope.datasetId
    });
    onClose?.();
  };
  const captureDatasetScrollTop = () => {
    if (scope.type !== 'dataset') return;

    pendingDatasetScrollTopRef.current = datasetScrollRef.current?.scrollTop;
  };
  const handleLoadMoreMouseDown = (e: MouseEvent<HTMLButtonElement>) => {
    /*
      Chakra Button 在 isLoading 时会 disabled，若按钮先获得焦点，Modal 的 FocusLock
      会在失焦后把焦点恢复到弹窗内其它按钮并带动内部滚动。鼠标点击加载更多不需要抢焦点。
    */
    e.preventDefault();
    captureDatasetScrollTop();
  };
  const handleLoadMoreGroupItems = (group: TrainingErrorGroupType) => {
    captureDatasetScrollTop();
    loadMoreGroupItems(group);
  };

  const datasetGroups = useMemo(() => {
    if (scope.type !== 'dataset') return [] as TrainingErrorGroupType[];

    const groupMap = new Map<string, TrainingErrorGroupType>();
    for (const group of data as TrainingErrorGroupType[]) {
      const collectionId = String(group.collection.collectionId);
      const existGroup = groupMap.get(collectionId);

      if (existGroup) {
        existGroup.items.push(...group.items);
      } else {
        groupMap.set(collectionId, {
          ...group,
          items: [...group.items]
        });
      }
    }

    return Array.from(groupMap.values());
  }, [data, scope.type]);

  const collectionItems = data as TrainingErrorItemType[];
  const listLoading = isLoading;
  // 操作按钮保持独立 loading，不遮罩列表；但操作进行中锁住滚动分页，避免 offset 和后端变更并发错位。
  const listRequestLocked = isLoading || updateLoading || getDataLoading || deleteLoading;
  const pageNoMore = data.length >= total;
  const collectionScroll = useScroll(collectionScrollRef);
  const loadMoreCollectionItems = useMemoizedFn(() => {
    if (scope.type !== 'collection' || listRequestLocked || pageNoMore) return;

    fetchData({ init: false, ScrollContainerRef: collectionScrollRef });
  });
  const loadMoreDatasetGroups = useMemoizedFn(() => {
    if (scope.type !== 'dataset' || listRequestLocked || pageNoMore) return;

    fetchData({ init: false, ScrollContainerRef: datasetScrollRef });
  });

  useThrottleEffect(
    () => {
      if (scope.type !== 'collection' || listRequestLocked || pageNoMore) return;

      const scrollContainer = collectionScrollRef.current;
      if (!scrollContainer || collectionItems.length === 0) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        loadMoreCollectionItems();
      }
    },
    [collectionScroll],
    { wait: 50 }
  );

  useEffect(() => {
    if (scope.type !== 'collection') return;

    if (collectionItems.length === 0) {
      collectionAutoFillOffsetRef.current = undefined;
      return;
    }

    if (listRequestLocked || pageNoMore) return;

    const scrollContainer = collectionScrollRef.current;
    if (!scrollContainer) return;

    const { scrollHeight, clientHeight } = scrollContainer;
    if (scrollHeight > clientHeight) return;
    if (collectionAutoFillOffsetRef.current === collectionItems.length) return;

    collectionAutoFillOffsetRef.current = collectionItems.length;
    loadMoreCollectionItems();
  }, [collectionItems.length, listRequestLocked, pageNoMore, loadMoreCollectionItems, scope.type]);

  useEffect(() => {
    if (scope.type !== 'dataset') return;

    if (data.length === 0) {
      datasetAutoFillOffsetRef.current = undefined;
      return;
    }

    if (listRequestLocked || pageNoMore) return;

    const scrollContainer = datasetScrollRef.current;
    if (!scrollContainer) return;

    const { scrollHeight, clientHeight } = scrollContainer;
    if (scrollHeight > clientHeight) return;
    if (datasetAutoFillOffsetRef.current === data.length) return;

    datasetAutoFillOffsetRef.current = data.length;
    loadMoreDatasetGroups();
  }, [listRequestLocked, data.length, loadMoreDatasetGroups, pageNoMore, scope.type]);

  if (editChunk) {
    return (
      <TrainingErrorEditView
        loading={updateLoading}
        editChunk={editChunk}
        onCancel={() => setEditChunk(undefined)}
        onSave={(formData) => {
          if (!checkPermission(permission.hasWritePer)) return;

          updateData({
            collectionId: String(editChunk.collectionId),
            dataId: String(editChunk._id),
            ...formData
          });
        }}
      />
    );
  }

  return (
    <>
      {scope.type === 'collection' ? (
        <MyBox ref={collectionScrollRef} h={'400px'} overflowY={'auto'} isLoading={listLoading}>
          <TableContainer fontSize={'12px'}>
            <Table variant={'simple'}>
              <Thead>
                <Tr>
                  <Th pr={0}>{t('dataset:dataset.Chunk_Number')}</Th>
                  <Th pr={0}>{t('dataset:dataset.Training_Status')}</Th>
                  <Th>{t('dataset:dataset.Error_Message')}</Th>
                  <Th w={'220px'}>{t('dataset:dataset.Operation')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {collectionItems.map((item) => (
                  <Tr key={String(item._id)}>
                    <Td>{item.chunkIndex + 1}</Td>
                    <Td>
                      <TrainingStageText item={item} />
                    </Td>
                    <Td maxW={50}>
                      <ErrorMessage errorMsg={item.errorMsg} />
                    </Td>
                    <Td w={'220px'} px={3}>
                      <ActionButtons
                        item={item}
                        isRetryLoading={updateLoading}
                        isEditLoading={getDataLoading}
                        isDeleteLoading={deleteLoading}
                        onRetry={handleRetryItem}
                        onEdit={handleEditItem}
                        onDelete={handleDeleteItem}
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
          {total === 0 && !listLoading && <EmptyTip text={t('dataset:training_error_empty')} />}
        </MyBox>
      ) : (
        <ScrollData
          maxH={'60vh'}
          pr={1}
          ScrollContainerRef={datasetScrollRef}
          isLoading={listLoading}
        >
          <Flex flexDir={'column'} gap={4}>
            {datasetGroups.map((group, index) => (
              <Box key={String(group.collection.collectionId)}>
                <Flex alignItems={'center'} gap={2} minW={0}>
                  <Box
                    color={'myGray.900'}
                    fontWeight={500}
                    fontSize={'12px'}
                    lineHeight={'16px'}
                    whiteSpace={'pre'}
                  >
                    {`${index + 1} `}
                  </Box>
                  <RawSourceBox
                    collectionId={group.collection.collectionId}
                    collectionType={group.collection.type as DatasetCollectionTypeEnum}
                    sourceName={group.collection.sourceName || group.collection.name}
                    sourceId={group.collection.sourceId}
                    canView={false}
                    alignItems={'center'}
                    fontSize={'12px'}
                    lineHeight={'16px'}
                    color={'myGray.900'}
                    minW={0}
                  />
                </Flex>
                <Box pl={6} py={2.5}>
                  <Box bg={'#FBFBFC'} borderRadius={'8px'} px={4} py={4}>
                    <Flex flexDir={'column'} gap={2.5}>
                      {group.items.map((item) => (
                        <Flex key={String(item._id)} alignItems={'center'} h={'28px'} gap={'32px'}>
                          <Box w={'180px'} flexShrink={0} minW={0}>
                            <TrainingStageText item={item} />
                          </Box>
                          <Box flex={'1 1 auto'} minW={0}>
                            <ErrorMessage errorMsg={item.errorMsg} />
                          </Box>
                          <Box flexShrink={0}>
                            <ActionButtons
                              item={item}
                              isRetryLoading={updateLoading}
                              isEditLoading={getDataLoading}
                              isDeleteLoading={deleteLoading}
                              onRetry={handleRetryItem}
                              onEdit={handleEditItem}
                              onDelete={handleDeleteItem}
                            />
                          </Box>
                        </Flex>
                      ))}
                    </Flex>
                    {group.hasMoreItems && (
                      <Button
                        variant={'ghost'}
                        display={'flex'}
                        mx={'auto'}
                        mt={2.5}
                        h={'20px'}
                        minH={'20px'}
                        px={1.5}
                        minW={0}
                        fontSize={'11px'}
                        lineHeight={'14px'}
                        color={'myGray.400'}
                        _hover={{ bg: 'transparent', color: 'myGray.500' }}
                        _active={{ bg: 'transparent' }}
                        isLoading={loadMoreGroupItemsLoading}
                        onMouseDown={handleLoadMoreMouseDown}
                        onClick={() => handleLoadMoreGroupItems(group)}
                      >
                        {t('common:request_more')}
                      </Button>
                    )}
                  </Box>
                </Box>
              </Box>
            ))}
          </Flex>
        </ScrollData>
      )}

      {showFooter && (
        <Flex justifyContent={'flex-end'} gap={3} mt={6}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          {total > 0 && (
            <Button
              variant={'primary'}
              color={'white'}
              isLoading={updateLoading}
              onClick={handleRetryAll}
            >
              {t('dataset:retry_all')}
            </Button>
          )}
        </Flex>
      )}
    </>
  );
};

export default TrainingErrorList;
