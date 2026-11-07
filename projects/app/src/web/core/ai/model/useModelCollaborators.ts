import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { CollaboratorItemDetailType } from '@fastgpt/global/support/permission/collaborator';
import { getBatchModelCollaborators } from './collaboratorApi';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';

type CacheEntry = { clbs?: CollaboratorItemDetailType[]; failed?: boolean };
const entries = new Map<string, CacheEntry>();
const listeners = new Set<() => void>();
let emptyEntry: CacheEntry = {};
let generation = 0;
const pending = new Map<string, string>();
const inFlight = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | undefined;
const getIdentity = () => useUserStore.getState().userInfo?.team.tmbId ?? '';
const getKey = (identity: string, modelId: string) => `${identity}:${modelId}`;
const emit = () => listeners.forEach((listener) => listener());

/** 协作者权限随登录成员变化，不能复用另一个身份读取的列表或迟到响应。 */
useUserStore.subscribe((state, previous) => {
  if (state.userInfo?.team.tmbId !== previous.userInfo?.team.tmbId) clearModelCollaboratorsCache();
});

/** 保存当前身份可见的协作者列表，供权限编辑与批量读取共用。 */
export const updateModelCollaboratorsCache = (
  modelId: string,
  clbs: CollaboratorItemDetailType[]
) => {
  const key = getKey(getIdentity(), modelId);
  pending.delete(key);
  inFlight.delete(key);
  entries.set(key, { clbs });
  emit();
};

/** 清理后发布新的空快照，使已经挂载的单元格重新加载；失效前的异步响应不得写回。 */
export const clearModelCollaboratorsCache = (modelId?: string) => {
  generation++;
  if (timer) clearTimeout(timer);
  timer = undefined;
  pending.clear();
  inFlight.clear();
  if (modelId) entries.delete(getKey(getIdentity(), modelId));
  else entries.clear();
  emptyEntry = {};
  emit();
};

/** 合并本轮挂载单元格的请求，去重并隔离身份切换和刷新期间的旧响应。 */
const scheduleBatchLoad = (modelId: string, identity: string) => {
  const key = getKey(identity, modelId);
  if (inFlight.has(key) || pending.has(key)) return;
  pending.set(key, modelId);
  if (timer) return;
  timer = setTimeout(async () => {
    timer = undefined;
    const requests = [...pending];
    pending.clear();
    if (requests.length === 0) return;
    const requestGeneration = generation;
    requests.forEach(([key]) => inFlight.set(key, requestGeneration));
    try {
      const result = await getBatchModelCollaborators(requests.map(([, id]) => id));
      if (generation !== requestGeneration || identity !== getIdentity()) return;
      requests.forEach(([key, id]) => {
        // 权限弹窗可能已拿到更新后的结果，迟到的批量读取不能覆盖它。
        if (inFlight.get(key) === requestGeneration)
          entries.set(key, { clbs: result[id]?.clbs ?? [] });
      });
    } catch {
      // 读取失败不是空授权列表，展示失败并等待显式重试，避免误报“全员可用”。
      if (generation !== requestGeneration || identity !== getIdentity()) return;
      requests.forEach(([key]) => {
        if (inFlight.get(key) === requestGeneration) entries.set(key, { failed: true });
      });
    } finally {
      requests.forEach(([key]) => {
        if (inFlight.get(key) === requestGeneration) inFlight.delete(key);
      });
      emit();
    }
  }, 10);
};

/** 订阅当前身份下的协作者快照；失效和身份变化都会重新调度批量加载。 */
export const useModelCollaborators = (modelId?: string) => {
  const isPlus = useSystemStore((state) => state.feConfigs.isPlus);
  const identity = useUserStore((state) => state.userInfo?.team.tmbId ?? '');
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const getSnapshot = useCallback(
    () => (modelId ? (entries.get(getKey(identity, modelId)) ?? emptyEntry) : emptyEntry),
    [identity, modelId]
  );
  const entry = useSyncExternalStore(subscribe, getSnapshot, () => emptyEntry);
  useEffect(() => {
    if (modelId && identity && isPlus && !entry.clbs && !entry.failed)
      scheduleBatchLoad(modelId, identity);
  }, [modelId, identity, isPlus, entry]);
  return entry;
};
