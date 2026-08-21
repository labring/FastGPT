import { useEffect, useState } from 'react';
import { ChatGenerateStatusEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemObjItemType } from '@fastgpt/global/core/chat/type';
import {
  extractDeepestInteractive,
  getLastInteractiveValue
} from '@fastgpt/global/core/workflow/runtime/utils';

export type WorkflowBuilderEntryVisualState = {
  showGeneratingHalo: boolean;
  showAttentionDot: boolean;
};

export type WorkflowBuilderInitialState = {
  activeLeftPanel?: 'workflowBuilder' | 'systemConfig';
  guideStep?: 'systemConfig';
  shouldCompleteSystemConfigFirstEntryGuide: boolean;
  shouldFocusWorkflowBuilder: boolean;
};

export type WorkflowBuilderEntryAccess = 'hidden' | 'upgrade' | 'enabled';

/** 仅允许可用的 Builder 在当前应用和成员首次打开时主动预热运行环境。 */
export const shouldPrewarmWorkflowBuilderRuntime = ({
  workflowBuilderEnabled,
  isOpen,
  chatId,
  runtimeKey,
  prewarmStartedRuntimeKey
}: {
  workflowBuilderEnabled: boolean;
  isOpen: boolean;
  chatId: string;
  runtimeKey: string;
  prewarmStartedRuntimeKey: string;
}) =>
  workflowBuilderEnabled &&
  isOpen &&
  Boolean(chatId) &&
  Boolean(runtimeKey) &&
  runtimeKey !== prewarmStartedRuntimeKey;

/**
 * 决定 Builder 入口展示方式。
 * 社区版保留升级入口；无编辑权限或商业版管理员关闭依赖能力时直接隐藏。
 */
export const getWorkflowBuilderEntryAccess = ({
  systemInitialized,
  isPlus,
  showAgentSandbox,
  showWorkflowBuilder,
  canEdit
}: {
  systemInitialized: boolean;
  isPlus: boolean;
  showAgentSandbox: boolean;
  showWorkflowBuilder: boolean;
  canEdit: boolean;
}): WorkflowBuilderEntryAccess => {
  if (!systemInitialized || !canEdit) return 'hidden';
  if (!isPlus) return 'upgrade';
  if (!showAgentSandbox || !showWorkflowBuilder) return 'hidden';
  return 'enabled';
};

/**
 * 根据编辑权限、入口可见性和 Builder 可用性决定首次进入时的面板状态。
 * 入口可见时统一执行两步引导；仅入口被管理员关闭时回退旧版系统配置行为。
 */
export const getWorkflowBuilderInitialState = ({
  canEdit,
  workflowBuilderEntryVisible,
  workflowBuilderEnabled,
  shouldAutoOpen,
  hasCompletedSystemConfigFirstEntryGuide,
  hasCompletedWorkflowBuilderFirstEntryGuide
}: {
  canEdit: boolean;
  workflowBuilderEntryVisible: boolean;
  workflowBuilderEnabled: boolean;
  shouldAutoOpen: boolean;
  hasCompletedSystemConfigFirstEntryGuide: boolean;
  hasCompletedWorkflowBuilderFirstEntryGuide: boolean;
}): WorkflowBuilderInitialState => {
  if (!canEdit) {
    return {
      shouldCompleteSystemConfigFirstEntryGuide: false,
      shouldFocusWorkflowBuilder: false
    };
  }

  if (!workflowBuilderEntryVisible) {
    const shouldOpenSystemConfig = shouldAutoOpen || !hasCompletedSystemConfigFirstEntryGuide;

    return {
      activeLeftPanel: shouldOpenSystemConfig ? 'systemConfig' : undefined,
      shouldCompleteSystemConfigFirstEntryGuide: !hasCompletedSystemConfigFirstEntryGuide,
      shouldFocusWorkflowBuilder: false
    };
  }

  if (!hasCompletedWorkflowBuilderFirstEntryGuide) {
    return {
      guideStep: 'systemConfig',
      shouldCompleteSystemConfigFirstEntryGuide: false,
      shouldFocusWorkflowBuilder: false
    };
  }

  const shouldOpenWorkflowBuilder = workflowBuilderEnabled && shouldAutoOpen;

  return {
    activeLeftPanel: shouldOpenWorkflowBuilder ? 'workflowBuilder' : undefined,
    shouldCompleteSystemConfigFirstEntryGuide: false,
    shouldFocusWorkflowBuilder: shouldOpenWorkflowBuilder
  };
};

