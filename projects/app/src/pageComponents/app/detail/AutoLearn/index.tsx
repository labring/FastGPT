/**
 * @file 自动学习组件
 * @description 智能客服应用的自动学习功能页面，展示学习记录列表及评估数据
 */
import React, { useMemo, useCallback, useState } from 'react';
import { Flex, Box, Table, Thead, Tbody, Tr, Th, Td, Button, HStack, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { format } from 'date-fns';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { AppContext } from '../context';
import {
  getRerankTrainTaskList,
  createRerankTrainTaskWithTrainset
} from '@/web/core/app/api/train';
import { downloadFetch } from '@/web/common/system/utils';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import type { RerankTrainTaskListItem } from '@fastgpt/global/core/train/rerank/api';
import { cardStyles } from '../constants';

const AutoLearn = () => {
  const { t } = useTranslation();
  // 从 AppContext 获取 appId
  const appId = useContextSelector(AppContext, (v) => v.appId);

  // 排序状态管理
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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

  // 使用滚动分页获取训练任务数据，并添加15s轮询
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
    errorToast: t('app:fetch_learning_records_error'),
    pollingInterval: 15000 // 15秒轮询
  }) as {
    data: RerankTrainTaskListItem[];
    total: number;
    isLoading: boolean;
    ScrollData: any;
    refreshList: () => void;
  };

  // 使用 useRequest2 处理开始学习
  const { runAsync: onStartLearn, loading: isStartLearning } = useRequest2(
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

  // 使用 useRequest2 处理下载评测数据
  const { runAsync: onDownloadData } = useRequest2(
    async (taskId: string) => {
      if (!taskId) throw new Error('Task ID is required');

      // 使用 GET 请求，taskId 作为查询参数
      const response = await fetch(
        `/api/core/train/rerank/task/eval-dataset/download?taskId=${encodeURIComponent(taskId)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

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

      // 检查 Content-Type，确保是文件下载响应
      const contentType = response.headers.get('Content-Type');
      if (
        !contentType?.includes('application/jsonl') &&
        !contentType?.includes('application/octet-stream')
      ) {
        throw new Error(t('下载失败') + ': ' + t('无效的响应格式'));
      }

      // 只有响应成功时才触发下载
      const filename = `eval_dataset_${taskId}_${new Date().toISOString().split('T')[0]}.jsonl`;
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
   * 渲染状态标签
   */
  const renderStatusTag = useCallback(
    (status: RerankTrainTaskStatusEnum) => {
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
          label: t('app:learning_status_failed'),
          colorSchema: 'red' as const
        },
        [RerankTrainTaskStatusEnum.cancelled]: {
          label: t('app:learning_status_cancelled'),
          colorSchema: 'gray' as const
        }
      };

      const config = statusConfig[status];
      return (
        <MyTag colorSchema={config.colorSchema} type="fill">
          {config.label}
        </MyTag>
      );
    },
    [t]
  );

  /**
   * 格式化时间显示
   */
  const formatTime = useCallback((date: Date) => {
    return format(new Date(date), 'yyyy/MM/dd HH:mm:ss');
  }, []);

  /**
   * 提取评测指标数据
   */
  const extractMetrics = useCallback((task: RerankTrainTaskListItem) => {
    const baseEvalResult = task.result?.baseModelEvalResult ?? {};
    const tunedEvalResult = task.result?.tunedModelEvalResult ?? {};

    return {
      precisionBefore: baseEvalResult?.rerank_top10_precision,
      precisionAfter: tunedEvalResult?.rerank_top10_precision,
      mrrBefore: baseEvalResult?.rerank_top10_mrr,
      mrrAfter: tunedEvalResult?.rerank_top10_mrr
    };
  }, []);

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
        <Button
          variant={'primary'}
          size={'md'}
          onClick={handleStartLearn}
          isLoading={isStartLearning}
          isDisabled={!appId}
        >
          {t('app:auto_learn.start_learning')}
        </Button>
      </Flex>

      {/* 表格区域 */}
      <Box flex={1}>
        <ScrollData>
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
                    <Td>{renderStatusTag(task.status)}</Td>
                    <Td color={'myGray.600'} fontSize={'sm'}>
                      {task.creatorName || '-'}
                    </Td>
                    <Td>
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
                          mx={8}
                        />
                        <Text color={'myGray.600'}>
                          {metrics.precisionAfter !== undefined
                            ? `${(metrics.precisionAfter * 100).toFixed(1)}%`
                            : '-'}
                        </Text>
                      </HStack>
                    </Td>
                    <Td>
                      <HStack spacing={1}>
                        <Text color={'myGray.600'}>
                          {metrics.mrrBefore !== undefined ? metrics.mrrBefore.toFixed(2) : '-'}
                        </Text>
                        <MyIcon
                          name={'common/arrowRight'}
                          w={'16px'}
                          h={'16px'}
                          color={'#039855'}
                          mx={8}
                        />
                        <Text color={'myGray.600'}>
                          {metrics.mrrAfter !== undefined ? metrics.mrrAfter.toFixed(2) : '-'}
                        </Text>
                      </HStack>
                    </Td>
                    <Td>
                      {task.status === RerankTrainTaskStatusEnum.completed && (
                        <Button
                          size={'sm'}
                          variant={'whitePrimary'}
                          onClick={() => handleDownloadData(task._id)}
                        >
                          {t('app:auto_learn.download_evaluation_data')}
                        </Button>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </ScrollData>
      </Box>
    </Flex>
  );
};

export default React.memo(AutoLearn);
