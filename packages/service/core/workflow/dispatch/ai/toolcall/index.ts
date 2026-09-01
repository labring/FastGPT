import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchNodeResultType } from '../../../types/runtime';
import { getLLMModelData } from '../../../../ai/model';
import { getAgentLoopHistories, getNodeErrResponse } from '../../utils';
import { runToolCall } from './toolCall';
import { type DispatchToolModuleProps } from './type';
import { postTextCensor } from '../../../../chat/postTextCensor';
import { useToolNodeList } from './hooks/useToolNodeList';
import { useToolMessages } from './hooks/useToolMessages';
import { prepareSandboxToolRuntime } from '../../../../ai/sandbox/interface/toolCall';
import { readWorkflowFileBuffer } from '../../../utils/context';
import {
  assertSandboxAvailable,
  getRunningSandboxId,
  getSandboxRuntimeProfile,
  resolveAppSandboxAvailability,
  runAgentSandboxEntrypoint,
  withAgentSandboxInitLease
} from '../../../../ai/sandbox/interface/runtime';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ensureWorkflowSandboxReadyForUse } from '../sandbox';
import {
  buildAgentLoopCoreRequestMessages,
  createAgentLoopCoreToolCallNodeResponse,
  createAgentLoopCoreChildInteractiveParams,
  filterAgentLoopCoreToolResponseToPreview,
  getAgentLoopCorePersistedTextOutput,
  summarizeAgentLoopCoreToolRunFlowResponses
} from '../agentLoopCore/interface';

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

