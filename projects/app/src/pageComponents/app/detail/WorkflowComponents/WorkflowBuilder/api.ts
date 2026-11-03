import { streamFetch } from '@/web/common/api/fetch';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import {
  WorkflowBuilderVersionCommitBodySchema,
  WorkflowBuilderVersionCommitResponseSchema,
  WorkflowBuilderVersionLoadBodySchema,
  WorkflowBuilderVersionLoadResponseSchema,
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
  streamFetch({
    url: '/api/proApi/core/workflow/builder/chat',
    data,
    onMessage,
    abortCtrl
  });

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
