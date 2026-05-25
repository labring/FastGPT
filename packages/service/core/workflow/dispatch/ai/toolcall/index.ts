import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { getLLMModel } from '../../../../ai/model';
import { getNodeErrResponse, getHistories } from '../../utils';
import { runToolCall } from './toolCall';
import { type DispatchToolModuleProps } from './type';
import { GPTMessages2Chats, chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { filterToolResponseToPreview } from './utils';
import { postTextCensor } from '../../../../chat/postTextCensor';
import { useToolNodeList } from './hooks/useToolNodeList';
import { useToolMessages } from './hooks/useToolMessages';
import { checkTeamSandboxPermission } from '../../../../../support/permission/teamLimit';

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
      useAgentSandbox
    }
  } = props;

  if (useAgentSandbox && global.feConfigs?.show_agent_sandbox) {
    try {
      await checkTeamSandboxPermission(runningUserInfo.teamId);
    } catch (err) {
      throw new Error('当前应用未配置虚拟机，暂时无法使用相关功能，请联系管理员配置。');
    }
  }

  const useSandbox = !!useAgentSandbox && !!global.feConfigs?.show_agent_sandbox;

  try {
    const toolModel = getLLMModel(model);
    const useVision = aiChatVision && toolModel.vision;
    const useAudio = aiChatAudio && toolModel.audio;
    const useVideo = aiChatVideo && toolModel.video;
    const chatHistories = getHistories(history, histories);
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
      const adaptMessages = chats2GPTMessages({
        messages,
        reserveId: false,
        reserveTool: true
      });

      return runToolCall({
        ...props,
        allFiles,
        currentInputFiles,
        runtimeNodes,
        runtimeEdges,
        toolNodes,
        toolModel,
        messages: adaptMessages,
        childrenInteractiveParams:
          lastInteractive?.type === 'toolChildrenInteractive' ? lastInteractive.params : undefined
      });
    })();

    const runTimes = toolDispatchFlowResponses.reduce((sum, item) => sum + item.runTimes, 0);
    const toolDetail = toolDispatchFlowResponses.map((item) => item.flowResponses).flat();
    const historyPreview = getHistoryPreview(
      GPTMessages2Chats({ messages: completeMessages, reserveTool: false }),
      10000,
      useVision
    );

    const modelName = toolModel.name;
    const modelTotalPoints = toolCallTotalPoints;
    const toolTotalPoints = toolDispatchFlowResponses
      .map((item) => item.flowUsages)
      .flat()
      .reduce((sum, item) => sum + item.totalPoints, 0);
    const totalPointsUsage = modelTotalPoints + toolTotalPoints;
    const previewAssistantResponses = filterToolResponseToPreview(assistantResponses);
    const nodeResponse: Record<string, any> = {
      totalPoints: totalPointsUsage,
      toolCallInputTokens,
      toolCallOutputTokens,
      childTotalPoints: toolTotalPoints,
      model: modelName,
      query: userChatInput,
      historyPreview,
      toolDetail,
      mergeSignId: nodeId,
      finishReason: finish_reason,
      llmRequestIds: requestIds
    };

    if (error) {
      return getNodeErrResponse({
        error,
        [DispatchNodeResponseKeyEnum.nodeResponse]: nodeResponse,
        [DispatchNodeResponseKeyEnum.runTimes]: runTimes
      });
    }

    return {
      data: {
        [NodeOutputKeyEnum.answerText]: previewAssistantResponses
          .filter((item) => item.text?.content)
          .map((item) => item.text?.content || '')
          .join('')
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
