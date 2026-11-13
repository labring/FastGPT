import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { getRunningSandboxId } from '../../../ai/sandbox/utils/id';
import type { WorkflowResponseType } from '@fastgpt/global/core/workflow/runtime/sse';
import { markChatSandboxEnabled } from '../../../chat/sandbox/service';

/**
 * 编排 Workflow AI 节点的虚拟机准备流程，并推送准备、升级和就绪状态。
 *
 * 进入即报告 `lazyInit`，并向 `prepareRuntime` 注入 `onUpgrade` 回调在单次 `getSandboxClient` 调用内
 * 推送镜像升级状态（升级结束后切回 `lazyInit` 继续准备文件/Skill/entrypoint）；
 * 成功后先持久化根会话标记再报告 `ready`。
 */
export async function ensureWorkflowSandboxReadyForUse<T>({
  workflowStreamResponse,
  sourceType,
  sourceId,
  userId,
  chatId,
  teamId,
  prepareRuntime
}: {
  workflowStreamResponse?: WorkflowResponseType;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
  teamId: string;
  prepareRuntime: (options: { onUpgrade: () => void }) => Promise<T>;
}): Promise<T> {
  const sandboxId = getRunningSandboxId({ sourceType, sourceId, userId });
  let reportedPhase: 'lazyInit' | 'upgrading' | 'ready' | undefined;

  /** 合并连续重复状态，升级完成后允许恢复准备状态。 */
  const reportSandboxPhase = (phase: 'lazyInit' | 'upgrading' | 'ready') => {
    if (reportedPhase === phase) return;
    reportedPhase = phase;
    workflowStreamResponse?.(workflowSseEvent.sandboxStatus({ sandboxId, phase }));
  };

  reportSandboxPhase('lazyInit');
  const runtime = await prepareRuntime({
    onUpgrade: () => reportSandboxPhase('upgrading')
  });
  if (reportedPhase === 'upgrading') {
    reportSandboxPhase('lazyInit');
  }

  // ready 事件会触发独立的文件/ticket 请求，必须先让鉴权读取到根会话的成功标记。
  if (sourceType === ChatSourceTypeEnum.app) {
    await markChatSandboxEnabled({ sourceType, sourceId, chatId, teamId });
  }
  reportSandboxPhase('ready');
  return runtime;
}
