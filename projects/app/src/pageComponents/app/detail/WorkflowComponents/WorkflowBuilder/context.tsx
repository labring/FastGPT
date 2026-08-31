import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { createContext, useContextSelector } from 'use-context-selector';
import { useAppEditorUIState } from '@/components/core/app/useAppEditorUIState';
import { WORKFLOW_BUILDER_AUTO_OPEN_QUERY_KEY } from '@/web/core/app/utils';
import type { WorkflowBuilderVersion } from '@fastgpt/global/core/workflow/builder/type';
import { getWorkflowBuilderAttentionKeys, getWorkflowBuilderInitialState } from './uiState';

export type WorkflowBuilderLeftPanel = 'workflowBuilder' | 'nodeTemplates' | 'systemConfig';
export type WorkflowBuilderGuideStep = 'systemConfig' | 'workflowBuilder';
export type WorkflowBuilderVersionTarget = {
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

type WorkflowBuilderUIContextValue = {
  workflowCanvasRef: React.MutableRefObject<HTMLDivElement | null>;
  activeLeftPanel?: WorkflowBuilderLeftPanel;
  guideStep?: WorkflowBuilderGuideStep;
  focusRequestId: number;
  activity: WorkflowBuilderActivity;
  dismissedBannerChecksum?: string;
  acknowledgedAttentionKeys: string[];
  openLeftPanel: (panel: WorkflowBuilderLeftPanel) => void;
  closeLeftPanel: (panel?: WorkflowBuilderLeftPanel) => void;
  toggleLeftPanel: (panel: WorkflowBuilderLeftPanel) => void;
  completeGuideStep: (step: WorkflowBuilderGuideStep) => void;
  requestInputFocus: () => void;
  setActivity: React.Dispatch<React.SetStateAction<WorkflowBuilderActivity>>;
  acknowledgeAttention: (keys: readonly string[]) => void;
  dismissBanner: (checksum: string) => void;
};

const DEFAULT_ACTIVITY: WorkflowBuilderActivity = {
  isChatGenerating: false,
  isBuildingWorkflow: false
};

export const WorkflowBuilderUIContext = createContext<WorkflowBuilderUIContextValue>({
  workflowCanvasRef: { current: null },
  focusRequestId: 0,
  activity: DEFAULT_ACTIVITY,
  acknowledgedAttentionKeys: [],
  openLeftPanel: () => undefined,
  closeLeftPanel: () => undefined,
  toggleLeftPanel: () => undefined,
  completeGuideStep: () => undefined,
  requestInputFocus: () => undefined,
  setActivity: () => undefined,
  acknowledgeAttention: () => undefined,
  dismissBanner: () => undefined
});

/**
 * 统一编排 Workflow 编辑页左侧主面板、首次引导和 Builder 聊天派生状态。
 * 新建路由标记只决定引导结束后是否自动打开，不参与后续持久化。
 */
export const WorkflowBuilderUIProvider = ({
  appId,
  canEdit,
  workflowBuilderEntryVisible,
  workflowBuilderEnabled,
  systemInitialized,
  children
}: {
  appId: string;
  canEdit: boolean;
  workflowBuilderEntryVisible: boolean;
  workflowBuilderEnabled: boolean;
  systemInitialized: boolean;
  children: React.ReactNode;
}) => {
  const router = useRouter();
  const workflowCanvasRef = useRef<HTMLDivElement>(null);
  const {
    hasCompletedSystemConfigFirstEntryGuide,
    completeSystemConfigFirstEntryGuide,
    hasCompletedWorkflowBuilderFirstEntryGuide,
    completeWorkflowBuilderFirstEntryGuide
  } = useAppEditorUIState(appId);
  const [activeLeftPanel, setActiveLeftPanel] = useState<WorkflowBuilderLeftPanel>();
  const [guideStep, setGuideStep] = useState<WorkflowBuilderGuideStep>();
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [activity, setActivity] = useState(DEFAULT_ACTIVITY);
  const [dismissedBannerChecksum, setDismissedBannerChecksum] = useState<string>();
  const [acknowledgedAttentionKeys, setAcknowledgedAttentionKeys] = useState<string[]>([]);
  const handledAppIdRef = useRef<string>();
  const autoOpenAfterGuideRef = useRef(false);

  const requestInputFocus = useCallback(() => setFocusRequestId((value) => value + 1), []);
  const acknowledgeAttention = useCallback((keys: readonly string[]) => {
    if (keys.length === 0) return;

    setAcknowledgedAttentionKeys((current) => {
      const unseenKeys = keys.filter((key) => !current.includes(key));
      return unseenKeys.length > 0 ? [...current, ...unseenKeys] : current;
    });
  }, []);
  const currentAttentionKeys = useMemo(
    () =>
      getWorkflowBuilderAttentionKeys({
        pendingInteractiveKey: activity.pendingInteractiveKey,
        pendingVersionChecksum: activity.latestVersion?.version.checksum,
        errorAttentionKey: activity.errorAttentionKey
      }),
    [
      activity.errorAttentionKey,
      activity.latestVersion?.version.checksum,
      activity.pendingInteractiveKey
    ]
  );

  const acknowledgeWorkflowBuilderView = useCallback(() => {
    acknowledgeAttention(currentAttentionKeys);
    const latestVersionChecksum = activity.latestVersion?.version.checksum;
    if (latestVersionChecksum) setDismissedBannerChecksum(latestVersionChecksum);
  }, [acknowledgeAttention, activity.latestVersion?.version.checksum, currentAttentionKeys]);

  useEffect(() => {
    if (!systemInitialized || !router.isReady || !appId || handledAppIdRef.current === appId) {
      return;
    }

    // Router 就绪属于外部状态变化，延后一拍初始化可避免在 Effect 主体内级联渲染。
    const timer = window.setTimeout(() => {
      handledAppIdRef.current = appId;
      const rawFlag = router.query[WORKFLOW_BUILDER_AUTO_OPEN_QUERY_KEY];
      const shouldAutoOpen = Array.isArray(rawFlag) ? rawFlag.includes('1') : rawFlag === '1';
      autoOpenAfterGuideRef.current = workflowBuilderEnabled && shouldAutoOpen;

      if (shouldAutoOpen) {
        const nextQuery = { ...router.query };
        delete nextQuery[WORKFLOW_BUILDER_AUTO_OPEN_QUERY_KEY];
        void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
          shallow: true
        });
      }

      const initialState = getWorkflowBuilderInitialState({
        canEdit,
        workflowBuilderEntryVisible,
        workflowBuilderEnabled,
        shouldAutoOpen,
        hasCompletedSystemConfigFirstEntryGuide,
        hasCompletedWorkflowBuilderFirstEntryGuide
      });

      if (initialState.activeLeftPanel) {
        setActiveLeftPanel(initialState.activeLeftPanel);
      }
      if (initialState.guideStep) {
        setGuideStep(initialState.guideStep);
      }
      if (initialState.shouldCompleteSystemConfigFirstEntryGuide) {
        completeSystemConfigFirstEntryGuide();
      }
      if (initialState.shouldFocusWorkflowBuilder) {
        requestInputFocus();
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    appId,
    canEdit,
    completeSystemConfigFirstEntryGuide,
    hasCompletedSystemConfigFirstEntryGuide,
    hasCompletedWorkflowBuilderFirstEntryGuide,
    requestInputFocus,
    router,
    systemInitialized,
    workflowBuilderEntryVisible,
    workflowBuilderEnabled
  ]);

  const openLeftPanel = useCallback(
    (panel: WorkflowBuilderLeftPanel) => {
      // 进入或离开 Builder 都表示用户已经看过面板内容，红点和当前版本横幅必须一起确认。
      if (panel === 'workflowBuilder' || activeLeftPanel === 'workflowBuilder') {
        acknowledgeWorkflowBuilderView();
      }
      setActiveLeftPanel(panel);
    },
    [acknowledgeWorkflowBuilderView, activeLeftPanel]
  );
  const closeLeftPanel = useCallback(
    (panel?: WorkflowBuilderLeftPanel) => {
      if (panel === 'workflowBuilder' || (!panel && activeLeftPanel === 'workflowBuilder')) {
        acknowledgeWorkflowBuilderView();
      }
      setActiveLeftPanel((current) => (!panel || current === panel ? undefined : current));
    },
    [acknowledgeWorkflowBuilderView, activeLeftPanel]
  );
  const toggleLeftPanel = useCallback(
    (panel: WorkflowBuilderLeftPanel) => {
      if (panel === 'workflowBuilder') acknowledgeWorkflowBuilderView();
      setActiveLeftPanel((current) => (current === panel ? undefined : panel));
    },
    [acknowledgeWorkflowBuilderView]
  );

  const completeGuideStep = useCallback(
    (step: WorkflowBuilderGuideStep) => {
      if (step === 'systemConfig') {
        setGuideStep(workflowBuilderEntryVisible ? 'workflowBuilder' : undefined);
        return;
      }

      setGuideStep(undefined);
      completeWorkflowBuilderFirstEntryGuide();
      if (workflowBuilderEnabled && autoOpenAfterGuideRef.current) {
        setActiveLeftPanel('workflowBuilder');
        requestInputFocus();
      }
    },
    [
      completeWorkflowBuilderFirstEntryGuide,
      requestInputFocus,
      workflowBuilderEnabled,
      workflowBuilderEntryVisible
    ]
  );

  const value = useMemo<WorkflowBuilderUIContextValue>(
    () => ({
      workflowCanvasRef,
      activeLeftPanel,
      guideStep,
      focusRequestId,
      activity,
      dismissedBannerChecksum,
      acknowledgedAttentionKeys,
      openLeftPanel,
      closeLeftPanel,
      toggleLeftPanel,
      completeGuideStep,
      requestInputFocus,
      setActivity,
      acknowledgeAttention,
      dismissBanner: setDismissedBannerChecksum
    }),
    [
      activeLeftPanel,
      acknowledgeAttention,
      acknowledgedAttentionKeys,
      activity,
      closeLeftPanel,
      completeGuideStep,
      dismissedBannerChecksum,
      focusRequestId,
      guideStep,
      openLeftPanel,
      requestInputFocus,
      toggleLeftPanel
    ]
  );

  return (
    <WorkflowBuilderUIContext.Provider value={value}>{children}</WorkflowBuilderUIContext.Provider>
  );
};

export const useWorkflowBuilderUI = () =>
  useContextSelector(WorkflowBuilderUIContext, (value) => value);
