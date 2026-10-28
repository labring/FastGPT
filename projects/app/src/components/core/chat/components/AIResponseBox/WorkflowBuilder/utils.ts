import type { AgentAskAnswerDetail } from '@/components/core/chat/ChatContainer/ChatBox/Input/AgentAskComposer';
import type {
  WorkflowBuilderPreviewReply,
  WorkflowBuilderVersionDisplayState
} from '@fastgpt/global/core/workflow/builder/type';
import { i18nT } from '@fastgpt/global/common/i18n/utils';

export const workflowBuilderAppliedFeedbackDuration = 1200;

export type WorkflowBuilderVersionButtonState = 'apply' | 'loading' | 'applied' | 'expired';

/** 将版本事实状态和本次点击反馈合并为 Figma 定义的按钮视觉状态。 */
export const getWorkflowBuilderVersionButtonState = ({
  displayState,
  loading,
  showApplied
}: {
  displayState: WorkflowBuilderVersionDisplayState;
  loading: boolean;
  showApplied: boolean;
}): WorkflowBuilderVersionButtonState => {
  if (displayState === 'expired') return displayState;
  if (loading) return 'loading';
  if (showApplied) return 'applied';
  return 'apply';
};

const workflowBuilderToolPresentationMap: Record<string, { nameKey: string; avatar: string }> = {
  workflow_cli_query: {
    nameKey: i18nT('workflow:workflow_builder_tool_query'),
    avatar: 'core/chat/workflowBuilder/query'
  },
  workflow_cli_stage: {
    nameKey: i18nT('workflow:workflow_builder_tool_stage'),
    avatar: 'core/chat/workflowBuilder/stage'
  },
  workflow_cli_commit: {
    nameKey: i18nT('workflow:workflow_builder_tool_commit'),
    avatar: 'core/chat/workflowBuilder/commit'
  },
  workflow_builder_present_preview: {
    nameKey: i18nT('workflow:workflow_builder_tool_preview'),
    avatar: 'core/chat/workflowBuilder/preview'
  },
  workflow_builder_cancel: {
    nameKey: i18nT('workflow:workflow_builder_tool_cancel'),
    avatar: 'core/chat/workflowBuilder/cancel'
  }
};

/** 统一 Workflow Builder 工具在聊天过程与完整响应中的本地化名称和 Figma 图标。 */
export const getWorkflowBuilderToolPresentation = (functionName?: string) => {
  const presentation = functionName ? workflowBuilderToolPresentationMap[functionName] : undefined;
  if (!presentation) return;

  return {
    nameKey: presentation.nameKey,
    avatar: presentation.avatar
  };
};

/**
 * 辅助生成工具按稳定的 functionName 使用当前语言翻译，避免历史名称固定在旧语言。
 * 其他工具保留服务端名称，并兼容名称本身为翻译 key 的情况。
 */
export const getWorkflowBuilderToolDisplayName = ({
  functionName,
  toolName,
  t
}: {
  functionName?: string;
  toolName?: string;
  t: (key: string) => string;
}) => {
  const presentation = getWorkflowBuilderToolPresentation(functionName);
  const builderName = presentation ? t(presentation.nameKey) : undefined;
  if (builderName) return builderName;
  return toolName ? t(toolName) : '';
};

/**
 * 将通用 Agent Ask Composer 的提交结果转换为受 Preview Schema 约束的独立回复。
 *
 * Builder 预览复用了 Agent Ask 的完整导航 UI，其中右上角 X 会产出 `skip`；
 * 在 Builder 语义里它应等价于「取消本次搭建」，否则 Composer 会进入 submitting
 * 但不会真正提交任何 Builder action。
 */
export const resolveWorkflowBuilderPreviewAnswerAction = ({
  answerDetail
}: {
  answerDetail?: AgentAskAnswerDetail;
}): WorkflowBuilderPreviewReply | undefined => {
  if (answerDetail?.kind === 'option') {
    if (answerDetail.value === 'confirm' || answerDetail.value === 'cancel')
      return { type: 'workflowBuilderPreview', action: answerDetail.value };
    return;
  }

  if (answerDetail?.kind === 'custom') {
    const text = answerDetail.value.trim();
    if (!text) return;

    return {
      type: 'workflowBuilderPreview',
      action: 'revise',
      reviseText: text
    };
  }

  if (answerDetail?.kind === 'skip') {
    return { type: 'workflowBuilderPreview', action: 'cancel' };
  }
};
