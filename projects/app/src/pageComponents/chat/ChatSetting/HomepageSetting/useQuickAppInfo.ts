import { useEffect, useRef, useState } from 'react';
import { useMemoizedFn } from 'ahooks';
import { getAppBasicInfoByIds } from '@/web/core/app/api';
import type { ChatQuickAppType } from '@fastgpt/global/core/chat/setting/type';

type InfoStatus = 'loading' | 'ready' | 'missing' | 'error';

/**
 * 在一次弹窗会话内补齐已选应用的展示信息，每个 ID 只自动查询一次。
 * 缺项和请求失败分别记忆，避免渲染触发重试；取消选择保留缓存，卸载后丢弃旧响应。
 */
export const useQuickAppInfo = (selectedIds: string[]) => {
  const [selectedInfo, setSelectedInfo] = useState<Record<string, ChatQuickAppType>>({});
  const scopeRef = useRef({ active: false, statuses: new Map<string, InfoStatus>() });
  const selectionKey = JSON.stringify([...new Set(selectedIds)].sort());

  useEffect(() => {
    const scope = { active: true, statuses: new Map<string, InfoStatus>() };
    scopeRef.current = scope;
    return () => {
      scope.active = false;
    };
  }, []);

  const cacheApp = useMemoizedFn((app: ChatQuickAppType) => {
    scopeRef.current.statuses.set(app._id, 'ready');
    setSelectedInfo((previous) => ({ ...previous, [app._id]: app }));
  });

  const loadMissing = useMemoizedFn(async () => {
    const scope = scopeRef.current;
    if (!scope.active) return;
    const missing = [...new Set(selectedIds)].filter((id) => !scope.statuses.has(id));
    if (missing.length === 0) return;

    // 发起前同步登记，选择变化时也不会重复请求仍在加载的 ID。
    missing.forEach((id) => scope.statuses.set(id, 'loading'));
    try {
      const list = await getAppBasicInfoByIds(missing);
      if (!scope.active) return;
      const resultMap = new Map(list.map((item) => [item.id, item]));
      const resolved: ChatQuickAppType[] = [];
      missing.forEach((id) => {
        // 用户从当前列表选择时提供的信息优先于后台补查结果。
        if (scope.statuses.get(id) !== 'loading') return;
        const item = resultMap.get(id);
        scope.statuses.set(id, item ? 'ready' : 'missing');
        if (item) resolved.push({ _id: id, name: item.name, avatar: item.avatar });
      });
      if (resolved.length === 0) return;
      setSelectedInfo((previous) => {
        const next = { ...previous };
        resolved.forEach((app) => {
          next[app._id] = previous[app._id] ?? app;
        });
        return next;
      });
    } catch {
      if (!scope.active) return;
      missing.forEach((id) => {
        if (scope.statuses.get(id) === 'loading') scope.statuses.set(id, 'error');
      });
    }
  });

  useEffect(() => {
    void loadMissing();
  }, [selectionKey, loadMissing]);

  return { selectedInfo, cacheApp };
};
