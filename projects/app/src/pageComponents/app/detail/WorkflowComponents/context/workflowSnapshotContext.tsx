// 工作流快照管理层
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import type { Node, Edge } from 'reactflow';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import {
  compareSnapshot,
  storeNode2FlowNode,
  storeEdge2RenderEdge
} from '@/web/core/workflow/utils';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version';
import { WorkflowBufferDataContext } from './workflowInitContext';
import { AppContext } from '@/pageComponents/app/detail/context';
import type { WorkflowStateType } from './type';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

export type WorkflowSnapshotsType = WorkflowStateType & {
  title: string;
  isSaved?: boolean;
};

// 创建 Context
type WorkflowSnapshotContextValue = {
  /** 历史快照列表 */
  past: WorkflowSnapshotsType[];

  /** 设置历史快照列表 */
  setPast: React.Dispatch<React.SetStateAction<WorkflowSnapshotsType[]>>;

  /** 未来快照列表 */
  future: WorkflowSnapshotsType[];

  /** 撤销 */
  undo: () => void;

  /** 重做 */
  redo: () => void;

  /** 是否可以撤销 */
  canUndo: boolean;

  /** 是否可以重做 */
  canRedo: boolean;

  /** 推入历史快照 */
  pushPastSnapshot: (params: {
    pastNodes: Node[];
    pastEdges: Edge[];
    chatConfig: AppChatConfigType;
    customTitle?: string;
    isSaved?: boolean;
  }) => boolean;

  /** 切换临时版本 */
  onSwitchTmpVersion: (data: WorkflowSnapshotsType, customTitle: string) => boolean;

  /** 切换云端版本 */
  onSwitchCloudVersion: (appVersion: AppVersionSchemaType) => boolean;
};
export const WorkflowSnapshotContext = createContext<WorkflowSnapshotContextValue>({
  past: [],
  setPast: function (value: React.SetStateAction<WorkflowSnapshotsType[]>): void {
    throw new Error('Function not implemented.');
  },
  future: [],
  undo: function (): void {
    throw new Error('Function not implemented.');
  },
  redo: function (): void {
    throw new Error('Function not implemented.');
  },
  canUndo: false,
  canRedo: false,
  pushPastSnapshot: function (params: {
    pastNodes: Node[];
    pastEdges: Edge[];
    chatConfig: AppChatConfigType;
    customTitle?: string;
    isSaved?: boolean;
  }): boolean {
    throw new Error('Function not implemented.');
  },
  onSwitchTmpVersion: function (data: WorkflowSnapshotsType, customTitle: string): boolean {
    throw new Error('Function not implemented.');
  },
  onSwitchCloudVersion: function (appVersion: AppVersionSchemaType): boolean {
    throw new Error('Function not implemented.');
  }
});

// 配置
const maxSnapshots = 100;
const snapshotDebounceTime = 1000;

