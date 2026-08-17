import { streamRawFetch } from '@/web/common/api/fetch';
import { batchDeleteChatHistories } from '@/web/core/chat/history/api';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import {
  WorkflowBuilderChatBodySchema,
  WorkflowBuilderVersionCommitBodySchema,
  WorkflowBuilderVersionCommitResponseSchema,
  WorkflowBuilderVersionLoadBodySchema,
  WorkflowBuilderVersionLoadResponseSchema,
  WorkflowBuilderRuntimePrewarmBodySchema,
  type WorkflowBuilderChatBody,
  type WorkflowBuilderVersionCommitBody,
  type WorkflowBuilderVersionCommitResponse,
  type WorkflowBuilderVersionLoadBody,
  type WorkflowBuilderVersionLoadResponse
} from '@fastgpt/global/openapi/core/workflow/builder/api';
import { POST } from '@/web/common/api/request';

export const streamWorkflowBuilderChat = ({
  data,
  onMessage,
  abortCtrl
}: {
  data: WorkflowBuilderChatBody;
  onMessage: StartChatFnProps['generatingMessage'];
  abortCtrl: AbortController;
}) =>
  streamRawFetch({
    url: '/api/proApi/core/workflow/builder/chat',
    data,
    onMessage,
    abortCtrl
  });

/** 打开 Workflow Builder 后后台预热按成员隔离的 Sandbox 运行环境。 */
export const prewarmWorkflowBuilderRuntime = (data: { appId: string; chatId: string }) =>
  POST(
    '/proApi/core/workflow/builder/runtime/prewarm',
    WorkflowBuilderRuntimePrewarmBodySchema.parse(data)
  );

export const loadWorkflowBuilderVersion = async (
  data: WorkflowBuilderVersionLoadBody
): Promise<WorkflowBuilderVersionLoadResponse> =>
  WorkflowBuilderVersionLoadResponseSchema.parse(
    await POST(
      '/proApi/core/workflow/builder/version/load',
      WorkflowBuilderVersionLoadBodySchema.parse(data)
    )
  );

export const commitWorkflowBuilderVersion = async (
  data: WorkflowBuilderVersionCommitBody
): Promise<WorkflowBuilderVersionCommitResponse> =>
  WorkflowBuilderVersionCommitResponseSchema.parse(
    await POST(
      '/proApi/core/workflow/builder/version/commit',
      WorkflowBuilderVersionCommitBodySchema.parse(data)
    )
  );

/** 服务端历史删除成功后重建 Builder 会话。 */
export const clearWorkflowBuilderChatHistory = async ({
  appId,
  chatId,
  clearChatRecords,
  restartChat
}: {
  appId: string;
  chatId: string;
  clearChatRecords: () => void;
  restartChat: () => void;
}) => {
  await batchDeleteChatHistories({
    appId,
    sourceType: ChatSourceTypeEnum.app,
    chatIds: [chatId]
  });
  clearChatRecords();
  restartChat();
};
