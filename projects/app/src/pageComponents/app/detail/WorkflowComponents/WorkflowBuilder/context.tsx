import React, { useMemo, useRef, useState } from 'react';
import { createContext } from 'use-context-selector';
import type { WorkflowBuilderVersion } from '@fastgpt/global/core/workflow/builder/type';
import type { WorkflowBuilderEntryAccess } from './uiState';

type WorkflowBuilderLeftPanel = 'workflowBuilder' | 'nodeTemplates' | 'systemConfig';
type WorkflowBuilderGuideStep = 'systemConfig' | 'workflowBuilder';
type WorkflowBuilderVersionTarget = {
  version: WorkflowBuilderVersion;
  responseChatItemId: string;
};
export type WorkflowBuilderActivity = {
  isChatGenerating: boolean;
  isBuildingWorkflow: boolean;
  pendingInteractiveKey?: string;
  errorAttentionKey?: string;
  latestVersion?: WorkflowBuilderVersionTarget;
};

type WorkflowBuilderUIConfig = {
  appId: string;
  canEdit: boolean;
  entryAccess: WorkflowBuilderEntryAccess;
  systemInitialized: boolean;
};

type WorkflowBuilderUIState = WorkflowBuilderUIConfig & {
  workflowCanvasRef: React.MutableRefObject<HTMLDivElement | null>;
  autoOpenAfterGuideRef: React.MutableRefObject<boolean>;
  activeLeftPanel?: WorkflowBuilderLeftPanel;
  setActiveLeftPanel: React.Dispatch<React.SetStateAction<WorkflowBuilderLeftPanel | undefined>>;
  guideStep?: WorkflowBuilderGuideStep;
  setGuideStep: React.Dispatch<React.SetStateAction<WorkflowBuilderGuideStep | undefined>>;
  focusRequestId: number;
  setFocusRequestId: React.Dispatch<React.SetStateAction<number>>;
  activity: WorkflowBuilderActivity;
  setActivity: React.Dispatch<React.SetStateAction<WorkflowBuilderActivity>>;
  dismissedBannerChecksum?: string;
  setDismissedBannerChecksum: React.Dispatch<React.SetStateAction<string | undefined>>;
  acknowledgedAttentionKeys: string[];
  setAcknowledgedAttentionKeys: React.Dispatch<React.SetStateAction<string[]>>;
};

const DEFAULT_ACTIVITY: WorkflowBuilderActivity = {
  isChatGenerating: false,
  isBuildingWorkflow: false
};

export const WorkflowBuilderUIContext = createContext<WorkflowBuilderUIState>({
  appId: '',
  canEdit: false,
  entryAccess: 'hidden',
  systemInitialized: false,
  workflowCanvasRef: { current: null },
  autoOpenAfterGuideRef: { current: false },
  setActiveLeftPanel: () => undefined,
  setGuideStep: () => undefined,
  focusRequestId: 0,
  setFocusRequestId: () => undefined,
  activity: DEFAULT_ACTIVITY,
  setActivity: () => undefined,
  setDismissedBannerChecksum: () => undefined,
  acknowledgedAttentionKeys: [],
  setAcknowledgedAttentionKeys: () => undefined
});

/**
 * 保存编辑页共享 UI 状态及原始 setter；面板操作、提醒计算和首次引导由 UI Hook 统一处理。
 * 同一 Provider 内的按钮、横幅和面板共享已读记录，避免多次调用 Hook 时各自维护一份状态。
 */
export const WorkflowBuilderUIProvider = ({
  appId,
  canEdit,
  entryAccess,
  systemInitialized,
  children
}: React.PropsWithChildren<WorkflowBuilderUIConfig>) => {
  const workflowCanvasRef = useRef<HTMLDivElement>(null);
  const autoOpenAfterGuideRef = useRef(false);
  const [activeLeftPanel, setActiveLeftPanel] = useState<WorkflowBuilderLeftPanel>();
  const [guideStep, setGuideStep] = useState<WorkflowBuilderGuideStep>();
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [activity, setActivity] = useState(DEFAULT_ACTIVITY);
  const [dismissedBannerChecksum, setDismissedBannerChecksum] = useState<string>();
  const [acknowledgedAttentionKeys, setAcknowledgedAttentionKeys] = useState<string[]>([]);

  const value = useMemo<WorkflowBuilderUIState>(
    () => ({
      appId,
      canEdit,
      entryAccess,
      systemInitialized,
      workflowCanvasRef,
      autoOpenAfterGuideRef,
      activeLeftPanel,
      setActiveLeftPanel,
      guideStep,
      setGuideStep,
      focusRequestId,
      setFocusRequestId,
      activity,
      setActivity,
      dismissedBannerChecksum,
      setDismissedBannerChecksum,
      acknowledgedAttentionKeys,
      setAcknowledgedAttentionKeys
    }),
    [
      appId,
      canEdit,
      entryAccess,
      systemInitialized,
      activeLeftPanel,
      guideStep,
      focusRequestId,
      activity,
      dismissedBannerChecksum,
      acknowledgedAttentionKeys
    ]
  );

  return (
    <WorkflowBuilderUIContext.Provider value={value}>{children}</WorkflowBuilderUIContext.Provider>
  );
};
