import { type ReactNode, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext } from 'use-context-selector';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  getEvaluationStats,
  getEvaluationItemList,
  getEvaluationSummary,
  getEvaluationDetail,
  deleteEvaluationItem,
  putUpdateEvaluationItem,
  postRetryEvaluationItem,
  postRetryFailedEvaluationItems,
  getExportEvaluationItems,
  postGenerateSummary
} from '@/web/core/evaluation/task';
import type {
  EvaluationStatsResponse,
  ListEvaluationItemsResponse,
  UpdateEvaluationItemRequest,
  RetryEvaluationItemRequest,
  RetryFailedEvaluationItemsRequest
} from '@fastgpt/global/core/evaluation/api';
import type {
  EvaluationItemDisplayType,
  EvaluationDisplayType
} from '@fastgpt/global/core/evaluation/type';
import type { EvaluationSummaryResponse } from '@fastgpt/global/core/evaluation/summary/api';

// 使用正式的评估显示类型
type EvaluationTaskType = EvaluationDisplayType;

type LoadingState = {
  stats: boolean;
  summary: boolean;
  detail: boolean;
  items: boolean;
  taskDetail: boolean;
};

type ErrorState = {
  stats: string | null;
  summary: string | null;
  detail: string | null;
  items: string | null;
  taskDetail: string | null;
};

type TaskPageContextType = {
  taskId: string;
  taskDetail: EvaluationTaskType;

  // 核心数据
  statsData: EvaluationStatsResponse | null;
  summaryData: EvaluationSummaryResponse | null;
  evaluationDetail: EvaluationDisplayType | null;
  evaluationItems: EvaluationItemDisplayType[];

  // 状态管理
  loading: LoadingState;
  errors: ErrorState;

  // 搜索和分页
  searchValue: string;
  totalItems: number;
  filterParams: Record<string, any>;

  // 数据加载方法
  loadTaskDetail: (id: string) => Promise<EvaluationDisplayType>;
  loadAllData: (taskDetailData?: EvaluationDisplayType) => Promise<void>;
  refreshAllData: () => Promise<void>;
  refreshStats: () => Promise<void>;
  refreshEvaluationItems: () => Promise<void>;
  loadSummary: () => Promise<void>;

  // 数据操作方法
  deleteItem: (itemId: string) => Promise<void>;
  retryItem: (itemId: string) => Promise<void>;
  updateItem: (itemId: string, data: UpdateEvaluationItemRequest) => Promise<void>;
  retryFailedItems: () => Promise<void>;
  exportItems: (format?: string) => Promise<void>;
  generateSummary: () => Promise<void>;
  generateSummaryForMetrics: (params: { evalId: string; metricIds: string[] }) => Promise<void>;

  // 搜索方法
  setSearchValue: (value: string) => void;
  setEvaluationItems: (items: EvaluationItemDisplayType[]) => void;
  setTotalItems: (total: number) => void;
  setFilterParams: (params: Record<string, any>) => void;
};

const defaultTaskDetail: EvaluationDisplayType = {
  _id: '',
  name: '',
  createTime: new Date(),
  status: 'queuing' as any
} as EvaluationDisplayType;

const defaultLoading: LoadingState = {
  stats: false,
  summary: false,
  detail: false,
  items: false,
  taskDetail: false
};

const defaultErrors: ErrorState = {
  stats: null,
  summary: null,
  detail: null,
  items: null,
  taskDetail: null
};

