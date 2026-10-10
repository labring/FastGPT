import { useRequest } from '@fastgpt/web/hooks/useRequest';

export const DATASET_STATUS_POLLING_INTERVAL = 10_000;

/**
 * 同一状态请求在执行期间共用原生 Promise，结束后允许重新查询。
 * 供手动刷新和轮询同时调用；不使用会因后续 run/cancel 而永不结束的 useRequest.runAsync。
 * activate/deactivate 控制是否发布结果；数据集切换或卸载后旧请求仍会结束，但不更新页面。
 * 数据集 ID 变化时应重新创建，避免不同数据集共用结果。
 */
export const createDatasetStatusRequest = <TData>(
  request: () => Promise<TData>,
  onSuccess?: (data: TData) => void
) => {
  let pending: Promise<TData> | undefined;
  let active = false;
  return {
    refresh: () => {
      if (pending) return pending;
      pending = Promise.resolve()
        .then(request)
        .then((data) => {
          if (active) onSuccess?.(data);
          return data;
        });
      const clearPending = () => {
        pending = undefined;
      };
      void pending.then(clearPending, clearPending);
      return pending;
    },
    activate: () => {
      active = true;
    },
    deactivate: () => {
      active = false;
    }
  };
};

/**
 * 数据集状态统一在本轮请求完成后等待 10 秒再查询；隐藏页面暂停轮询。
 * useRequest 的 polling 插件在 onFinally 中使用 setTimeout，调用方须等待本轮所有子请求。
 */
export const useDatasetStatusPolling = <TData>(
  request: () => Promise<TData>,
  options: Omit<
    NonNullable<Parameters<typeof useRequest<TData, []>>[1]>,
    'pollingInterval' | 'pollingWhenHidden'
  > = {}
) =>
  useRequest(request, {
    manual: false,
    ...options,
    pollingInterval: DATASET_STATUS_POLLING_INTERVAL,
    pollingWhenHidden: false
  });
