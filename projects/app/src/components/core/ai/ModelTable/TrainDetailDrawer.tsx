import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  HStack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { EmbeddingTrainTaskStatusEnum } from '@fastgpt/global/core/train/embedding/constants';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import type {
  RerankTrainTaskListItem,
  ListRerankTrainTasksRequest
} from '@fastgpt/global/core/train/rerank/api';
import type {
  EmbeddingTrainTaskListItem,
  ListEmbeddingTrainTasksRequest
} from '@fastgpt/global/core/train/embedding/api';
import type { EnhancedErrorMessage as RerankEnhancedErrorMessage } from '@fastgpt/global/core/train/rerank/error';
import type { EnhancedErrorMessage as EmbeddingEnhancedErrorMessage } from '@fastgpt/global/core/train/embedding/error';
import TrainExceptionModal from './TrainExceptionModal';
import TrainStatusFilter, { type TrainStatusFilterOption } from './TrainStatusFilter';
import { getDatasetsWithChildren } from '@/web/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import { getEmbeddingTrainTaskList, getRerankTrainTaskList } from '@/web/core/app/api/train';
import type { ModelTabType } from './types';
import { modelTableTabValues } from './types';
import {
  getTrainTaskStatusText,
  isFailedTrainTaskStatus,
  isRunningTrainTaskStatus,
  isPendingTrainTaskStatus,
  isCompletedTrainTaskStatus
} from './helpers/trainStatus';
import { useTrainTask } from './hooks/useTrainTask';

type TrainTaskItem = RerankTrainTaskListItem | EmbeddingTrainTaskListItem;
type TrainTaskErrorMessage = RerankEnhancedErrorMessage | EmbeddingEnhancedErrorMessage;
type TrainSortField = 'createTime';
type TrainTaskStatusStyle = {
  color: string;
  bg: string;
};
const trainTaskStatusStyleMap: Record<string, TrainTaskStatusStyle> = {
  [EmbeddingTrainTaskStatusEnum.pending]: {
    color: '#667085',
    bg: '#F2F4F7'
  },
  [EmbeddingTrainTaskStatusEnum.running]: {
    color: '#3370FF',
    bg: '#F0F4FF'
  },
  [EmbeddingTrainTaskStatusEnum.failed]: {
    color: '#F04438',
    bg: '#FEF3F2'
  },
  [EmbeddingTrainTaskStatusEnum.completed]: {
    color: '#039855',
    bg: '#EDFBF3'
  }
};

type DatasetInfo = {
  datasetNameMap: Record<string, string>;
  allDatasetIds: string[];
};

type DatasetTreeItem = DatasetListItemType & {
  children?: DatasetTreeItem[];
};

type Props = {
  onClose: () => void;
  onSuccess?: () => void;
  modelId: string;
  modelName: string;
  baseModelType: ModelTypeEnum.embedding | ModelTypeEnum.rerank;
  tabType: ModelTabType;
};

