import { streamSseEvent } from '@fastgpt/global/core/chat/stream/sse';
import type { StreamResponseType } from '../../../../type';
import { getRunningSandboxId } from '../../../../../../ai/sandbox/interface/runtime';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

/**
 * 发送 Agent 对话中的 sandbox runtime 准备状态。
 *
 * 这里仅负责 UI 侧的粗粒度提示，不参与 sandbox 资源状态流转。
 */
export const streamAgentSandboxInitStatus = ({
  workflowStreamResponse,
  sourceType,
  sourceId,
  userId,
  chatId
}: {
  workflowStreamResponse?: StreamResponseType;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
}) => {
  const effectiveSandboxId = getRunningSandboxId({
    sourceType,
    sourceId,
    userId,
    chatId
  });

  workflowStreamResponse?.(
    streamSseEvent.sandboxStatus({
      sandboxId: effectiveSandboxId,
      phase: 'lazyInit'
    })
  );
};