export const WorkflowSnapshotProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();

  // 获取 WorkflowBufferDataContext 的数据
  const { setEdges, setNodes, forbiddenSaveSnapshot } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );
  // 获取 AppContext 的 setAppDetail
  const setAppDetail = useContextSelector(AppContext, (v) => v.setAppDetail);

  // 快照历史
  const [past, setPast] = useState<WorkflowSnapshotsType[]>([]);
  const [future, setFuture] = useState<WorkflowSnapshotsType[]>([]);

  // 待保存快照队列机制 - 解决竞态条件，确保数据不丢失
  const pendingSnapshotRef = useRef<{
    data: {
      pastNodes: Node[];
      pastEdges: Edge[];
      chatConfig: AppChatConfigType;
      customTitle?: string;
      isSaved?: boolean;
    } | null;
    timeoutId?: NodeJS.Timeout;
  }>({ data: null });

  // 重置快照状态
  const resetSnapshot = useCallback(
    (state: WorkflowStateType) => {
      setNodes(state.nodes);
      setEdges(state.edges);
      setAppDetail((detail) => ({
        ...detail,
        chatConfig: state.chatConfig
      }));
    },
    [setNodes, setEdges, setAppDetail]
  );

  // 增强的快照保存函数 - 优先保证数据保存
  const pushPastSnapshot = useCallback(
    (data: Parameters<WorkflowSnapshotContextValue['pushPastSnapshot']>[0]) => {
      const { pastNodes, pastEdges, chatConfig, customTitle, isSaved } = data;
      // 1. 基础数据验证 - 仅确保基本结构存在
      if (!pastNodes || !pastEdges || !chatConfig) {
        console.warn('[Snapshot] Invalid snapshot data:', {
          hasPastNodes: !!pastNodes,
          hasPastEdges: !!pastEdges,
          hasChatConfig: !!chatConfig
        });
        return false;
      }

      // 2. 节点数量验证 - 允许空节点数组但记录日志
      if (pastNodes.length === 0) {
        console.debug('[Snapshot] Empty nodes array, still saving snapshot');
      }

      // 3. 处理被阻塞的快照
      if (forbiddenSaveSnapshot.current) {
        forbiddenSaveSnapshot.current = false;
        console.warn('[Snapshot] Snapshot creation blocked, adding to pending queue');

        // 将快照加入待处理队列
        pendingSnapshotRef.current = { data };

        // 500ms后尝试处理待保存的快照
        if (pendingSnapshotRef.current.timeoutId) {
          clearTimeout(pendingSnapshotRef.current.timeoutId);
        }

        pendingSnapshotRef.current.timeoutId = setTimeout(() => {
          if (pendingSnapshotRef.current?.data) {
            console.log('[Snapshot] Processing pending snapshot from queue');
            pushPastSnapshot(pendingSnapshotRef.current.data);
            pendingSnapshotRef.current = { data: null };
          } else {
            console.log('[Snapshot] No pending snapshot to process');
          }
        }, snapshotDebounceTime);

        return false;
      }

      // 4. 检查快照是否与之前相同
      const isPastEqual = compareSnapshot(
        {
          nodes: pastNodes,
          edges: pastEdges,
          chatConfig: chatConfig
        },
        {
          nodes: past[0]?.nodes,
          edges: past[0]?.edges,
          chatConfig: past[0]?.chatConfig
        }
      );

      if (isPastEqual) {
        console.log('[Snapshot] Snapshot is identical to previous, skipping');
        return false;
      }

      try {
        // 5. 更新快照历史
        const newSnapshot = {
          nodes: pastNodes,
          edges: pastEdges,
          title: customTitle || formatTime2YMDHMS(new Date()),
          chatConfig,
          isSaved
        };

        setFuture([]);
        setPast((past) => {
          if (past.length === 0) {
            return [newSnapshot];
          }
          const initialSnapshot = past[past.length - 1];

          // 如果还没达到上限，正常添加（不重复保存 initialSnapshot）
          if (past.length < maxSnapshots) {
            return [newSnapshot, ...past];
          }

          return [newSnapshot, ...past.slice(0, -1).slice(0, maxSnapshots - 2), initialSnapshot];
        });

        console.log('[Snapshot] Snapshot saved successfully:', {
          title: newSnapshot.title,
          nodeCount: newSnapshot.nodes.length,
          edgeCount: newSnapshot.edges.length,
          isSaved
        });

        return true;
      } catch (error) {
        console.error('[Snapshot] Failed to save snapshot:', error);
        return false;
      }
    },
    [past, forbiddenSaveSnapshot]
  );

  const undo = useCallback(() => {
    if (past.length > 1) {
      forbiddenSaveSnapshot.current = true;
      // Current version is the first one, so we need to reset the second one
      const firstPast = past[1];
      resetSnapshot(firstPast);

      setFuture((future) => [past[0], ...future]);
      setPast((past) => past.slice(1));
    }
  }, [past, resetSnapshot, forbiddenSaveSnapshot]);

  const redo = useCallback(() => {
    if (!future[0]) return;

    const futureState = future[0];

    if (futureState) {
      forbiddenSaveSnapshot.current = true;
      setPast((past) => [futureState, ...past]);
      setFuture((future) => future.slice(1));

      resetSnapshot(futureState);
    }
  }, [future, resetSnapshot, forbiddenSaveSnapshot]);

  const onSwitchTmpVersion = useCallback(
    (params: WorkflowSnapshotsType, customTitle: string) => {
      // Remove multiple "copy-"
      const copyText = t('app:version_copy');
      const regex = new RegExp(`(${copyText}-)\\1+`, 'g');
      const title = customTitle.replace(regex, `$1`);

      resetSnapshot(params);

      return pushPastSnapshot({
        pastNodes: params.nodes,
        pastEdges: params.edges,
        chatConfig: params.chatConfig,
        customTitle: title
      });
    },
    [t, resetSnapshot, pushPastSnapshot]
  );

  const onSwitchCloudVersion = useCallback(
    (appVersion: AppVersionSchemaType) => {
      const nodes = appVersion.nodes.map((item) => storeNode2FlowNode({ item, t }));
      const edges = appVersion.edges.map((item) => storeEdge2RenderEdge({ edge: item }));
      const chatConfig = appVersion.chatConfig;

      resetSnapshot({
        nodes,
        edges,
        chatConfig
      });

      return pushPastSnapshot({
        pastNodes: nodes,
        pastEdges: edges,
        chatConfig,
        customTitle: `${t('app:version_copy')}-${appVersion.versionName}`
      });
    },
    [t, resetSnapshot, pushPastSnapshot]
  );

  const contextValue = useMemoEnhance(() => {
    console.log('WorkflowSnapshotContextValue 更新了');
    return {
      past,
      setPast,
      future,
      undo,
      redo,
      canUndo: past.length > 1,
      canRedo: future.length > 0,
      pushPastSnapshot,
      onSwitchTmpVersion,
      onSwitchCloudVersion
    };
  }, [past, future, undo, redo, pushPastSnapshot, onSwitchTmpVersion, onSwitchCloudVersion]);

  return (
    <WorkflowSnapshotContext.Provider value={contextValue}>
      {children}
    </WorkflowSnapshotContext.Provider>
  );
};