const TrainDetailDrawer = ({
  onClose,
  onSuccess,
  modelId,
  modelName,
  baseModelType,
  tabType
}: Props) => {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<TrainSortField | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>(undefined);
  const [selectedError, setSelectedError] = useState<{
    taskId: string;
    errorMsg: TrainTaskErrorMessage;
  } | null>(null);
  const [datasetInfo, setDatasetInfo] = useState<DatasetInfo>({
    datasetNameMap: {},
    allDatasetIds: []
  });
  const [isDatasetReady, setIsDatasetReady] = useState(false);

  const isRerank = baseModelType === ModelTypeEnum.rerank;
  const isPollingRef = useRef(false);
  const isPollingRefreshingRef = useRef(false);

  const requestParams = useMemo(
    () => ({
      pageSize: 20,
      baseModelId: modelId,
      sortField: 'createTime' as const,
      sortOrder,
      ...(selectedStatus ? { status: selectedStatus } : {})
    }),
    [modelId, sortOrder, selectedStatus]
  );

  const {
    data: trainTasks,
    isLoading,
    ScrollData,
    refreshList
  } = isRerank
    ? useScrollPagination<
        ListRerankTrainTasksRequest,
        { list: RerankTrainTaskListItem[]; total: number }
      >(getRerankTrainTaskList, {
        pageSize: 20,
        params: requestParams as Omit<ListRerankTrainTasksRequest, 'offset' | 'pageSize'>,
        refreshDeps: [modelId, sortOrder, isRerank, selectedStatus],
        showNoMore: false
      })
    : useScrollPagination<
        ListEmbeddingTrainTasksRequest,
        { list: EmbeddingTrainTaskListItem[]; total: number }
      >(getEmbeddingTrainTaskList, {
        pageSize: 20,
        params: requestParams as Omit<ListEmbeddingTrainTasksRequest, 'offset' | 'pageSize'>,
        refreshDeps: [modelId, sortOrder, isRerank, selectedStatus],
        showNoMore: false
      });

  const {
    DeleteConfirmModal,
    retryingTaskIds,
    deletingTaskIds,
    downloadingTaskIds,
    onRetryTask,
    onDownloadData,
    handleDeleteTask
  } = useTrainTask({
    t,
    baseModelType,
    onSuccess,
    refreshList
  });

  const hasRunningTasks = useMemo(
    () => trainTasks.some((task) => isRunningTrainTaskStatus(task.status)),
    [trainTasks]
  );

  useEffect(() => {
    if (!hasRunningTasks) return;

    const timer = window.setInterval(async () => {
      if (isPollingRefreshingRef.current) return;

      isPollingRefreshingRef.current = true;
      isPollingRef.current = true;
      try {
        await refreshList({ silent: true });
      } finally {
        isPollingRef.current = false;
        isPollingRefreshingRef.current = false;
      }
    }, 15000);

    return () => {
      window.clearInterval(timer);
      isPollingRef.current = false;
      isPollingRefreshingRef.current = false;
    };
  }, [hasRunningTasks, refreshList]);

  const actualIsLoading = isLoading && !isPollingRef.current;

  const statusOptions = useMemo<TrainStatusFilterOption[]>(
    () =>
      Object.keys(trainTaskStatusStyleMap).map((status) => ({
        key: status,
        label: getTrainTaskStatusText(status, t)
      })),
    [t]
  );

  const { runAsync: loadDatasets } = useRequest(
    async () => {
      const datasets = await getDatasetsWithChildren({
        parentId: null
      });

      const reduceDatasets = (items: DatasetTreeItem[], acc: DatasetInfo): DatasetInfo => {
        items.forEach((dataset) => {
          if (dataset.type === DatasetTypeEnum.folder) {
            if (dataset.children?.length) {
              reduceDatasets(dataset.children as DatasetTreeItem[], acc);
            }
            return;
          }

          acc.allDatasetIds.push(dataset._id);
          acc.datasetNameMap[dataset._id] = dataset.name;

          if (dataset.children?.length) {
            reduceDatasets(dataset.children as DatasetTreeItem[], acc);
          }
        });

        return acc;
      };

      return reduceDatasets(datasets as DatasetTreeItem[], {
        datasetNameMap: {},
        allDatasetIds: []
      });
    },
    {
      errorToast: '',
      onSuccess: (res) => {
        setDatasetInfo(res);
        setIsDatasetReady(true);
      },
      onError: () => {
        setDatasetInfo({
          datasetNameMap: {},
          allDatasetIds: []
        });
        setIsDatasetReady(true);
      }
    }
  );

  useEffect(() => {
    setIsDatasetReady(false);
    loadDatasets();
  }, [modelId, loadDatasets]);

  const toggleSort = useCallback(() => {
    setSortBy((prev) => {
      if (prev === 'createTime') {
        setSortOrder((prevOrder) => (prevOrder === 'asc' ? 'desc' : 'asc'));
        return 'createTime';
      }
      setSortOrder('asc');
      return 'createTime';
    });
  }, []);

  const renderSortIcon = useCallback(
    (field: TrainSortField) => {
      if (sortBy !== field) {
        return (
          <MyIcon
            name={'common/table/sort'}
            w={'12px'}
            cursor={'pointer'}
            color={'myGray.400'}
            _hover={{ color: 'primary.600' }}
          />
        );
      }

      return (
        <MyIcon
          name={sortOrder === 'asc' ? 'common/table/asc' : 'common/table/desc'}
          w={'12px'}
          cursor={'pointer'}
          color={'primary.600'}
        />
      );
    },
    [sortBy, sortOrder]
  );

  const handleCloseErrorModal = useCallback(() => {
    setSelectedError(null);
  }, []);

  const handleRetryErrorTask = useCallback(() => {
    if (!selectedError?.taskId) return;
    void onRetryTask(selectedError.taskId);
    handleCloseErrorModal();
  }, [handleCloseErrorModal, onRetryTask, selectedError]);

  const getTaskMetrics = useCallback(
    (task: TrainTaskItem) => {
      const baseDetailed = task.result?.baseModelEvalResult?.detailed_results;
      const tunedDetailed = task.result?.tunedModelEvalResult?.detailed_results;

      if (isRerank) {
        return {
          precision5Before: baseDetailed?.rerank_top5_precision,
          precision5After: tunedDetailed?.rerank_top5_precision,
          precision10Before: baseDetailed?.rerank_top10_precision,
          precision10After: tunedDetailed?.rerank_top10_precision,
          mrr10Before: baseDetailed?.rerank_top10_mrr,
          mrr10After: tunedDetailed?.rerank_top10_mrr
        };
      }

      return {
        precision5Before: baseDetailed?.embed_top5_precision,
        precision5After: tunedDetailed?.embed_top5_precision,
        precision10Before: baseDetailed?.embed_top10_precision,
        precision10After: tunedDetailed?.embed_top10_precision,
        mrr10Before: baseDetailed?.embed_top10_mrr,
        mrr10After: tunedDetailed?.embed_top10_mrr
      };
    },
    [isRerank]
  );

  const getTrainDatasetDisplay = useCallback(
    (item: TrainTaskItem) => {
      const currentDatasetIds = Array.from(new Set((item.datasetIds || []).filter(Boolean)));
      const { allDatasetIds, datasetNameMap } = datasetInfo;

      if (
        allDatasetIds.length > 0 &&
        currentDatasetIds.length === allDatasetIds.length &&
        allDatasetIds.every((datasetId) => currentDatasetIds.includes(datasetId))
      ) {
        return t('account_model:all_datasets');
      }

      const names = currentDatasetIds
        .map((datasetId) => datasetNameMap[datasetId])
        .filter((name): name is string => Boolean(name));

      if (names.length > 0) {
        return names.join('、');
      }

      if (!isDatasetReady && currentDatasetIds.length > 0) {
        return '-';
      }

      return '-';
    },
    [datasetInfo, isDatasetReady, t]
  );

  const renderStatus = useCallback(
    (item: TrainTaskItem) => {
      const statusText = getTrainTaskStatusText(item.status, t);
      const statusStyle = trainTaskStatusStyleMap[item.status];
      const tagProps = {
        type: 'fill' as const,
        h: '22px',
        fontSize: '10px',
        lineHeight: '10px',
        color: statusStyle.color,
        bg: statusStyle.bg,
        borderColor: 'transparent'
      };

      if (isFailedTrainTaskStatus(item.status) && item.errorMsg) {
        return (
          <MyTooltip label={t('common:Click_to_expand')}>
            <MyTag
              {...tagProps}
              cursor={'pointer'}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedError({
                  taskId: item._id,
                  errorMsg: item.errorMsg as TrainTaskErrorMessage
                });
              }}
            >
              <Flex fontWeight={'medium'} alignItems={'center'} gap={1}>
                {statusText}
                <MyIcon name={'common/maximize'} w={'11px'} color={statusStyle.color} />
              </Flex>
            </MyTag>
          </MyTooltip>
        );
      }

      return <MyTag {...tagProps}>{statusText}</MyTag>;
    },
    [t]
  );

  const renderMetricRow = useCallback(
    (label: string, before?: number, after?: number, isPercent = true) => {
      if (before === undefined && after === undefined) return null;

      // 先按显示精度四舍五入，再比较，避免因多余小数位导致显示一致但箭头变红
      const round = (v: number) =>
        isPercent ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100;
      const roundedBefore = before !== undefined ? round(before) : undefined;
      const roundedAfter = after !== undefined ? round(after) : undefined;
      const isWorse =
        roundedAfter !== undefined && roundedBefore !== undefined && roundedAfter < roundedBefore;

      const formatVal = (v?: number) => {
        if (v === undefined) return '-';
        return isPercent ? `${(v * 100).toFixed(1)}%` : v.toFixed(2);
      };

      return (
        <HStack spacing={1} key={label}>
          <Text color={'myGray.500'} fontSize={'xs'} minW={'88px'}>
            {label}:
          </Text>
          <Text color={'myGray.700'} fontSize={'xs'}>
            {formatVal(before)}
          </Text>
          <MyIcon name={'common/arrowRight'} w={'14px'} color={isWorse ? 'red.500' : '#039855'} />
          <Text color={'myGray.700'} fontSize={'xs'}>
            {formatVal(after)}
          </Text>
          {isWorse && tabType !== modelTableTabValues.base && (
            <MyTooltip label={t('account_model:train_detail_result_worse_tip')}>
              <MyIcon name={'infoRounded'} w={'14px'} color={'red.500'} cursor={'pointer'} />
            </MyTooltip>
          )}
        </HStack>
      );
    },
    [t, tabType]
  );

  const renderResult = useCallback(
    (item: TrainTaskItem) => {
      const metrics = getTaskMetrics(item);
      const hasData = Object.values(metrics).some((value) => value !== undefined);

      if (!hasData) {
        return <Text color={'myGray.500'}>-</Text>;
      }

      return (
        <Flex flexDirection={'column'} gap={1}>
          {renderMetricRow('Hit@10', metrics.precision10Before, metrics.precision10After, true)}
          {renderMetricRow('MRR@10', metrics.mrr10Before, metrics.mrr10After, false)}
        </Flex>
      );
    },
    [getTaskMetrics, renderMetricRow]
  );

  const renderOperations = useCallback(
    (item: TrainTaskItem) => {
      const menuButton = (
        <Button
          variant={'outline'}
          size={'xs'}
          minW={'36px'}
          h={'28px'}
          px={0}
          borderRadius={'8px'}
          borderColor={'myGray.200'}
          bg={'white'}
          _hover={{ bg: 'myGray.50', borderColor: 'myGray.300' }}
          _active={{ bg: 'myGray.100' }}
        >
          <MyIcon name={'more'} w={'16px'} color={'myGray.500'} />
        </Button>
      );

      if (isPendingTrainTaskStatus(item.status)) {
        const isDeleting = deletingTaskIds.has(item._id);

        return (
          <MyMenu
            trigger={'click'}
            Button={menuButton}
            menuList={[
              {
                children: [
                  {
                    type: 'danger',
                    icon: isDeleting ? 'common/loading' : 'common/trash',
                    label: t('common:Delete'),
                    onClick: () => handleDeleteTask(item._id),
                    menuItemStyles: isDeleting
                      ? { isDisabled: true, opacity: 0.6, cursor: 'not-allowed' }
                      : undefined
                  }
                ]
              }
            ]}
          />
        );
      }

      if (isRunningTrainTaskStatus(item.status)) {
        return (
          <MyMenu
            trigger={'click'}
            Button={menuButton}
            menuList={[
              {
                children: [
                  {
                    type: 'danger',
                    icon: 'common/trash',
                    label: t('common:Delete'),
                    onClick: () => handleDeleteTask(item._id),
                    menuItemStyles: deletingTaskIds.has(item._id)
                      ? { isDisabled: true, opacity: 0.6, cursor: 'not-allowed' }
                      : undefined
                  }
                ]
              }
            ]}
          />
        );
      }

      if (isFailedTrainTaskStatus(item.status)) {
        const isRetrying = retryingTaskIds.has(item._id);
        const isDeleting = deletingTaskIds.has(item._id);

        return (
          <MyMenu
            trigger={'click'}
            Button={menuButton}
            menuList={[
              {
                children: [
                  {
                    icon: isRetrying ? 'common/loading' : 'common/retryLight',
                    label: t('app:retry'),
                    onClick: () => onRetryTask(item._id),
                    menuItemStyles: isRetrying
                      ? { isDisabled: true, opacity: 0.6, cursor: 'not-allowed' }
                      : undefined
                  },
                  {
                    type: 'danger',
                    icon: isDeleting ? 'common/loading' : 'common/trash',
                    label: t('common:Delete'),
                    onClick: () => handleDeleteTask(item._id),
                    menuItemStyles: isDeleting
                      ? { isDisabled: true, opacity: 0.6, cursor: 'not-allowed' }
                      : undefined
                  }
                ]
              }
            ]}
          />
        );
      }

      if (isCompletedTrainTaskStatus(item.status)) {
        const isDownloading = downloadingTaskIds.has(item._id);
        const isDeleting = deletingTaskIds.has(item._id);

        return (
          <MyMenu
            trigger={'click'}
            Button={menuButton}
            menuList={[
              {
                children: [
                  {
                    icon: isDownloading ? 'common/loading' : 'common/download',
                    label: t('account_model:train_detail_download_data'),
                    onClick: () => onDownloadData(item._id),
                    menuItemStyles: isDownloading
                      ? { isDisabled: true, opacity: 0.6, cursor: 'not-allowed' }
                      : undefined
                  },
                  {
                    type: 'danger',
                    icon: isDeleting ? 'common/loading' : 'common/trash',
                    label: t('common:Delete'),
                    onClick: () => handleDeleteTask(item._id, true),
                    menuItemStyles: isDeleting
                      ? { isDisabled: true, opacity: 0.6, cursor: 'not-allowed' }
                      : undefined
                  }
                ]
              }
            ]}
          />
        );
      }

      return null;
    },
    [
      deletingTaskIds,
      downloadingTaskIds,
      handleDeleteTask,
      onDownloadData,
      onRetryTask,
      retryingTaskIds,
      t
    ]
  );

  const resultTipLabel = useMemo(
    () => (
      <Box fontSize={'xs'} whiteSpace={'pre-wrap'} maxW={'300px'}>
        {baseModelType === ModelTypeEnum.rerank
          ? t('account_model:train_detail_rerank_result_tip')
          : t('account_model:train_detail_embedding_result_tip')}
      </Box>
    ),
    [t, baseModelType]
  );

  return (
    <>
      <Drawer isOpen placement="right" onClose={onClose} size="full">
        <DrawerOverlay />
        <DrawerContent maxW={'1000px'}>
          <DrawerHeader
            borderBottomWidth={'1px'}
            borderColor={'myGray.200'}
            bg={'myGray.50'}
            py={3}
            px={5}
          >
            <Flex alignItems={'center'} justifyContent={'space-between'}>
              {tabType === modelTableTabValues.base ? (
                <Text fontWeight={'semibold'} fontSize={'md'}>
                  {modelName}
                </Text>
              ) : (
                <HStack spacing={2}>
                  <Text fontWeight={'semibold'} fontSize={'md'}>
                    {modelName}
                  </Text>
                  <Box
                    fontSize={'xs'}
                    color={'myGray.500'}
                    bg={'myGray.100'}
                    px={2}
                    py={0.5}
                    borderRadius={'sm'}
                    fontWeight={'normal'}
                  >
                    {t('account_model:train_detail_base')}: {baseModelType}
                  </Box>
                </HStack>
              )}
              <DrawerCloseButton position={'relative'} top={0} right={0} />
            </Flex>
          </DrawerHeader>
          <DrawerBody p={0} overflowY={'auto'}>
            <ScrollData isLoading={actualIsLoading}>
              <Table variant={'simple'}>
                <Thead bg={'myGray.50'} position={'sticky'} top={0} zIndex={1}>
                  <Tr>
                    <Th>
                      <HStack
                        spacing={1}
                        cursor={'pointer'}
                        userSelect={'none'}
                        onClick={toggleSort}
                      >
                        <Text>{t('account_model:train_detail_train_time')}</Text>
                        {renderSortIcon('createTime')}
                      </HStack>
                    </Th>
                    <Th>{t('account_model:train_detail_new_model')}</Th>
                    <Th>{t('account_model:train_detail_trainer')}</Th>
                    <Th>
                      <TrainStatusFilter
                        label={t('account_model:train_detail_status')}
                        value={selectedStatus}
                        onChange={setSelectedStatus}
                        options={statusOptions}
                      />
                    </Th>
                    <Th>{t('account_model:train_data')}</Th>
                    <Th>
                      <HStack spacing={1}>
                        <Text>{t('account_model:train_detail_train_result')}</Text>
                        <QuestionTip label={resultTipLabel} maxW={'320px'} />
                      </HStack>
                    </Th>
                    <Th>{t('account_model:action')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {trainTasks.map((item) => (
                    <Tr key={item._id} _hover={{ bg: 'myGray.50' }}>
                      <Td fontSize={'sm'} whiteSpace={'nowrap'}>
                        <Text color={'myGray.700'}>{formatTime2YMDHMS(item.createTime)}</Text>
                      </Td>
                      <Td fontSize={'sm'} maxW={'180px'} w={'180px'}>
                        <MyTooltip label={item.newModelName}>
                          <Text
                            color={'myGray.700'}
                            overflow={'hidden'}
                            textOverflow={'ellipsis'}
                            whiteSpace={'nowrap'}
                            maxW={'160px'}
                            lineHeight={'20px'}
                          >
                            {item.newModelName || '-'}
                          </Text>
                        </MyTooltip>
                      </Td>
                      <Td fontSize={'sm'} color={'myGray.700'}>
                        {item.creatorName || '-'}
                      </Td>
                      <Td>{renderStatus(item)}</Td>
                      <Td fontSize={'sm'} maxW={'150px'} w={'150px'}>
                        <MyTooltip label={getTrainDatasetDisplay(item)}>
                          <Text
                            color={'myGray.700'}
                            overflow={'hidden'}
                            textOverflow={'ellipsis'}
                            whiteSpace={'nowrap'}
                            maxW={'130px'}
                            lineHeight={'20px'}
                          >
                            {getTrainDatasetDisplay(item)}
                          </Text>
                        </MyTooltip>
                      </Td>
                      <Td>{renderResult(item)}</Td>
                      <Td>{renderOperations(item)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </ScrollData>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <TrainExceptionModal
        error={
          selectedError
            ? {
                taskId: selectedError.taskId,
                errorMsg: selectedError.errorMsg as RerankEnhancedErrorMessage
              }
            : null
        }
        onClose={handleCloseErrorModal}
        onRetry={handleRetryErrorTask}
        isRetrying={selectedError ? retryingTaskIds.has(selectedError.taskId) : false}
      />

      <DeleteConfirmModal />
    </>
  );
};

export default TrainDetailDrawer;
