import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  workflowSseEvent,
  type WorkflowResponseType
} from '@fastgpt/global/core/workflow/runtime/sse';
import { getRunningSandboxId } from '../../../ai/sandbox/utils/id';
import { getWorkflowContext } from '../context';
import { markChatSandboxEnabled } from '../../../chat/sandbox/service';

export type WorkflowSandboxPhase = 'lazyInit' | 'upgrading' | 'ready';

/** 构造带连续重复状态合并与升级恢复语义的 Workflow Sandbox 状态推送器，供主链与 Pro Builder 共用。 */
export function createWorkflowSandboxPhaseReporter({
  sandboxId,
  workflowStreamResponse
}: {
  sandboxId: string;
  workflowStreamResponse?: WorkflowResponseType;
}) {
  let reportedPhase: WorkflowSandboxPhase | undefined;

  const report = (phase: WorkflowSandboxPhase) => {
    if (reportedPhase === phase) return;
    reportedPhase = phase;
    workflowStreamResponse?.(workflowSseEvent.sandboxStatus({ sandboxId, phase }));
  };

  return {
    report,
    onUpgrade: () => report('upgrading'),
    onUpgradeComplete: () => {
      if (reportedPhase === 'upgrading') {
        report('lazyInit');
      }
    }
  };
}

/**
 * 编排 Workflow AI 节点的虚拟机准备流程，并推送准备、升级和就绪状态。
 *
 * 进入即报告 `lazyInit`，并向 `prepareRuntime` 注入 `onUpgrade` 回调在单次 `getSandboxClient`
 * 调用内推送镜像升级状态（升级结束后切回 `lazyInit` 继续准备文件、Skill 与 entrypoint）；
 * 成功后先持久化根会话标记再报告 `ready`，任何阶段失败都向上传递错误，不误报就绪。
 */
export async function ensureWorkflowSandboxReadyForUse<T>({
  sourceType,
  sourceId,
  userId,
  chatId,
  teamId,
  prepareRuntime
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
  teamId: string;
  prepareRuntime: (options: { onUpgrade: () => void; onUpgradeComplete: () => void }) => Promise<T>;
}): Promise<T> {
  const { workflowStreamResponse } = getWorkflowContext();
  const sandboxId = getRunningSandboxId({ sourceType, sourceId, userId });
  const reporter = createWorkflowSandboxPhaseReporter({
    sandboxId,
    workflowStreamResponse
  });

  reporter.report('lazyInit');
  const runtime = await prepareRuntime({
    onUpgrade: reporter.onUpgrade,
    onUpgradeComplete: reporter.onUpgradeComplete
  });

  // ready 事件会触发独立的文件/ticket 请求，必须先让鉴权读取到根会话的成功标记。
  if (sourceType === ChatSourceTypeEnum.app) {
    await markChatSandboxEnabled({ sourceType, sourceId, chatId, teamId });
  }
  reporter.report('ready');
  return runtime;
}
