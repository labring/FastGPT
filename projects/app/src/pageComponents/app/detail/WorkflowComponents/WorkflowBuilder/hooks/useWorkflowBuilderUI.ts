import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import { useAppEditorUIState } from '@/components/core/app/useAppEditorUIState';
import { WORKFLOW_BUILDER_AUTO_OPEN_QUERY_KEY } from '@/web/core/app/utils';
import { WorkflowBuilderUIContext } from '../context';
import {
  getWorkflowBuilderAttentionKeys,
  getWorkflowBuilderEntryVisualState,
  getWorkflowBuilderInitialState,
  hasUnseenWorkflowBuilderAttention,
  useWorkflowBuilderVersionExpired
} from '../uiState';

/**
 * 统一处理 Builder 面板操作、红点/光晕和版本横幅；所有消费者共用 Context 中的已读记录。
 * 组件只消费展示状态和语义操作，不再自行生成提醒 key 或修改已读集合。
 */
export const useWorkflowBuilderUI = () => {
  const {
    appId,
    entryAccess,
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
  } = useContextSelector(WorkflowBuilderUIContext, (value) => value);
  const { completeWorkflowBuilderFirstEntryGuide } = useAppEditorUIState(appId);
  const isOpen = activeLeftPanel === 'workflowBuilder';
  const latestTarget = activity.latestVersion;
  const isLatestVersionExpired = useWorkflowBuilderVersionExpired(latestTarget?.version.expiresAt);
  const pendingVersionChecksum =
    latestTarget && !latestTarget.version.appliedAt && !isLatestVersionExpired
      ? latestTarget.version.checksum
      : undefined;
  const attentionKeys = useMemo(
    () =>
      getWorkflowBuilderAttentionKeys({
        pendingInteractiveKey: activity.pendingInteractiveKey,
        pendingVersionChecksum,
        errorAttentionKey: activity.errorAttentionKey
      }),
    [activity.pendingInteractiveKey, pendingVersionChecksum, activity.errorAttentionKey]
  );
  const { showGeneratingHalo, showAttentionDot } = getWorkflowBuilderEntryVisualState({
    isChatGenerating: activity.isChatGenerating,
    hasPendingAttention:
      !isOpen && hasUnseenWorkflowBuilderAttention({ attentionKeys, acknowledgedAttentionKeys })
  });
  const showLatestBanner = Boolean(
    !isOpen && pendingVersionChecksum && pendingVersionChecksum !== dismissedBannerChecksum
  );

  /** 只确认本次视图中的提醒；函数式更新保留其他消费者刚刚确认的事项。 */
  const acknowledgeAttention = useCallback(() => {
    if (attentionKeys.length === 0) return;
    setAcknowledgedAttentionKeys((current) => {
      const unseenKeys = attentionKeys.filter((key) => !current.includes(key));
      return unseenKeys.length > 0 ? [...current, ...unseenKeys] : current;
    });
  }, [attentionKeys, setAcknowledgedAttentionKeys]);

  const dismissBanner = useCallback(() => {
    if (latestTarget) setDismissedBannerChecksum(latestTarget.version.checksum);
  }, [latestTarget, setDismissedBannerChecksum]);

  const acknowledgeWorkflowBuilderView = useCallback(() => {
    acknowledgeAttention();
    dismissBanner();
  }, [acknowledgeAttention, dismissBanner]);

  /** 进入或离开 Builder 都视为已查看，统一处理工具栏、横幅和面板切换入口。 */
  const openLeftPanel = useCallback(
    (panel: NonNullable<typeof activeLeftPanel>) => {
      if (panel === 'workflowBuilder' || activeLeftPanel === 'workflowBuilder') {
        acknowledgeWorkflowBuilderView();
      }
      setActiveLeftPanel(panel);
    },
    [acknowledgeWorkflowBuilderView, activeLeftPanel, setActiveLeftPanel]
  );
  const closeLeftPanel = useCallback(
    (panel?: typeof activeLeftPanel) => {
      if (panel === 'workflowBuilder' || (!panel && activeLeftPanel === 'workflowBuilder')) {
        acknowledgeWorkflowBuilderView();
      }
      setActiveLeftPanel((current) => (!panel || current === panel ? undefined : current));
    },
    [acknowledgeWorkflowBuilderView, activeLeftPanel, setActiveLeftPanel]
  );
  const toggleLeftPanel = useCallback(
    (panel: NonNullable<typeof activeLeftPanel>) => {
      if (panel === 'workflowBuilder' || activeLeftPanel === 'workflowBuilder') {
        acknowledgeWorkflowBuilderView();
      }
      setActiveLeftPanel((current) => (current === panel ? undefined : panel));
    },
    [acknowledgeWorkflowBuilderView, activeLeftPanel, setActiveLeftPanel]
  );
  const requestInputFocus = useCallback(
    () => setFocusRequestId((current) => current + 1),
    [setFocusRequestId]
  );
  const completeGuideStep = useCallback(
    (step: NonNullable<typeof guideStep>) => {
      if (step === 'systemConfig') {
        setGuideStep(entryAccess !== 'hidden' ? 'workflowBuilder' : undefined);
        return;
      }

      setGuideStep(undefined);
      completeWorkflowBuilderFirstEntryGuide();
      if (entryAccess === 'enabled' && autoOpenAfterGuideRef.current) {
        setActiveLeftPanel('workflowBuilder');
        requestInputFocus();
      }
    },
    [
      entryAccess,
      autoOpenAfterGuideRef,
      completeWorkflowBuilderFirstEntryGuide,
      requestInputFocus,
      setActiveLeftPanel,
      setGuideStep
    ]
  );

  return {
    workflowCanvasRef,
    activeLeftPanel,
    guideStep,
    focusRequestId,
    setActivity,
    entryAccess,
    isOpen,
    latestTarget,
    showGeneratingHalo,
    showAttentionDot,
    showLatestBanner,
    acknowledgeAttention,
    dismissBanner,
    openLeftPanel,
    closeLeftPanel,
    toggleLeftPanel,
    requestInputFocus,
    completeGuideStep
  };
};

