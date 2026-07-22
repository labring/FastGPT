import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import type { WorkflowResponseType } from '../../../../type';
import { getRunningSandboxId } from '../../../../../../ai/sandbox/interface/runtime';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { SandboxRuntimeStatusResponse } from '@fastgpt/global/core/ai/sandbox/type';

/**
 * 发送 Agent 对话中的 sandbox runtime 准备状态。
 *
 * 这里仅负责 UI 侧的粗粒度提示，不参与 sandbox 资源状态流转。
 */
export const streamAgentSandboxInitStatus = ({
  workflowStreamResponse,
  sourceType,
  sourceId,
  userId
}: {
  workflowStreamResponse?: WorkflowResponseType;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
}) => {
  const effectiveSandboxId = getRunningSandboxId({
    sourceType,
    sourceId,
    userId
  });

  workflowStreamResponse?.(
    workflowSseEvent.sandboxStatus({
      sandboxId: effectiveSandboxId,
      phase: 'lazyInit'
    })
  );
};

/** 向 ChatBox 发送 runtime 镜像升级状态，由前端打开升级弹窗或进入轮询。 */
export const streamAgentSandboxRuntimeUpgradeStatus = ({
  workflowStreamResponse,
  sandboxId,
  runtimeStatus
}: {
  workflowStreamResponse?: WorkflowResponseType;
  sandboxId: string;
  runtimeStatus: SandboxRuntimeStatusResponse;
}) => {
  if (runtimeStatus.status === 'readyToInit') return;

  workflowStreamResponse?.(
    workflowSseEvent.sandboxStatus({
      sandboxId,
      phase: runtimeStatus.status,
      runtimeStatus
    })
  );
};