export const dispatchRunTools = async (props: DispatchToolModuleProps): Promise<Response> => {
  const {
    node: { nodeId, isEntry, inputs },
    runtimeNodes,
    runtimeEdges,
    histories,
    chatConfig,
    lastInteractive,
    runningUserInfo,
    runningAppInfo,
    externalProvider,
    responseChatItemId,
    params: {
      modelId,
      model,
      systemPrompt,
      userChatInput,
      history = 6,
      fileUrlList: rawFileLinks,
      aiChatVision,
      aiChatAudio,
      aiChatVideo,
      aiChatReasoning,
      isResponseAnswerText = true,
      useAgentSandbox,
      sandboxEntrypoint
    }
  } = props;

  const isAppChat = runningAppInfo.sourceType === ChatSourceTypeEnum.app;
  const appSandboxAvailability = isAppChat
    ? await resolveAppSandboxAvailability({
        appEnabled: !!useAgentSandbox,
        teamId: runningAppInfo.teamId
      })
    : undefined;
  if (!isAppChat && useAgentSandbox) {
    await assertSandboxAvailable(runningAppInfo.teamId);
  }

  const useSandbox = isAppChat ? appSandboxAvailability?.available === true : !!useAgentSandbox;

  try {
    const toolModel = getLLMModelData({ modelId, model });
    const useVision = aiChatVision && toolModel.config.vision;
    const useAudio = aiChatAudio && toolModel.config.audio;
    const useVideo = aiChatVideo && toolModel.config.video;
    const chatHistories = getAgentLoopHistories(history, histories);
    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    const parseHistoryFiles = !!fileUrlInput?.value?.length;
    const fileLinks = parseHistoryFiles ? rawFileLinks : undefined;

    props.params.aiChatVision = aiChatVision && toolModel.config.vision;
    props.params.aiChatAudio = useAudio;
    props.params.aiChatVideo = useVideo;
    props.params.aiChatReasoning = aiChatReasoning && toolModel.config.reasoning;
    props.params.fileUrlList = fileLinks;
    props.params.useAgentSandbox = useSandbox;
    props.params.sandboxEntrypoint = useSandbox ? sandboxEntrypoint : undefined;

    const toolNodes = useToolNodeList({
      nodeId,
      runtimeNodes,
      runtimeEdges
    });

    // 交互恢复入口会由子工具继续接管，父 ToolCall 节点本轮不再作为入口节点。
    props.node.isEntry = false;

    const { messages, currentInputFiles } = await useToolMessages({
      defaultSystemPrompt: toolModel.config.defaultSystemChatPrompt,
      systemPrompt,
      chatHistories,
      responseChatItemId,
      userChatInput,
      fileLinks,
      parseHistoryFiles,
      lastInteractive,
      isEntry,
      chatConfig,
      useSandbox
    });

    if (useSandbox) {
      await ensureWorkflowSandboxReadyForUse({
        workflowStreamResponse: props.workflowStreamResponse,
        sourceType: runningAppInfo.sourceType,
        sourceId: runningAppInfo.sourceId,
        userId: props.uid,
        chatId: props.chatId
      });
    }

    // 初始化沙盒
    const sandboxClient = useSandbox
      ? await withAgentSandboxInitLease({
          sandboxId: getRunningSandboxId({
            sourceType: props.runningAppInfo.sourceType,
            sourceId: props.runningAppInfo.sourceId,
            userId: props.uid
          }),
          fn: async () => {
            const runtime = await prepareSandboxToolRuntime({
              sourceType: props.runningAppInfo.sourceType,
              sourceId: props.runningAppInfo.sourceId,
              userId: props.uid,
              chatId: props.chatId,
              readInputFile: (url) => readWorkflowFileBuffer({ url }),
              files: currentInputFiles.map((file) => ({
                path: file.sandboxPath!,
                url: file.url
              }))
            });
            const effectiveEntrypoint = sandboxEntrypoint?.trim();
            if (effectiveEntrypoint) {
              await runAgentSandboxEntrypoint({
                sandbox: runtime.provider,
                sandboxEntrypoint: effectiveEntrypoint,
                workDirectory: getSandboxRuntimeProfile().workDirectory
              });
            }
            return runtime;
          }
        })
      : undefined;

    // 未配置独立模型密钥时，沿用系统文本审核逻辑。
    if (toolModel.config.censor && !externalProvider.openaiAccount?.key) {
      await postTextCensor({
        text: `${systemPrompt}
          ${userChatInput}
        `
      });
    }

    const {
      toolWorkflowInteractiveResponse,
      toolDispatchFlowResponses, // 工具子流程运行详情
      toolCallInputTokens,
      toolCallOutputTokens,
      toolCallTotalPoints,
      completeMessages = [], // 实际发送给模型的消息，只保留文本用于预览。
      assistantResponses = [], // FastGPT 持久化到 assistant.value 的响应。
      finish_reason,
      error,
      requestIds
    } = await (async () => {
      const adaptMessages = buildAgentLoopCoreRequestMessages({
        messages,
        removeSystemMessages: false
      });

      return runToolCall({
        ...props,
        currentInputFiles,
        sandboxClient,
        runtimeNodes,
        runtimeEdges,
        toolNodes,
        toolModel,
        messages: adaptMessages,
        childrenInteractiveParams: createAgentLoopCoreChildInteractiveParams({
          lastInteractive
        })
      });
    })();

    const { runTimes, toolDetail, toolTotalPoints } =
      summarizeAgentLoopCoreToolRunFlowResponses(toolDispatchFlowResponses);
    const modelName = toolModel.name;
    const modelTotalPoints = toolCallTotalPoints;
    const totalPointsUsage = modelTotalPoints + toolTotalPoints;
    const previewAssistantResponses = filterAgentLoopCoreToolResponseToPreview(assistantResponses);
    const nodeResponse = createAgentLoopCoreToolCallNodeResponse({
      totalPoints: totalPointsUsage,
      toolCallInputTokens,
      toolCallOutputTokens,
      toolTotalPoints,
      modelName,
      query: userChatInput,
      completeMessages,
      useVision,
      toolDetail,
      nodeId,
      finishReason: finish_reason || 'stop',
      requestIds
    });

    if (error) {
      return getNodeErrResponse({
        error,
        [DispatchNodeResponseKeyEnum.nodeResponse]: nodeResponse,
        [DispatchNodeResponseKeyEnum.runTimes]: runTimes
      });
    }

    if (toolWorkflowInteractiveResponse) {
      return {
        [DispatchNodeResponseKeyEnum.runTimes]: runTimes,
        [DispatchNodeResponseKeyEnum.assistantResponses]: isResponseAnswerText
          ? previewAssistantResponses
          : undefined,
        [DispatchNodeResponseKeyEnum.nodeResponse]: nodeResponse,
        [DispatchNodeResponseKeyEnum.interactive]: toolWorkflowInteractiveResponse
      };
    }

    const answerText = getAgentLoopCorePersistedTextOutput(previewAssistantResponses);

    return {
      data: {
        [NodeOutputKeyEnum.answerText]: answerText
      },
      [DispatchNodeResponseKeyEnum.toolResponse]: answerText,
      [DispatchNodeResponseKeyEnum.runTimes]: runTimes,
      [DispatchNodeResponseKeyEnum.assistantResponses]: isResponseAnswerText
        ? previewAssistantResponses
        : undefined,
      [DispatchNodeResponseKeyEnum.nodeResponse]: nodeResponse,
      [DispatchNodeResponseKeyEnum.interactive]: toolWorkflowInteractiveResponse
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};
