import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import {
  buildSandboxClientQueryFromChatSource,
  ensureAppSandboxRuntimeReady,
  getRunningSandboxId
} from '../../../ai/sandbox/interface/runtime';
import type { WorkflowResponseType } from '../type';

/**
 * 在 Workflow AI 节点创建 SandboxClient 前收敛 App runtime 配置并发送准备状态。
 *
 * App source 会先同步完成 provider/image 静默迁移；其他强依赖 source 只发送初始化状态，
 * 其权限和 runtime 生命周期仍由各节点自己的准备流程负责。
 */
export async function ensureWorkflowSandboxReadyForUse({
  workflowStreamResponse,
  sourceType,
  sourceId,
  userId,
  chatId
}: {
  workflowStreamResponse?: WorkflowResponseType;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
}): Promise<void> {
  const sandboxId = await (async () => {
    if (sourceType === ChatSourceTypeEnum.app) {
      const query = buildSandboxClientQueryFromChatSource({
        sourceType,
        sourceId,
        userId,
        chatId
      });

      await ensureAppSandboxRuntimeReady({
        query,
        onUpgrade: () => {
          workflowStreamResponse?.(
            workflowSseEvent.sandboxStatus({
              sandboxId: query.sandboxId,
              phase: 'upgrading'
            })
          );
        }
      });

      return query.sandboxId;
    }

    return getRunningSandboxId({ sourceType, sourceId, userId });
  })();

  workflowStreamResponse?.(
    workflowSseEvent.sandboxStatus({
      sandboxId,
      phase: 'lazyInit'
    })
  );
}
