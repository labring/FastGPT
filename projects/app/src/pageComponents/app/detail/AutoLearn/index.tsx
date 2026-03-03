/**
 * @file 自动学习组件
 * @description 智能客服应用的自动学习功能页面，展示学习记录列表及评估数据
 */
import React, { useMemo, useCallback, useState } from 'react';
import { Flex, Box, Table, Thead, Tbody, Tr, Th, Td, Button, HStack, Text } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { format } from 'date-fns';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { AppContext } from '../context';
import {
  getRerankTrainTaskList,
  createRerankTrainTaskWithTrainset,
  retryRerankTrainTask,
  deleteRerankTrainTask,
  deleteAllRerankTrainTasksByApp
} from '@/web/core/app/api/train';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import type { RerankTrainTaskListItem } from '@fastgpt/global/core/train/rerank/api';
import type { EnhancedErrorMessage } from '@fastgpt/global/core/train/rerank/error';
import { cardStyles } from '../constants';
import TrainExceptionModal from './TrainExceptionModal';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';

const AutoLearn = () => {
  const { t } = useTranslation();
  // 从 AppContext 获取 appId
  const appId = useContextSelector(AppContext, (v) => v.appId);

  // 初始化恢复操作的确认弹窗
  const { openConfirm: openRestoreConfirm, ConfirmModal: RestoreConfirmModal } = useConfirm({
    type: 'delete',
    title: t('app:auto_learn.restore_confirm_title'),
    content: t('app:auto_learn.restore_confirm_content')
  });

  // 排序状态管理
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 错误详情 Modal 状态（包含 taskId 和错误信息）
  const [selectedError, setSelectedError] = useState<{
    taskId: string;
    errorMsg: EnhancedErrorMessage;
  } | null>(null);

  // 重试任务 loading 状态集合
  const [retryingTaskIds, setRetryingTaskIds] = useState<Set<string>>(new Set());

  // 删除任务 loading 状态集合
  const [deletingTaskIds, setDeletingTaskIds] = useState<Set<string>>(new Set());

  // 标记是否为轮询请求（用于抑制 loading 状态）
  const isPollingRef = React.useRef(false);

  // 空状态组件
  const EmptyTipDom = useMemo(() => <EmptyTip mt={0} text={t('app:auto_learn_no_records')} />, [t]);

  // 构建请求参数（包含排序参数）
  const requestParams = useMemo(() => {
    if (!appId) return {};

    return {
      appId,
      sortField: 'createTime',
      sortOrder: sortOrder
    };
  }, [appId, sortOrder]);

  // 使用滚动分页获取训练任务数据
  const {
    data: trainTasks,
    total,
    isLoading,
    ScrollData,
    refreshList
  } = useScrollPagination(getRerankTrainTaskList, {
    pageSize: 20,
    params: requestParams,
    EmptyTip: EmptyTipDom,
    refreshDeps: [appId, sortOrder],
    errorToast: t('app:fetch_learning_records_error')
  }) as {
    data: RerankTrainTaskListItem[];
    total: number;
    isLoading: boolean;
    ScrollData: any;
    refreshList: (options?: { silent?: boolean }) => void;
  };

  // 检查是否有正在运行或待处理的任务
  const hasRunningTasks = useMemo(
    () =>
      trainTasks.some(
        (task) =>
          task.status === RerankTrainTaskStatusEnum.pending ||
          task.status === RerankTrainTaskStatusEnum.running
      ),
    [trainTasks]
  );

  // 静默轮询正在运行的任务（15s 间隔）- 不显示 loading
  useRequest(
    async () => {
      if (!hasRunningTasks) return;
      isPollingRef.current = true;
      await refreshList({ silent: true });
      isPollingRef.current = false;
    },
    {
      manual: false,
      ready: hasRunningTasks,
      pollingInterval: hasRunningTasks ? 15000 : undefined,
      errorToast: '', // 轮询时抑制错误提示
      refreshDeps: [hasRunningTasks]
    }
  );

  // 使用 useRequest 处理开始学习
  const { runAsync: onStartLearn, loading: isStartLearning } = useRequest(
    async () => {
      if (!appId) throw new Error('App ID is required');

      // 调用创建训练任务接口
      const result = await createRerankTrainTaskWithTrainset({
        appId
      });

      return result;
    },
    {
      errorToast: t('app:operation_failed'),
      successToast: t('app:operation_success'),
      onSuccess: () => {
        // 创建成功后刷新列表
        refreshList();
      }
    }
  );

  // 使用 useRequest 处理重试训练任务
  const { runAsync: onRetryTask } = useRequest(
    async (taskId: string) => {
      if (!taskId) throw new Error('Task ID is required');

      // 添加到 loading 集合
      setRetryingTaskIds((prev) => new Set(prev).add(taskId));

      try {
        const result = await retryRerankTrainTask({ taskId });
        return result;
      } finally {
        // 无论成功或失败，都从 loading 集合中移除
        setRetryingTaskIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(taskId);
          return newSet;
        });
      }
    },
    {
      errorToast: t('app:operation_failed'),
      successToast: t('app:operation_success'),
      onSuccess: () => {
        refreshList();
      }
    }
  );

  // 使用 useRequest 处理删除训练任务
  const { runAsync: onDeleteTask } = useRequest(
    async (taskId: string) => {
      if (!taskId) throw new Error('Task ID is required');

      // 添加到 loading 集合
      setDeletingTaskIds((prev) => new Set(prev).add(taskId));

      try {
        const result = await deleteRerankTrainTask({ taskId });
        return result;
      } finally {
        // 无论成功或失败，都从 loading 集合中移除
        setDeletingTaskIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(taskId);
          return newSet;
        });
      }
    },
    {
      errorToast: t('app:operation_failed'),
      successToast: t('app:operation_success'),
      onSuccess: () => {
        refreshList();
      }
    }
  );

  // 使用 useRequest 处理恢复（删除所有训练任务）
  const { runAsync: onRestoreAllTasks, loading: isRestoring } = useRequest(
    async () => {
      if (!appId) throw new Error('App ID is required');

      const result = await deleteAllRerankTrainTasksByApp({ appId });
      return result;
    },
    {
      errorToast: t('app:auto_learn.restore_failed'),
      successToast: t('app:auto_learn.restore_success'),
      onSuccess: () => {
        refreshList();
      }
    }
  );

  // 使用 useRequest 处理下载评测数据
  const { runAsync: onDownloadData } = useRequest(
    async (taskId: string) => {
      if (!taskId) throw new Error('Task ID is required');

      // 准备国际化的列名
      const headers = {
        question: t('app:eval_detail_question_column'),
        bestMatchContext: t('app:eval_detail_best_match_context_column'),
        collectionName: t('app:eval_detail_collection_name_column'),
        rankBefore: t('app:eval_detail_rank_before_column'),
        rankAfter: t('app:eval_detail_rank_after_column'),
        improvement: t('app:eval_detail_improvement_column')
      };

      // 使用 POST 请求，传递 taskId 和 headers
      const response = await fetch(`/api/core/train/rerank/task/eval-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          taskId,
          headers
        })
      });

      // 检查响应状态
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          // 使用翻译函数处理错误消息
          errorMessage = t(errorData.message) || errorData.error || errorMessage;
        } catch (e) {
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // 检查 Content-Type，确保是 Excel 文件下载响应
      const contentType = response.headers.get('Content-Type');
      if (
        !contentType?.includes(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ) &&
        !contentType?.includes('application/octet-stream')
      ) {
        throw new Error('download error.');
      }

      // 只有响应成功时才触发下载
      // 尝试从 Content-Disposition 头中提取文件名，如果失败则使用默认名称
      let filename = `eval-results-${taskId}.xlsx`;
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 清理 blob URL
      window.URL.revokeObjectURL(downloadUrl);
    },
    {
      errorToast: t('app:download_failed')
    }
  );

  /**
   * 开始学习处理函数
   */
  const handleStartLearn = useCallback(async () => {
    try {
      await onStartLearn();
    } catch (error) {
      console.error('Start learning error:', error);
    }
  }, [onStartLearn]);

  /**
   * 学习时间排序处理函数
   */
  const handleSortLearnTime = useCallback(() => {
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    setSortOrder(newOrder);
  }, [sortOrder]);

  /**
   * 下载评测数据处理函数
   */
  const handleDownloadData = useCallback(
    async (taskId: string) => {
      try {
        await onDownloadData(taskId);
      } catch (error) {
        console.error('Download data error:', error);
      }
    },
    [onDownloadData]
  );

  /**
   * 关闭错误详情 Modal
   */
  const handleCloseErrorModal = useCallback(() => {
    setSelectedError(null);
  }, []);

  /**
   * 重试训练任务处理函数
   */
  const handleRetryTask = useCallback(
    async (taskId: string) => {
      try {
        await onRetryTask(taskId);
      } catch (error) {
        console.error('Retry task error:', error);
      }
    },
    [onRetryTask]
  );

  /**
   * 删除训练任务处理函数
   */
  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      try {
        await onDeleteTask(taskId);
      } catch (error) {
        console.error('Delete task error:', error);
      }
    },
    [onDeleteTask]
  );

  /**
   * 恢复（删除所有训练任务）处理函数
   */
  const handleRestoreAllTasks = useCallback(async () => {
    try {
      await onRestoreAllTasks();
    } catch (error) {
      console.error('Restore all tasks error:', error);
    }
  }, [onRestoreAllTasks]);

  /**
   * 重试处理函数 (从错误弹窗触发)
   */
  const handleRetry = useCallback(() => {
    if (selectedError?.taskId) {
      handleRetryTask(selectedError.taskId);
    }
    handleCloseErrorModal();
  }, [selectedError, handleCloseErrorModal, handleRetryTask]);

  /**
   * 渲染状态标签
   */
  const renderStatusTag = useCallback(
    (status: RerankTrainTaskStatusEnum, errorMsg?: EnhancedErrorMessage, taskId?: string) => {
      const statusConfig = {
        [RerankTrainTaskStatusEnum.pending]: {
          label: t('app:learning_status_pending'),
          colorSchema: 'gray' as const
        },
        [RerankTrainTaskStatusEnum.running]: {
          label: t('app:auto_learn.learning'),
          colorSchema: 'blue' as const
        },
        [RerankTrainTaskStatusEnum.completed]: {
          label: t('app:auto_learn.completed'),
          colorSchema: 'green' as const
        },
        [RerankTrainTaskStatusEnum.failed]: {
          label: t('app:learning_status_abnormal'),
          colorSchema: 'red' as const
        },
        [RerankTrainTaskStatusEnum.cancelled]: {
          label: t('app:learning_status_cancelled'),
          colorSchema: 'gray' as const
        }
      };

      const config = statusConfig[status];

      // 只有失败状态且包含错误信息时，才显示可点击的标签
      const isFailedWithError = status === RerankTrainTaskStatusEnum.failed && errorMsg && taskId;

      if (isFailedWithError) {
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
                  taskId,
                  errorMsg
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

      // 其他状态保持原样
      return (
        <MyTag colorSchema={config.colorSchema} type="fill" h={'28px'}>
          {config.label}
        </MyTag>
      );
    },
    [t, setSelectedError]
  );

  /**
   * 格式化时间显示
   */
  const formatTime = useCallback((date: Date) => {
    return format(new Date(date), 'yyyy/MM/dd HH:mm:ss');
  }, []);

  /**
   * 提取评测指标数据
   * 指标数据位于 evalResult.detailed_results 中
   */
  const extractMetrics = useCallback((task: RerankTrainTaskListItem) => {
    const baseEvalResult = task.result?.baseModelEvalResult ?? {};
    const tunedEvalResult = task.result?.tunedModelEvalResult ?? {};

    // 从 detailed_results 中提取指标
    const baseDetailedResults = (baseEvalResult as any)?.detailed_results ?? {};
    const tunedDetailedResults = (tunedEvalResult as any)?.detailed_results ?? {};

    return {
      precisionBefore: baseDetailedResults?.rerank_top10_precision,
      precisionAfter: tunedDetailedResults?.rerank_top10_precision,
      mrrBefore: baseDetailedResults?.rerank_top10_mrr,
      mrrAfter: tunedDetailedResults?.rerank_top10_mrr
    };
  }, []);

  // 计算实际的 loading 状态：轮询时不显示 loading
  const actualIsLoading = isLoading && !isPollingRef.current;

  return (
    <Flex
      flexDirection={'column'}
      {...cardStyles}
      boxShadow={3.5}
      px={6}
      py={4}
      h={'100%'}
      overflowY={'auto'}
      overflowX={'hidden'}
    >
      {/* 头部区域 */}
      <Flex justifyContent={'space-between'} alignItems={'center'} mb={4}>
        <HStack spacing={2}>
          <MyIcon name={'menu'} w={'20px'} color={'myGray.600'} />
          <Text fontSize={'16px'} color={'myGray.900'}>
            {t('app:auto_learn.learning_records', { total })}
          </Text>
          <QuestionTip label={t('app:auto_learn.description')} />
        </HStack>
        <HStack spacing={2}>
          <MyTooltip
            label={
              hasRunningTasks
                ? t('app:auto_learn.restore_tooltip_has_running')
                : total === 0
                  ? t('app:auto_learn.restore_tooltip_no_records')
                  : ''
            }
          >
            <Button
              size={'md'}
              variant={'whitePrimary'}
              isLoading={isRestoring}
              isDisabled={hasRunningTasks || total === 0}
              onClick={() => openRestoreConfirm(handleRestoreAllTasks)()}
            >
              {t('app:auto_learn.restore')}
            </Button>
          </MyTooltip>
          <Button
            variant={'primary'}
            size={'md'}
            onClick={handleStartLearn}
            isLoading={isStartLearning}
            isDisabled={!appId}
          >
            {t('app:auto_learn.start_learning')}
          </Button>
        </HStack>
      </Flex>

      {/* 表格区域 */}
      <Box flex={1}>
        <ScrollData isLoading={actualIsLoading}>
          <Table variant={'simple'}>
            <Thead bg={'myGray.100'}>
              <Tr>
                <Th>
                  <HStack spacing={1}>
                    <Text>{t('app:auto_learn.learning_time')}</Text>
                    <MyIcon
                      name={'core/chat/chevronSelector'}
                      w={'16px'}
                      cursor={'pointer'}
                      _hover={{ color: 'primary.600' }}
                      onClick={handleSortLearnTime}
                    />
                  </HStack>
                </Th>
                <Th>{t('app:auto_learn.status')}</Th>
                <Th>{t('app:auto_learn.creator')}</Th>
                <Th>
                  <HStack spacing={1}>
                    <Text>{t('app:precision_before_after')}</Text>
                    <QuestionTip label={t('app:auto_learn.precision_tooltip')} />
                  </HStack>
                </Th>
                <Th>
                  <HStack spacing={1}>
                    <Text>{t('app:mrr_before_after')}</Text>
                    <QuestionTip label={t('app:auto_learn.mrr_tooltip')} />
                  </HStack>
                </Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {trainTasks.map((task: RerankTrainTaskListItem) => {
                const metrics = extractMetrics(task);
                return (
                  <Tr key={task._id} _hover={{ bg: 'myGray.50' }}>
                    <Td color={'myGray.600'} fontSize={'sm'}>
                      {formatTime(task.createTime)}
                    </Td>
                    <Td>
                      {renderStatusTag(
                        task.status,
                        task.errorMsg as EnhancedErrorMessage,
                        task._id
                      )}
                    </Td>
                    <Td color={'myGray.600'} fontSize={'sm'}>
                      {task.creatorName || '-'}
                    </Td>
                    <Td>
                      {metrics.precisionBefore === undefined &&
                      metrics.precisionAfter === undefined ? (
                        <Text color={'myGray.600'}>-</Text>
                      ) : (
                        <HStack spacing={1}>
                          <Text color={'myGray.600'}>
                            {metrics.precisionBefore !== undefined
                              ? `${(metrics.precisionBefore * 100).toFixed(1)}%`
                              : '-'}
                          </Text>
                          <MyIcon
                            name={'common/arrowRight'}
                            w={'16px'}
                            h={'16px'}
                            color={'#039855'}
                            mx={2}
                          />
                          <Text color={'myGray.600'}>
                            {metrics.precisionAfter !== undefined
                              ? `${(metrics.precisionAfter * 100).toFixed(1)}%`
                              : '-'}
                          </Text>
                        </HStack>
                      )}
                    </Td>
                    <Td>
                      {metrics.mrrBefore === undefined && metrics.mrrAfter === undefined ? (
                        <Text color={'myGray.600'}>-</Text>
                      ) : (
                        <HStack spacing={1}>
                          <Text color={'myGray.600'}>
                            {metrics.mrrBefore !== undefined ? metrics.mrrBefore.toFixed(2) : '-'}
                          </Text>
                          <MyIcon
                            name={'common/arrowRight'}
                            w={'16px'}
                            h={'16px'}
                            color={'#039855'}
                            mx={2}
                          />
                          <Text color={'myGray.600'}>
                            {metrics.mrrAfter !== undefined ? metrics.mrrAfter.toFixed(2) : '-'}
                          </Text>
                        </HStack>
                      )}
                    </Td>
                    <Td>
                      {task.status === RerankTrainTaskStatusEnum.completed ? (
                        <Button
                          size={'sm'}
                          variant={'whitePrimary'}
                          onClick={() => handleDownloadData(task._id)}
                        >
                          {t('app:auto_learn.download_evaluation_data')}
                        </Button>
                      ) : task.status === RerankTrainTaskStatusEnum.failed ? (
                        <HStack spacing={2}>
                          <Button
                            size={'sm'}
                            variant={'whitePrimary'}
                            onClick={() => handleRetryTask(task._id)}
                            isLoading={retryingTaskIds.has(task._id)}
                          >
                            {t('app:retry')}
                          </Button>
                          <PopoverConfirm
                            Trigger={
                              <Button
                                size={'sm'}
                                variant={'whiteDanger'}
                                isLoading={deletingTaskIds.has(task._id)}
                              >
                                {t('common:Delete')}
                              </Button>
                            }
                            type="delete"
                            content={t('app:auto_learn.confirm_delete_failed_record')}
                            onConfirm={() => handleDeleteTask(task._id)}
                          />
                        </HStack>
                      ) : null}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </ScrollData>
      </Box>

      {/* 错误详情 Modal */}
      <TrainExceptionModal
        error={selectedError}
        onClose={handleCloseErrorModal}
        onRetry={handleRetry}
      />

      {/* 恢复确认弹窗 */}
      <RestoreConfirmModal confirmText={t('app:auto_learn.restore')} />
    </Flex>
  );
};

export default React.memo(AutoLearn);
