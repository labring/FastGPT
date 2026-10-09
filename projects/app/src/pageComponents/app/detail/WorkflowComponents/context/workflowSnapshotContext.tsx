// 工作流快照管理层
import { AppContext } from '@/pageComponents/app/detail/context';
import { storeEdge2RenderEdge, storeNodes2FlowNodes } from '@/web/core/workflow/utils';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo } from 'react';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { Edge, Node } from '@xyflow/react';
import { createContext, useContextSelector } from 'use-context-selector';
import type { WorkflowStateType } from './type';
import { useWorkflowStore } from '../store/useWorkflowStore';

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
    pastNodes: Node<FlowNodeItemType>[];
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
  setPast: function (_value: React.SetStateAction<WorkflowSnapshotsType[]>): void {
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
  pushPastSnapshot: function (_params: {
    pastNodes: Node[];
    pastEdges: Edge[];
    chatConfig: AppChatConfigType;
    customTitle?: string;
    isSaved?: boolean;
  }): boolean {
    throw new Error('Function not implemented.');
  },
  onSwitchTmpVersion: function (_data: WorkflowSnapshotsType, _customTitle: string): boolean {
    throw new Error('Function not implemented.');
  },
  onSwitchCloudVersion: function (_appVersion: AppVersionSchemaType): boolean {
    throw new Error('Function not implemented.');
  }
});

export const WorkflowSnapshotProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const setAppDetail = useContextSelector(AppContext, (v) => v.setAppDetail);

  const past = useWorkflowStore((s) => s.past);
  const setPast = useWorkflowStore((s) => s.setPast);
  const future = useWorkflowStore((s) => s.future);
  const storeUndo = useWorkflowStore((s) => s.undo);
  const storeRedo = useWorkflowStore((s) => s.redo);
  const pushPastSnapshot = useWorkflowStore((s) => s.pushPastSnapshot);
  const storeResetSnapshot = useWorkflowStore((s) => s.resetSnapshot);

  const resetSnapshot = useCallback(
    (state: WorkflowStateType) => {
      storeResetSnapshot(state);
      setAppDetail((detail) => ({
        ...detail,
        chatConfig: state.chatConfig
      }));
    },
    [storeResetSnapshot, setAppDetail]
  );

  const undo = useCallback(() => {
    storeUndo((snapshot) => {
      setAppDetail((detail) => ({
        ...detail,
        chatConfig: snapshot.chatConfig
      }));
    });
  }, [storeUndo, setAppDetail]);

  const redo = useCallback(() => {
    storeRedo((snapshot) => {
      setAppDetail((detail) => ({
        ...detail,
        chatConfig: snapshot.chatConfig
      }));
    });
  }, [storeRedo, setAppDetail]);

  const onSwitchTmpVersion = useCallback(
    (params: WorkflowSnapshotsType, customTitle: string) => {
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
      const edges = appVersion.edges.map((item) => storeEdge2RenderEdge({ edge: item }));
      const toolNodeIds = new Set(
        appVersion.edges
          .filter(
            (edge) =>
              edge.targetHandle === NodeOutputKeyEnum.selectedTools ||
              edge.sourceHandle === NodeOutputKeyEnum.selectedTools
          )
          .map((edge) => edge.source)
      );
      const nodes = storeNodes2FlowNodes({
        nodes: appVersion.nodes,
        t,
        toolNodeIds
      });

      resetSnapshot({
        nodes,
        edges,
        chatConfig: appVersion.chatConfig
      });

      return pushPastSnapshot({
        pastNodes: nodes,
        pastEdges: edges,
        chatConfig: appVersion.chatConfig,
        customTitle: `${t('app:version_copy')}-${appVersion.versionName}`
      });
    },
    [t, resetSnapshot, pushPastSnapshot]
  );

  const contextValue = useMemo(
    () => ({
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
    }),
    [past, setPast, future, undo, redo, pushPastSnapshot, onSwitchTmpVersion, onSwitchCloudVersion]
  );

  return (
    <WorkflowSnapshotContext.Provider value={contextValue}>
      {children}
    </WorkflowSnapshotContext.Provider>
  );
};