const defaultContextValue: TaskPageContextType = {
  taskId: '',
  taskDetail: defaultTaskDetail,
  statsData: null,
  summaryData: null,
  evaluationDetail: null,
  evaluationItems: [],
  loading: defaultLoading,
  errors: defaultErrors,
  searchValue: '',
  totalItems: 0,
  filterParams: {},
  loadTaskDetail: async (id: string): Promise<EvaluationDisplayType> => {
    throw new Error('Function not implemented.');
  },
  loadAllData: async (taskDetailData?: EvaluationDisplayType): Promise<void> => {
    throw new Error('Function not implemented.');
  },
  refreshAllData: async (): Promise<void> => {
    throw new Error('Function not implemented.');
  },
  refreshStats: async (): Promise<void> => {
    throw new Error('Function not implemented.');
  },
  refreshEvaluationItems: async (): Promise<void> => {
    throw new Error('Function not implemented.');
  },
  loadSummary: async (): Promise<void> => {
    throw new Error('Function not implemented.');
  },
  deleteItem: async (itemId: string): Promise<void> => {
    throw new Error('Function not implemented.');
  },
  retryItem: async (itemId: string): Promise<void> => {
    throw new Error('Function not implemented.');
  },
  updateItem: async (itemId: string, data: UpdateEvaluationItemRequest): Promise<void> => {
    throw new Error('Function not implemented.');
  },
  retryFailedItems: async (): Promise<void> => {
    throw new Error('Function not implemented.');
  },
  exportItems: async (format?: string): Promise<void> => {
    throw new Error('Function not implemented.');
  },
  generateSummary: async (): Promise<void> => {
    throw new Error('Function not implemented.');
  },
  generateSummaryForMetrics: async (params: {
    evalId: string;
    metricIds: string[];
  }): Promise<void> => {
    throw new Error('Function not implemented.');
  },
  setSearchValue: (value: string): void => {
    throw new Error('Function not implemented.');
  },
  setEvaluationItems: (items: EvaluationItemDisplayType[]): void => {
    throw new Error('Function not implemented.');
  },
  setTotalItems: (total: number): void => {
    throw new Error('Function not implemented.');
  },
  setFilterParams: (params: Record<string, any>): void => {
    throw new Error('Function not implemented.');
  }
};

export const TaskPageContext = createContext<TaskPageContextType>(defaultContextValue);