/** 在版本到期时主动刷新 UI，避免提醒和横幅停留在可应用状态。 */
export const useWorkflowBuilderVersionExpired = (expiresAt?: string) => {
  const [expiredVersion, setExpiredVersion] = useState<string>();

  useEffect(() => {
    if (!expiresAt) return;

    const expiresAtTime = new Date(expiresAt).getTime();
    const remainingTime = expiresAtTime - Date.now();
    const updateExpiredState = () => setExpiredVersion(expiresAt);

    const timer = window.setTimeout(updateExpiredState, Math.max(remainingTime + 1, 0));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  return Boolean(expiresAt && expiredVersion === expiresAt);
};

/**
 * 仅在用户确认最新 Mermaid 方案、且对应版本尚未返回时标记为工作流生成阶段。
 * 刷新后允许使用当前会话的阶段缓存兜底，但聊天流终止或版本已返回时必须优先关闭光环。
 */
export const isWorkflowBuilderVersionGenerating = ({
  chatRecords,
  isChatGenerating,
  wasBuildingWorkflow = false
}: {
  chatRecords: readonly ChatItemObjItemType[];
  isChatGenerating: boolean;
  wasBuildingWorkflow?: boolean;
}) => {
  if (!isChatGenerating) return false;

  let latestConfirmedPreviewOrder = -1;
  let latestPreviewOrder = -1;
  let latestVersionOrder = -1;
  let valueOrder = 0;

  chatRecords.forEach((record) => {
    if (record.obj !== ChatRoleEnum.AI) return;

    record.value.forEach((value) => {
      valueOrder += 1;

      if (value.workflowBuilderVersion) {
        latestVersionOrder = valueOrder;
      }

      if (!value.interactive) return;
      const interactive = extractDeepestInteractive(value.interactive);
      if (interactive.type === 'workflowBuilderPreview') {
        latestPreviewOrder = valueOrder;
        if (interactive.params.answerValue === 'confirm') {
          latestConfirmedPreviewOrder = valueOrder;
        }
      }
    });
  });

  if (latestConfirmedPreviewOrder > latestVersionOrder) return true;

  // 刷新时服务端尚未落下 confirm，但最新预览仍位于旧版本之后，此时沿用本标签页的确认态。
  return wasBuildingWorkflow && latestPreviewOrder >= latestVersionOrder;
};

/** 使用最后一条 AI 消息及 value 位置标识当前阻塞交互，新交互会自然产生新 key。 */
export const getWorkflowBuilderPendingInteractiveKey = (
  chatRecords: readonly (ChatItemObjItemType & { dataId: string })[],
  { isBuildingWorkflow = false }: { isBuildingWorkflow?: boolean } = {}
) => {
  const pendingInteractive = getLastInteractiveValue([...chatRecords]);
  if (!pendingInteractive) return;

  const lastAIRecord = chatRecords.findLast((record) => record.obj === ChatRoleEnum.AI);
  if (!lastAIRecord) return;

  const finalInteractive = extractDeepestInteractive(pendingInteractive);
  if (finalInteractive.type === 'workflowBuilderPreview' && isBuildingWorkflow) return;

  const interactiveId =
    finalInteractive.type === 'workflowBuilderPreview'
      ? finalInteractive.previewId
      : (finalInteractive.askId ?? pendingInteractive.askId ?? '');

  return [
    'interactive',
    lastAIRecord.dataId,
    lastAIRecord.value.length - 1,
    finalInteractive.type,
    interactiveId
  ].join(':');
};

/**
 * 生成失败时使用本次运行的末条聊天记录标识错误提醒。
 * 即使恢复流错误没有保留空 AI 消息，末条用户消息仍能稳定区分不同运行。
 */
export const getWorkflowBuilderErrorAttentionKey = ({
  chatRecords,
  chatGenerateStatus
}: {
  chatRecords: readonly (ChatItemObjItemType & { dataId: string })[];
  chatGenerateStatus?: ChatGenerateStatusEnum;
}) => {
  if (chatGenerateStatus !== ChatGenerateStatusEnum.error) return;

  const failedRunRecord = chatRecords.at(-1);
  if (!failedRunRecord) return;

  return `error:${failedRunRecord.dataId}`;
};

/** 将当前待交互、待应用版本和运行错误整理成可独立确认已查看的提醒 key。 */
export const getWorkflowBuilderAttentionKeys = ({
  pendingInteractiveKey,
  pendingVersionChecksum,
  errorAttentionKey
}: {
  pendingInteractiveKey?: string;
  pendingVersionChecksum?: string;
  errorAttentionKey?: string;
}) =>
  [
    pendingInteractiveKey,
    pendingVersionChecksum ? `version:${pendingVersionChecksum}` : undefined,
    errorAttentionKey
  ].filter((key): key is string => Boolean(key));

/** 当前任一待处理事项尚未被本页面查看时展示红点。 */
export const hasUnseenWorkflowBuilderAttention = ({
  attentionKeys,
  acknowledgedAttentionKeys
}: {
  attentionKeys: readonly string[];
  acknowledgedAttentionKeys: readonly string[];
}) => attentionKeys.some((key) => !acknowledgedAttentionKeys.includes(key));

/** 光环跟随完整的 AI 回复运行态；红点跟随待处理事项，两者可以同时显示。 */
export const getWorkflowBuilderEntryVisualState = ({
  isChatGenerating,
  hasPendingAttention
}: {
  isChatGenerating: boolean;
  hasPendingAttention: boolean;
}): WorkflowBuilderEntryVisualState => ({
  showGeneratingHalo: isChatGenerating,
  showAttentionDot: hasPendingAttention
});
