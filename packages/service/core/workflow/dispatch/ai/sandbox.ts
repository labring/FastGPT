import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { getSandboxFailureDetail } from '@fastgpt-sdk/sandbox-adapter';
import { buildSandboxClientQueryFromChatSource } from '../../../ai/sandbox/interface/runtime';
import { ensureAppSandboxRuntimeReady } from '../../../ai/sandbox/application/runtime/upgrade';
import { getRunningSandboxId } from '../../../ai/sandbox/utils/id';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getWorkflowContext } from '../context';
import { markChatSandboxEnabled } from '../../../chat/sandbox/service';

/**
 * 编排 Workflow AI 节点的虚拟机准备流程，并推送准备、升级和就绪状态。
 *
 * 进入即报告准备状态，App source 先收敛 provider/image 配置，再由节点准备运行环境。
 * prepareRuntime 必须覆盖节点需要的文件、Skill 和 entrypoint 初始化；成功后先持久化根会话标记再报告就绪。
 * 任何阶段失败都要先把 failed 阶段（含失败环节与原始错误）推给前端，再向上抛出，
 * 避免前端只能展示笼统的「沙箱启动失败」而无法定位。其他 source 的生命周期仍由节点负责。
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
  prepareRuntime: () => Promise<T>;
}): Promise<T> {
  const { workflowStreamResponse } = getWorkflowContext();
  const sandboxId = getRunningSandboxId({ sourceType, sourceId, userId });
  let reportedPhase: 'lazyInit' | 'upgrading' | 'ready' | 'failed' | undefined;
  /** 失败环节：配置收敛/升级，或运行环境准备；用于 failed 事件定位问题。 */
  let currentStep: 'upgrade' | 'prepare' = 'prepare';

  /** 合并连续重复状态，升级完成后允许恢复准备状态；failed 是终态，必须每次都上报原因。 */
  const reportSandboxPhase = (
    phase: 'lazyInit' | 'upgrading' | 'ready' | 'failed',
    extra?: { message?: string; step?: string }
  ) => {
    if (phase !== 'failed' && reportedPhase === phase) return;
    reportedPhase = phase;
    workflowStreamResponse?.(workflowSseEvent.sandboxStatus({ sandboxId, phase, ...extra }));
  };

  try {
    // 配置收敛可能等待激活或升级，不能等它完成后才展示准备状态。
    reportSandboxPhase('lazyInit');
    if (sourceType === ChatSourceTypeEnum.app) {
      currentStep = 'upgrade';
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

    currentStep = 'prepare';
    const runtime = await prepareRuntime();
    // ready 事件会触发独立的文件/ticket 请求，必须先让鉴权读取到根会话的成功标记。
    if (sourceType === ChatSourceTypeEnum.app) {
      await markChatSandboxEnabled({ sourceType, sourceId, chatId, teamId });
    }
    reportSandboxPhase('ready');
    return runtime;
  } catch (error) {
    // 失败原因必须随 failed 事件透出（前端据此展示具体原因与重试入口），再向上抛出中断本轮。
    // provider 边界已完成结构化取证：优先使用可展示的 provider 原因，而不是通用包装文案。
    const failure = getSandboxFailureDetail(error);
    reportSandboxPhase('failed', {
      message: failure?.displayMessage ?? getErrText(error, 'Failed to prepare sandbox runtime'),
      step: currentStep
    });
    throw error;
  }
}