export const TaskPageContextProvider = ({
  children,
  taskId
}: {
  children: ReactNode;
  taskId: string;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  // 基础状态
  const [taskDetail, setTaskDetail] = useState<EvaluationDisplayType>(
    defaultTaskDetail as EvaluationDisplayType
  );
  const [statsData, setStatsData] = useState<EvaluationStatsResponse | null>(null);
  const [summaryData, setSummaryData] = useState<EvaluationSummaryResponse | null>(null);
  const [evaluationDetail, setEvaluationDetail] = useState<EvaluationDisplayType | null>(null);
  const [evaluationItems, setEvaluationItems] = useState<EvaluationItemDisplayType[]>([]);
  const [loading, setLoading] = useState<LoadingState>(defaultLoading);
  const [errors, setErrors] = useState<ErrorState>(defaultErrors);
  const [searchValue, setSearchValue] = useState('');
  const [totalItems, setTotalItems] = useState(0);
  const [filterParams, setFilterParams] = useState<Record<string, any>>({});

  // 更新加载状态的辅助函数
  const updateLoading = useCallback((key: keyof LoadingState, value: boolean) => {
    setLoading((prev) => ({ ...prev, [key]: value }));
  }, []);

  // 更新错误状态的辅助函数
  const updateError = useCallback((key: keyof ErrorState, value: string | null) => {
    setErrors((prev) => ({ ...prev, [key]: value }));
  }, []);

  // 使用 useRequest2 优化各种请求
  const { runAsync: runLoadStats, cancel: cancelStatsPolling } = useRequest2(
    () => getEvaluationStats(taskId),
    {
      manual: true,
      pollingInterval: 15000,
      pollingWhenHidden: false,
      pollingErrorRetryCount: 0,
      errorToast: '',
      onBefore: () => {
        // 只有首次加载时才显示loading状态，轮询时不显示
        const isFirstLoad = !statsData;
        if (isFirstLoad) {
          updateLoading('stats', true);
        }
        updateError('stats', null);
      },
      onSuccess: (data) => {
        setStatsData(data);
      },
      onError: (error) => {
        updateError('stats', error.message);
      },
      onFinally: () => {
        updateLoading('stats', false);
      }
    }
  );

  const { runAsync: runLoadSummary, cancel: cancelSummaryPolling } = useRequest2(
    () => getEvaluationSummary(taskId),
    {
      manual: true,
      pollingInterval: 15000,
      pollingWhenHidden: false,
      pollingErrorRetryCount: 0,
      errorToast: '',
      onBefore: () => {
        // 只有首次加载时才显示loading状态，轮询时不显示
        const isFirstLoad = !summaryData;
        if (isFirstLoad) {
          updateLoading('summary', true);
        }
        updateError('summary', null);
      },
      onSuccess: (data) => {
        setSummaryData(data);
      },
      onError: (error) => {
        updateError('summary', error.message);
      },
      onFinally: () => {
        updateLoading('summary', false);
      }
    }
  );

  const { runAsync: runLoadEvaluationDetail } = useRequest2(() => getEvaluationDetail(taskId), {
    manual: true,
    errorToast: t('dashboard_evaluation:request_failed'),
    onBefore: () => {
      updateLoading('detail', true);
      updateError('detail', null);
    },
    onSuccess: (data) => {
      setEvaluationDetail(data);
    },
    onError: (error) => {
      updateError('detail', error.message);
    },
    onFinally: () => {
      updateLoading('detail', false);
    }
  });

  const { runAsync: runDeleteItem } = useRequest2(
    (itemId: string) => deleteEvaluationItem(itemId),
    {
      manual: true,
      successToast: t('dashboard_evaluation:delete_success'),
      errorToast: t('dashboard_evaluation:delete_failed')
    }
  );

  const { runAsync: runRetryItem } = useRequest2(
    (itemId: string) => postRetryEvaluationItem({ evalItemId: itemId }),
    {
      manual: true,
      successToast: t('dashboard_evaluation:retry_request_submitted'),
      errorToast: t('dashboard_evaluation:retry_failed')
    }
  );

  const { runAsync: runUpdateItem } = useRequest2(
    (data: UpdateEvaluationItemRequest) => putUpdateEvaluationItem(data),
    {
      manual: true,
      successToast: t('dashboard_evaluation:save_success'),
      errorToast: t('dashboard_evaluation:save_failed')
    }
  );

  const { runAsync: runRetryFailedItems } = useRequest2(
    () => postRetryFailedEvaluationItems({ evalId: taskId }),
    {
      manual: true,
      errorToast: t('dashboard_evaluation:retry_failed')
    }
  );

  const { runAsync: runGenerateSummary } = useRequest2(
    (params: { evalId: string; metricIds: string[] }) => postGenerateSummary(params),
    {
      manual: true,
      successToast: t('dashboard_evaluation:summary_generation_request_submitted'),
      errorToast: t('dashboard_evaluation:generate_summary_failed')
    }
  );

  const { runAsync: runExportItems } = useRequest2(
    (params: { evalId: string; format?: string }) =>
      getExportEvaluationItems(params.evalId, params.format),
    {
      manual: true,
      errorToast: t('dashboard_evaluation:export_failed')
    }
  );

  // 加载任务详情
  const loadTaskDetail = useCallback(
    async (id: string) => {
      updateLoading('taskDetail', true);
      updateError('taskDetail', null);

      try {
        const data = await getEvaluationDetail(id);
        setTaskDetail(data);
        return data;
      } catch (error: any) {
        const errorMsg = error.message || t('dashboard_evaluation:load_failed');
        updateError('taskDetail', errorMsg);
        throw error;
      } finally {
        updateLoading('taskDetail', false);
      }
    },
    [t, updateLoading, updateError]
  );

  // 加载统计数据
  const loadStats = useCallback(async () => {
    await runLoadStats();
  }, [runLoadStats]);

  // 加载总结数据
  const loadSummary = useCallback(async () => {
    await runLoadSummary();
  }, [runLoadSummary]);

  // 加载评估详情
  const loadEvaluationDetail = useCallback(async () => {
    await runLoadEvaluationDetail();
  }, [runLoadEvaluationDetail]);

  // 加载所有数据 - 分两个阶段：优先加载基础数据，再加载详细数据
  const loadAllData = useCallback(
    async (taskDetailData?: EvaluationDisplayType) => {
      // 第一阶段：优先并行加载基础数据（stats 和 detail）
      const loadDetailPromise = taskDetailData
        ? Promise.resolve().then(() => setEvaluationDetail(taskDetailData))
        : loadEvaluationDetail();

      await Promise.all([loadStats(), loadDetailPromise]);

      // 第二阶段：加载详细数据（summary）
      await loadSummary();
    },
    [loadStats, loadSummary, loadEvaluationDetail]
  );

  // 刷新统计数据
  const refreshStats = useCallback(async () => {
    await loadStats();
  }, [loadStats]);

  // 刷新评估项列表（这个方法主要供外部滚动分页组件调用）
  const refreshEvaluationItems = useCallback(async () => {
    // 这个方法主要是为了保持接口一致性，实际的列表刷新由滚动分页组件处理
    // 不需要在这里重新加载统计数据，避免重复调用
  }, []);

  // 刷新所有数据
  const refreshAllData = useCallback(async () => {
    await Promise.all([loadStats(), loadSummary(), loadEvaluationDetail()]);
  }, [loadStats, loadSummary, loadEvaluationDetail]);

  // 删除评估项
  const deleteItem = useCallback(
    async (itemId: string) => {
      await runDeleteItem(itemId);
      // 刷新相关数据
      await Promise.all([refreshStats(), refreshEvaluationItems()]);
    },
    [runDeleteItem, refreshStats, refreshEvaluationItems]
  );

  // 重试评估项
  const retryItem = useCallback(
    async (itemId: string) => {
      await runRetryItem(itemId);
      // 刷新相关数据
      await Promise.all([refreshStats(), refreshEvaluationItems()]);
    },
    [runRetryItem, refreshStats, refreshEvaluationItems]
  );

  // 更新评估项
  const updateItem = useCallback(
    async (itemId: string, data: UpdateEvaluationItemRequest) => {
      await runUpdateItem(data);
      // 刷新相关数据
      await Promise.all([refreshStats(), refreshEvaluationItems()]);
    },
    [runUpdateItem, refreshStats, refreshEvaluationItems]
  );

  // 重试失败项
  const retryFailedItems = useCallback(async () => {
    const result = await runRetryFailedItems();
    // 显示具体重试数量的成功提示
    if (result?.retryCount !== undefined) {
      toast({
        title: t('dashboard_evaluation:retry_request_submitted'),
        status: 'success'
      });
    }
    // 刷新相关数据
    await Promise.all([refreshStats(), refreshEvaluationItems()]);
  }, [runRetryFailedItems, t, toast, refreshStats, refreshEvaluationItems]);

  // 导出评估项
  const exportItems = useCallback(
    async (format?: string) => {
      try {
        const blob = await runExportItems({
          evalId: taskId,
          format: format || 'csv'
        });

        // 创建下载链接
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `evaluation_${taskDetail?.name || 'task'}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        // 手动显示成功提示，因为下载成功后才算真正成功
        toast({
          title: t('dashboard_evaluation:export_success'),
          status: 'success'
        });
      } catch (error) {
        // 错误已由 useRequest2 处理
        throw error;
      }
    },
    [taskId, taskDetail?.name, t, toast, runExportItems]
  );

  // 生成总结报告（为指定的 metricIds）
  const generateSummaryForMetrics = useCallback(
    async (params: { evalId: string; metricIds: string[] }) => {
      await runGenerateSummary(params);
      // 刷新总结数据
      await loadSummary();
    },
    [runGenerateSummary, loadSummary]
  );

  // 生成总结报告（为所有维度）
  const generateSummary = useCallback(async () => {
    // 从 summaryData 中提取 metricIds
    if (!summaryData?.data || summaryData.data.length === 0) {
      toast({
        title: t('dashboard_evaluation:no_dimension_data_cannot_generate_summary'),
        status: 'warning'
      });
      return;
    }

    const metricIds = summaryData.data.map((item) => item.metricId);

    await generateSummaryForMetrics({
      evalId: taskId,
      metricIds
    });
  }, [taskId, summaryData, t, toast, generateSummaryForMetrics]);

  // 组件卸载时清除轮询
  useEffect(() => {
    return () => {
      // 清除轮询定时器
      cancelStatsPolling?.();
      cancelSummaryPolling?.();
    };
  }, [cancelStatsPolling, cancelSummaryPolling]);

  const contextValue: TaskPageContextType = {
    taskId,
    taskDetail,
    statsData,
    summaryData,
    evaluationDetail,
    evaluationItems,
    loading,
    errors,
    searchValue,
    totalItems,
    filterParams,
    loadTaskDetail,
    loadAllData,
    refreshAllData,
    refreshStats,
    refreshEvaluationItems,
    loadSummary,
    deleteItem,
    retryItem,
    updateItem,
    retryFailedItems,
    exportItems,
    generateSummary,
    generateSummaryForMetrics,
    setSearchValue,
    setEvaluationItems,
    setTotalItems,
    setFilterParams
  };

  return <TaskPageContext.Provider value={contextValue}>{children}</TaskPageContext.Provider>;
};
