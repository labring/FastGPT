import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Box,
  Flex,
  HStack,
  ModalBody,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyTag from '@fastgpt/web/components/common/Tag';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
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
import TrainExceptionModal from '@/pageComponents/app/detail/AutoLearn/TrainExceptionModal';
import { getDatasets } from '@/web/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getEmbeddingTrainTaskList, getRerankTrainTaskList } from '@/web/core/app/api/train';
import type { ModelTabType } from './types';
import { modelTableTabValues } from './types';
import {
  getTrainTaskStatusConfig,
  isFailedTrainTaskStatus,
  isRunningTrainTaskStatus
} from './helpers/trainStatus';
import { useTrainTask } from './hooks/useTrainTask';

type TrainTaskItem = RerankTrainTaskListItem | EmbeddingTrainTaskListItem;
type TrainTaskErrorMessage = RerankEnhancedErrorMessage | EmbeddingEnhancedErrorMessage;
type DatasetInfo = {
  datasetNameMap: Record<string, string>;
  allDatasetIds: string[];
};

type Props = {
  onClose: () => void;
  onSuccess?: () => void;
  modelId: string;
  modelName: string;
  baseModelType: ModelTypeEnum.embedding | ModelTypeEnum.rerank;
  tabType: ModelTabType;
};

const TrainDetailModal = ({
  onClose,
  onSuccess,
  modelId,
  modelName,
  baseModelType,
  tabType
}: Props) => {
  const { t } = useTranslation();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
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
      sortOrder
    }),
    [modelId, sortOrder]
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
        refreshDeps: [modelId, sortOrder, isRerank]
      })
    : useScrollPagination<
        ListEmbeddingTrainTasksRequest,
        { list: EmbeddingTrainTaskListItem[]; total: number }
      >(getEmbeddingTrainTaskList, {
        pageSize: 20,
        params: requestParams as Omit<ListEmbeddingTrainTasksRequest, 'offset' | 'pageSize'>,
        refreshDeps: [modelId, sortOrder, isRerank]
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

  const { runAsync: loadDatasets } = useRequest(
    async () => {
      const datasets = await getDatasets({
        parentId: null,
        type: DatasetTypeEnum.dataset
      });

      return datasets.reduce<DatasetInfo>(
        (acc, dataset) => {
          acc.allDatasetIds.push(dataset._id);
          acc.datasetNameMap[dataset._id] = dataset.name;
          return acc;
        },
        {
          datasetNameMap: {},
          allDatasetIds: []
        }
      );
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
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }, []);

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
      const config = getTrainTaskStatusConfig(item.status, t);

      if (isFailedTrainTaskStatus(item.status) && item.errorMsg) {
        return (
          <MyTooltip label={t('common:Click_to_expand')}>
            <MyTag
              colorSchema={config.colorSchema}
              type="fill"
              h={'28px'}
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
                {config.label}
                <MyIcon name={'common/maximize'} w={'11px'} />
              </Flex>
            </MyTag>
          </MyTooltip>
        );
      }

      return (
        <MyTag colorSchema={config.colorSchema} type="fill" h={'28px'}>
          {config.label}
        </MyTag>
      );
    },
    [t]
  );

  const renderMetricRow = useCallback(
    (label: string, before?: number, after?: number, isPercent = true) => {
      if (before === undefined && after === undefined) return null;
      const isWorse = after !== undefined && before !== undefined && after < before;
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
          {renderMetricRow('Precision@5', metrics.precision5Before, metrics.precision5After, true)}
          {renderMetricRow(
            'Precision@10',
            metrics.precision10Before,
            metrics.precision10After,
            true
          )}
          {renderMetricRow('MRR@10', metrics.mrr10Before, metrics.mrr10After, false)}
        </Flex>
      );
    },
    [getTaskMetrics, renderMetricRow]
  );

  const renderOperations = useCallback(
    (item: TrainTaskItem) => {
      if (isRunningTrainTaskStatus(item.status)) {
        return (
          <MyMenu
            trigger={'click'}
            Button={<MyIconButton icon={'more'} />}
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
            Button={<MyIconButton icon={'more'} />}
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

      if (getTrainTaskStatusConfig(item.status, t).colorSchema === 'green') {
        const isDownloading = downloadingTaskIds.has(item._id);

        return (
          <MyMenu
            trigger={'click'}
            Button={<MyIconButton icon={'more'} />}
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
      <MyModal
        isOpen
        onClose={onClose}
        title={
          tabType === modelTableTabValues.base ? (
            <Text fontWeight={'semibold'}>{modelName}</Text>
          ) : (
            <HStack spacing={2}>
              <Text fontWeight={'semibold'}>{modelName}</Text>
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
          )
        }
        w={'1000px'}
        maxW={'1000px'}
        h={'80vh'}
        isCentered
      >
        <ModalBody flex={1} h={0} overflowY={'auto'} p={0}>
          <ScrollData isLoading={actualIsLoading}>
            <Table variant={'simple'}>
              <Thead bg={'myGray.50'} position={'sticky'} top={0} zIndex={1}>
                <Tr>
                  <Th>
                    <HStack spacing={1}>
                      <Text>{t('account_model:train_detail_train_time')}</Text>
                      <MyIcon
                        name={'core/chat/chevronSelector'}
                        w={'16px'}
                        cursor={'pointer'}
                        _hover={{ color: 'primary.600' }}
                        onClick={toggleSort}
                      />
                    </HStack>
                  </Th>
                  <Th>{t('account_model:train_detail_new_model')}</Th>
                  <Th>{t('account_model:train_detail_trainer')}</Th>
                  <Th>{t('account_model:train_detail_status')}</Th>
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
                    <Td fontSize={'sm'} maxW={'150px'} w={'150px'}>
                      <MyTooltip label={item.newModelName}>
                        <Text
                          color={'myGray.700'}
                          overflow={'hidden'}
                          textOverflow={'ellipsis'}
                          whiteSpace={'nowrap'}
                          maxW={'130px'}
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
        </ModalBody>
      </MyModal>

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

export default TrainDetailModal;
