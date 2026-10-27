import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { buildSandboxClientQueryFromChatSource } from '../../../ai/sandbox/interface/runtime';
import { ensureAppSandboxRuntimeReady } from '../../../ai/sandbox/application/runtime/upgrade';
import { getRunningSandboxId } from '../../../ai/sandbox/utils/id';
import type { WorkflowResponseType } from '@fastgpt/global/core/workflow/runtime/sse';

/**
 * 编排 Workflow AI 节点的虚拟机准备流程，并推送准备、升级和就绪状态。
 *
 * 进入即报告准备状态，App source 先收敛 provider/image 配置，再由节点准备运行环境。
 * prepareRuntime 必须覆盖节点需要的文件、Skill 和 entrypoint 初始化；成功后才报告就绪，
 * 任何阶段失败都向上传递错误，不误报就绪。其他 source 的生命周期仍由节点负责。
 */
export async function ensureWorkflowSandboxReadyForUse<T>({
  workflowStreamResponse,
  sourceType,
  sourceId,
  userId,
  chatId,
  prepareRuntime
}: {
  workflowStreamResponse?: WorkflowResponseType;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
  prepareRuntime: () => Promise<T>;
}): Promise<T> {
  const sandboxId = getRunningSandboxId({ sourceType, sourceId, userId });
  let reportedPhase: 'lazyInit' | 'upgrading' | 'ready' | undefined;

  /** 合并连续重复状态，升级完成后允许恢复准备状态。 */
  const reportSandboxPhase = (phase: 'lazyInit' | 'upgrading' | 'ready') => {
    if (reportedPhase === phase) return;
    reportedPhase = phase;
    workflowStreamResponse?.(workflowSseEvent.sandboxStatus({ sandboxId, phase }));
  };

  // 配置收敛可能等待激活或升级，不能等它完成后才展示准备状态。
  reportSandboxPhase('lazyInit');
  if (sourceType === ChatSourceTypeEnum.app) {
    const query = buildSandboxClientQueryFromChatSource({
      sourceType,
      sourceId,
      userId,
      chatId
    });
    await ensureAppSandboxRuntimeReady({
      query,
      onUpgrade: () => reportSandboxPhase('upgrading')
    });
    reportSandboxPhase('lazyInit');
  }

  const runtime = await prepareRuntime();
  reportSandboxPhase('ready');
  return runtime;
}
