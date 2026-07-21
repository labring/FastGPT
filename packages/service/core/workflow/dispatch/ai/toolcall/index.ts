import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchNodeResultType } from '../../../types/runtime';
import { getLLMModel } from '../../../../ai/model';
import { getAgentLoopHistories, getNodeErrResponse } from '../../utils';
import { runToolCall } from './toolCall';
import { type DispatchToolModuleProps } from './type';
import { postTextCensor } from '../../../../chat/postTextCensor';
import { useToolNodeList } from './hooks/useToolNodeList';
import { useToolMessages } from './hooks/useToolMessages';
import { checkTeamSandboxPermission } from '../../../../../support/permission/teamLimit';
import { prepareSandboxToolRuntime } from '../../../../ai/sandbox/interface/toolCall';
import {
  createAgentSandboxPermissionDeniedError,
  getRunningSandboxId,
  getSandboxRuntimeProfile,
  runAgentSandboxEntrypoint,
  withAgentSandboxInitLease
} from '../../../../ai/sandbox/interface/runtime';
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
    requestOrigin,
    chatConfig,
    lastInteractive,
    runningUserInfo,
    externalProvider,
    responseChatItemId,
    params: {
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

  if (useAgentSandbox && global.feConfigs?.show_agent_sandbox) {
    try {
      await checkTeamSandboxPermission(runningUserInfo.teamId);
    } catch {
      throw createAgentSandboxPermissionDeniedError();
    }
  }

  const useSandbox = !!useAgentSandbox && !!global.feConfigs?.show_agent_sandbox;

  try {
    const toolModel = getLLMModel(model);
    const useVision = aiChatVision && toolModel.vision;
    const useAudio = aiChatAudio && toolModel.audio;
    const useVideo = aiChatVideo && toolModel.video;
    const chatHistories = getAgentLoopHistories(history, histories);
    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    const fileLinks =
      !fileUrlInput || !fileUrlInput.value || fileUrlInput.value.length === 0
        ? undefined
        : rawFileLinks;

    props.params.aiChatVision = aiChatVision && toolModel.vision;
    props.params.aiChatAudio = useAudio;
    props.params.aiChatVideo = useVideo;
    props.params.aiChatReasoning = aiChatReasoning && toolModel.reasoning;
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

    const { messages, allFiles, currentInputFiles } = await useToolMessages({
      defaultSystemPrompt: toolModel.defaultSystemChatPrompt,
      systemPrompt,
      chatHistories,
      responseChatItemId,
      userChatInput,
      fileLinks,
      lastInteractive,
      isEntry,
      chatConfig,
      requestOrigin,
      runningUserInfo,
      useSandbox
    });

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
    if (toolModel.censor && !externalProvider.openaiAccount?.key) {
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
        allFiles,
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

    return {
      data: {
        [NodeOutputKeyEnum.answerText]:
          getAgentLoopCorePersistedTextOutput(previewAssistantResponses)
      },
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
