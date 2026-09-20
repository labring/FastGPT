import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { CollaboratorItemDetailType } from '@fastgpt/global/support/permission/collaborator';
import { getBatchModelCollaborators } from '@/web/core/ai/model/api';
import { useSystemStore } from '@/web/common/system/useSystemStore';

// 模块级协作者缓存，避免虚拟列表滚动与重复渲染时触发多余网络请求
const modelCollaboratorsCache = new Map<string, CollaboratorItemDetailType[]>();
const cacheListeners = new Set<(modelId: string) => void>();

/** 更新指定模型的协作者缓存并触发监听更新 */
export const updateModelCollaboratorsCache = (
  modelId: string,
  clbs: CollaboratorItemDetailType[]
) => {
  modelCollaboratorsCache.set(modelId, clbs);
  cacheListeners.forEach((listener) => listener(modelId));
};

/** 清理全部（或指定）模型的协作者缓存并触发监听更新 */
export const clearModelCollaboratorsCache = (modelId?: string) => {
  if (modelId) {
    modelCollaboratorsCache.delete(modelId);
    cacheListeners.forEach((listener) => listener(modelId));
  } else {
    modelCollaboratorsCache.clear();
    cacheListeners.forEach((listener) => listener(''));
  }
};

// 批量请求调度器：聚合同一宏任务/渲染周期内的多个单元格请求，合并为单次批量接口调用
let pendingBatchModelIds = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleBatchLoad = (modelId: string) => {
  pendingBatchModelIds.add(modelId);
  if (batchTimer) return;

  batchTimer = setTimeout(async () => {
    const idsToFetch = Array.from(pendingBatchModelIds);
    pendingBatchModelIds = new Set();
    batchTimer = null;

    if (idsToFetch.length === 0) return;

    try {
      const res = await getBatchModelCollaborators(idsToFetch);
      for (const id of idsToFetch) {
        updateModelCollaboratorsCache(id, res?.[id]?.clbs ?? []);
      }
    } catch (_error) {
      // 容错：接口异常时填充空数组，避免阻塞渲染或死循环重发
      for (const id of idsToFetch) {
        if (!modelCollaboratorsCache.has(id)) {
          updateModelCollaboratorsCache(id, []);
        }
      }
    }
  }, 10);
};

/**
 * 订阅指定模型的协作者列表，未命中缓存时自动调度批量请求合并
 */
export const useModelCollaborators = (modelId?: string) => {
  const { feConfigs } = useSystemStore();

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!modelId) return () => {};
      const listener = (updatedModelId: string) => {
        if (!updatedModelId || updatedModelId === modelId) {
          onStoreChange();
        }
      };
      cacheListeners.add(listener);
      return () => {
        cacheListeners.delete(listener);
      };
    },
    [modelId]
  );

  const getSnapshot = useCallback(() => {
    return modelId ? modelCollaboratorsCache.get(modelId) : undefined;
  }, [modelId]);

  const clbs = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (!modelId || !feConfigs.isPlus) return;
    if (modelCollaboratorsCache.has(modelId)) return;

    scheduleBatchLoad(modelId);
  }, [modelId, feConfigs.isPlus]);

  return clbs;
};
