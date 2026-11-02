import type { AIChatItemValueItemType, UserChatItemType } from '../../chat/type';
import { getUserChatSelect } from '../../chat/input/utils';
import { extractDeepestInteractive } from '../runtime/utils';
import {
  WorkflowBuilderPreviewInteractiveSchema,
  WorkflowBuilderPreviewArgumentsSchema,
  type WorkflowBuilderPreviewDecision,
  type WorkflowBuilderPreviewInteractive,
  type WorkflowBuilderVersion,
  type WorkflowBuilderVersionDisplayState
} from './type';
import appErr, { AppErrEnum } from '../../../common/error/code/app';
import { getErrResponse, UserError } from '../../../common/error/utils';

/** 安全读取预览展示内容；旧格式或损坏参数不阻断历史会话和普通输入。 */
export const parseWorkflowBuilderPreviewArguments = (value: unknown) => {
  const parsed = WorkflowBuilderPreviewArgumentsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

/** 失败日志只保留受控类别和数字错误码，避免原始异常携带凭证、工作流正文或归档路径。 */
export const getWorkflowBuilderErrorLog = (error: unknown) => {
  const response = getErrResponse(error);
  const code: unknown = response?.code;
  // 服务内部仍抛 UserError(message)，API转换成数字码之前也需保留可检索的业务原因。
  const knownReasons = new Map([
    [AppErrEnum.workflowBuilderVersionExpired, 'version_expired'],
    [AppErrEnum.workflowBuilderVersionNotFound, 'version_not_found'],
    ['Workflow Builder version checksum mismatch', 'checksum_mismatch'],
    ['Workflow Builder version has been superseded', 'version_superseded'],
    ['Workflow Builder version file is invalid', 'version_file_invalid'],
    ['Workflow Builder version has not been archived', 'version_not_archived']
  ]);
  const reason = (() => {
    if (isWorkflowBuilderVersionExpiredError(error)) return 'version_expired';
    if (error instanceof UserError) return knownReasons.get(error.message) ?? 'workflow_error';
    return 'workflow_error';
  })();
  return {
    reason,
    errorType: error instanceof TypeError ? 'TypeError' : 'Error',
    ...(typeof code === 'number' ? { code } : {})
  };
};

/** 识别 API 返回的版本过期业务码，不依赖错误展示文案或 Error 实例。 */
export const isWorkflowBuilderVersionExpiredError = (error: unknown): boolean =>
  getErrResponse(error)?.code === appErr[AppErrEnum.workflowBuilderVersionExpired].code;

/**
 * 根据归档、应用和过期事实推导版本卡片状态。
 */
export const getWorkflowBuilderVersionDisplayState = ({
  version,
  now = Date.now()
}: {
  version: WorkflowBuilderVersion;
  now?: number;
}): WorkflowBuilderVersionDisplayState => {
  if (version.expiresAt && new Date(version.expiresAt).getTime() <= now) return 'expired';
  return version.appliedAt ? 'available' : 'ready';
};

/** 读取 AI 消息末次交互中的预览展示值，兼容工具子交互包装，不修改聊天记录。 */
export const getWorkflowBuilderPreview = (values: readonly AIChatItemValueItemType[]) => {
  const interactive = values.findLast(
    (value) => !value.displayOnly && value.interactive
  )?.interactive;
  if (!interactive) return;
  const preview = extractDeepestInteractive(interactive);
  if (preview?.type !== 'workflowBuilderPreview') return;
  const result = WorkflowBuilderPreviewInteractiveSchema.safeParse(preview);
  return result.success ? result.data : undefined;
};

/**
 * 按稳定 action 解析紧邻 Human 的回答，revise 必须包含修改意见；普通文本作为修改意见。
 * 调用方负责保证消息相邻，缺失、空回答或其他类型的选择不能构成预览决策。
 */
export const getWorkflowBuilderPreviewDecision = ({
  preview,
  userContent
}: {
  preview: WorkflowBuilderPreviewInteractive;
  userContent: UserChatItemType;
}): WorkflowBuilderPreviewDecision | undefined => {
  const select = getUserChatSelect(userContent.value);
  if (select) {
    if (select.type !== 'workflowBuilderPreview') return;
    const feedback = select.action === 'revise' ? select.reviseText : undefined;
    return {
      previewId: preview.params.toolCallId,
      action: select.action,
      ...(feedback ? { feedback } : {})
    };
  }
  const text = userContent.value
    .map((value) => value.text?.content ?? '')
    .join('')
    .trim();
  if (!text) return;
  return {
    previewId: preview.params.toolCallId,
    action: 'revise',
    feedback: text
  };
};

/** 将 Human 决策投影为预览工具的完成结果；仅供续跑和历史适配，不持久化到原 AI 消息。 */
export const getWorkflowBuilderPreviewToolResponse = (
  decision: WorkflowBuilderPreviewDecision
) => ({
  ok: true,
  state:
    decision.action === 'confirm'
      ? 'confirmed'
      : decision.action === 'revise'
        ? 'revision_requested'
        : 'cancelled',
  previewId: decision.previewId,
  decision: decision.action,
  ...(decision.action === 'revise' ? { feedback: decision.feedback ?? '' } : {}),
  taskComplete: decision.action === 'cancel'
});
