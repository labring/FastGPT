import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../../context';
import { useWorkflowBuilderUI } from '../context';
import {
  getWorkflowBuilderAttentionKeys,
  getWorkflowBuilderEntryAccess,
  getWorkflowBuilderEntryVisualState,
  hasUnseenWorkflowBuilderAttention,
  useWorkflowBuilderVersionExpired
} from '../uiState';

/**
 * 统一派生 Workflow Builder 入口按钮的展示权限、流光运行态以及未读红点。
 * 将细粒度关注状态与主入口视图解耦，保持组件纯粹。
 */
export const useWorkflowBuilderEntryVisual = () => {
  const feConfigs = useSystemStore((state) => state.feConfigs);
  const systemInitialized = useSystemStore((state) => state.initd);
  const appDetail = useContextSelector(AppContext, (value) => value.appDetail);
  const { activeLeftPanel, activity, acknowledgedAttentionKeys } = useWorkflowBuilderUI();

  const isOpen = activeLeftPanel === 'workflowBuilder';
  const isLatestVersionExpired = useWorkflowBuilderVersionExpired(
    activity.latestVersion?.version.expiresAt
  );
  const pendingVersionChecksum =
    activity.latestVersion && !activity.latestVersion.version.appliedAt && !isLatestVersionExpired
      ? activity.latestVersion.version.checksum
      : undefined;

  const attentionKeys = getWorkflowBuilderAttentionKeys({
    pendingInteractiveKey: activity.pendingInteractiveKey,
    pendingVersionChecksum,
    errorAttentionKey: activity.errorAttentionKey
  });

  const { showGeneratingHalo, showAttentionDot } = getWorkflowBuilderEntryVisualState({
    isChatGenerating: activity.isChatGenerating,
    hasPendingAttention:
      !isOpen && hasUnseenWorkflowBuilderAttention({ attentionKeys, acknowledgedAttentionKeys })
  });

  const entryAccess = getWorkflowBuilderEntryAccess({
    systemInitialized,
    isPlus: !!feConfigs?.isPlus,
    showAgentSandbox: !!feConfigs?.show_agent_sandbox,
    showWorkflowBuilder: feConfigs?.show_workflow_builder !== false,
    canEdit: !!appDetail.permission?.hasWritePer
  });

  return {
    entryAccess,
    showGeneratingHalo,
    showAttentionDot
  };
};