/**
 * 在编辑页内只挂载一次，处理路由就绪后的首次面板和引导初始化。
 * 初始化与可多处调用的 UI Hook 分开，避免每个按钮消费者都注册初始化副作用。
 */
export const WorkflowBuilderUIInitializer = () => {
  const router = useRouter();
  const {
    appId,
    canEdit,
    entryAccess,
    systemInitialized,
    autoOpenAfterGuideRef,
    setActiveLeftPanel,
    setGuideStep,
    setFocusRequestId
  } = useContextSelector(WorkflowBuilderUIContext, (value) => value);
  const {
    hasCompletedSystemConfigFirstEntryGuide,
    completeSystemConfigFirstEntryGuide,
    hasCompletedWorkflowBuilderFirstEntryGuide
  } = useAppEditorUIState(appId);
  const handledAppIdRef = useRef<string>();

  useEffect(() => {
    if (!systemInitialized || !router.isReady || !appId || handledAppIdRef.current === appId) {
      return;
    }

    // Router 就绪属于外部状态变化，延后一拍初始化，保持原有首次引导和社区版行为。
    const timer = window.setTimeout(() => {
      handledAppIdRef.current = appId;
      const rawFlag = router.query[WORKFLOW_BUILDER_AUTO_OPEN_QUERY_KEY];
      const shouldAutoOpen = Array.isArray(rawFlag) ? rawFlag.includes('1') : rawFlag === '1';
      autoOpenAfterGuideRef.current = entryAccess === 'enabled' && shouldAutoOpen;

      if (shouldAutoOpen) {
        const nextQuery = { ...router.query };
        delete nextQuery[WORKFLOW_BUILDER_AUTO_OPEN_QUERY_KEY];
        void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
          shallow: true
        });
      }

      const initialState = getWorkflowBuilderInitialState({
        canEdit,
        entryAccess,
        shouldAutoOpen,
        hasCompletedSystemConfigFirstEntryGuide,
        hasCompletedWorkflowBuilderFirstEntryGuide
      });
      if (initialState.activeLeftPanel) setActiveLeftPanel(initialState.activeLeftPanel);
      if (initialState.guideStep) setGuideStep(initialState.guideStep);
      if (initialState.shouldCompleteSystemConfigFirstEntryGuide) {
        completeSystemConfigFirstEntryGuide();
      }
      if (initialState.shouldFocusWorkflowBuilder) setFocusRequestId((current) => current + 1);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    appId,
    canEdit,
    entryAccess,
    systemInitialized,
    autoOpenAfterGuideRef,
    router,
    hasCompletedSystemConfigFirstEntryGuide,
    hasCompletedWorkflowBuilderFirstEntryGuide,
    completeSystemConfigFirstEntryGuide,
    setActiveLeftPanel,
    setGuideStep,
    setFocusRequestId
  ]);

  return null;
};
