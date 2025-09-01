import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  ChatDispatchProps,
  DispatchNodeResultType
} from '@fastgpt/global/core/workflow/runtime/type';
import { getLLMModel } from '../../../../ai/model';
import { filterToolNodeIdByEdges, getNodeErrResponse, getHistories } from '../../utils';
import { runAgentCall } from './agentCall';
import { type DispatchAgentModuleProps } from './type';
import { type ChatItemType, type UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  GPTMessages2Chats,
  chatValue2RuntimePrompt,
  chats2GPTMessages,
  getSystemPrompt_ChatItemType,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { filterToolResponseToPreview, getToolNodesByIds, toolCallMessagesAdapt } from '../utils';
import { getFileContentFromLinks, getHistoryFileLinks } from '../../tools/readFiles';
import { parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getDocumentQuotePrompt } from '@fastgpt/global/core/ai/prompt/AIChat';
import { postTextCensor } from '../../../../chat/postTextCensor';
import { getTopAgentDefaultPrompt } from './constants';

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

export const dispatchRunAgent = async (props: DispatchAgentModuleProps): Promise<Response> => {
  let {
    node: { nodeId, name, isEntry, version, inputs },
    runtimeNodes,
    runtimeEdges,
    histories,
    query,
    requestOrigin,
    chatConfig,
    lastInteractive,
    runningUserInfo,
    externalProvider,
    params: {
      model,
      systemPrompt,
      userChatInput,
      history = 6,
      fileUrlList: fileLinks,
      aiChatVision,
      aiChatReasoning
      // subConfig,
      // planConfig,
      // modelConfig
    }
  } = props;

  try {
    const agentModel = getLLMModel(model);
    const useVision = aiChatVision && agentModel.vision;
    const chatHistories = getHistories(history, histories);

    props.params.aiChatVision = aiChatVision && agentModel.vision;
    props.params.aiChatReasoning = aiChatReasoning && agentModel.reasoning;

    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    if (!fileUrlInput || !fileUrlInput.value || fileUrlInput.value.length === 0) {
      fileLinks = undefined;
    }

    const toolNodeIds = filterToolNodeIdByEdges({ nodeId, edges: runtimeEdges });
    const toolNodes = getToolNodesByIds({ toolNodeIds, runtimeNodes });

    // Check interactive entry
    props.node.isEntry = false;
    const hasReadFilesTool = toolNodes.some(
      (item) => item.flowNodeType === FlowNodeTypeEnum.readFiles
    );

    const globalFiles = chatValue2RuntimePrompt(query).files;
    const { documentQuoteText, userFiles } = await getMultiInput({
      runningUserInfo,
      histories: chatHistories,
      requestOrigin,
      maxFiles: chatConfig?.fileSelectConfig?.maxFiles || 20,
      customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse,
      fileLinks,
      inputFiles: globalFiles,
      hasReadFilesTool
    });

    const messages: ChatItemType[] = prepareAgentMessages({
      systemPromptParams: {
        systemPrompt,
        documentQuoteText,
        version
      },
      conversationParams: {
        chatHistories,
        hasReadFilesTool,
        userChatInput,
        userFiles,
        lastInteractive,
        isEntry: isEntry ?? false
      }
    });

    // censor model and system key
    if (agentModel.censor && !externalProvider.openaiAccount?.key) {
      await postTextCensor({
        text: `${systemPrompt}
          ${userChatInput}
        `
      });
    }

    const adaptMessages = chats2GPTMessages({
      messages,
      reserveId: false
    });
    const requestParams = {
      runtimeNodes,
      runtimeEdges,
      toolNodes,
      agentModel,
      messages: adaptMessages,
      interactiveEntryToolParams: lastInteractive?.toolParams
    };

    const {
      agentWorkflowInteractiveResponse,
      dispatchFlowResponse,
      agentCallInputTokens,
      agentCallOutputTokens,
      completeMessages = [],
      assistantResponses = [],
      runTimes,
      finish_reason
    } = await runAgentCall({
      ...props,
      ...requestParams,
      maxRunAgentTimes: 100
    });

    const { totalPoints: modelTotalPoints, modelName } = formatModelChars2Points({
      model,
      inputTokens: agentCallInputTokens,
      outputTokens: agentCallOutputTokens
    });
    const modelUsage = externalProvider.openaiAccount?.key ? 0 : modelTotalPoints;

    const toolUsages = dispatchFlowResponse.map((item) => item.flowUsages).flat();
    const toolTotalPoints = toolUsages.reduce((sum, item) => sum + item.totalPoints, 0);

    // concat tool usage
    const totalPointsUsage = modelUsage + toolTotalPoints;

    const previewAssistantResponses = filterToolResponseToPreview(assistantResponses);

    return {
      data: {
        [NodeOutputKeyEnum.answerText]: previewAssistantResponses
          .filter((item) => item.text?.content)
          .map((item) => item.text?.content || '')
          .join('')
      },
      [DispatchNodeResponseKeyEnum.runTimes]: runTimes,
      [DispatchNodeResponseKeyEnum.assistantResponses]: previewAssistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        // 展示的积分消耗
        totalPoints: totalPointsUsage,
        toolCallInputTokens: agentCallInputTokens,
        toolCallOutputTokens: agentCallOutputTokens,
        childTotalPoints: toolTotalPoints,
        model: modelName,
        query: userChatInput,
        historyPreview: getHistoryPreview(
          GPTMessages2Chats({ messages: completeMessages, reserveTool: false }),
          10000,
          useVision
        ),
        toolDetail: dispatchFlowResponse.map((item) => item.flowResponses).flat(),
        mergeSignId: nodeId,
        finishReason: finish_reason
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
        // 模型本身的积分消耗
        {
          moduleName: name,
          model: modelName,
          totalPoints: modelUsage,
          inputTokens: agentCallInputTokens,
          outputTokens: agentCallOutputTokens
        },
        // 工具的消耗
        ...toolUsages
      ],
      [DispatchNodeResponseKeyEnum.interactive]: agentWorkflowInteractiveResponse
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};

const getMultiInput = async ({
  runningUserInfo,
  histories,
  fileLinks,
  requestOrigin,
  maxFiles,
  customPdfParse,
  inputFiles,
  hasReadFilesTool
}: {
  runningUserInfo: ChatDispatchProps['runningUserInfo'];
  histories: ChatItemType[];
  fileLinks?: string[];
  requestOrigin?: string;
  maxFiles: number;
  customPdfParse?: boolean;
  inputFiles: UserChatItemValueItemType['file'][];
  hasReadFilesTool: boolean;
}) => {
  // Not file quote
  if (!fileLinks || hasReadFilesTool) {
    return {
      documentQuoteText: '',
      userFiles: inputFiles
    };
  }

  const filesFromHistories = getHistoryFileLinks(histories);
  const urls = [...fileLinks, ...filesFromHistories];

  if (urls.length === 0) {
    return {
      documentQuoteText: '',
      userFiles: []
    };
  }

  // Get files from histories
  const { text } = await getFileContentFromLinks({
    // Concat fileUrlList and filesFromHistories; remove not supported files
    urls,
    requestOrigin,
    maxFiles,
    customPdfParse,
    teamId: runningUserInfo.teamId,
    tmbId: runningUserInfo.tmbId
  });

  return {
    documentQuoteText: text,
    userFiles: fileLinks.map((url) => parseUrlToFileType(url)).filter(Boolean)
  };
};

const prepareAgentMessages = ({
  systemPromptParams,
  conversationParams
}: {
  systemPromptParams: {
    systemPrompt: string;
    documentQuoteText: string;
    version?: string;
  };
  conversationParams: {
    chatHistories: ChatItemType[];
    hasReadFilesTool: boolean;
    userChatInput: string;
    userFiles: UserChatItemValueItemType['file'][];
    isEntry: boolean;
    lastInteractive?: any;
  };
}): ChatItemType[] => {
  const { systemPrompt, documentQuoteText, version } = systemPromptParams;
  const { chatHistories, hasReadFilesTool, userChatInput, userFiles, lastInteractive, isEntry } =
    conversationParams;

  const agentPrompt = systemPrompt || getTopAgentDefaultPrompt();

  const finalSystemPrompt = [
    agentPrompt,
    documentQuoteText
      ? replaceVariable(getDocumentQuotePrompt(version || ''), {
          quote: documentQuoteText
        })
      : ''
  ]
    .filter(Boolean)
    .join('\n\n===---===---===\n\n');

  const systemMessages = getSystemPrompt_ChatItemType(finalSystemPrompt);

  const processedHistories = chatHistories.map((item) => {
    if (item.obj !== ChatRoleEnum.Human) return item;

    return {
      ...item,
      value: toolCallMessagesAdapt({
        userInput: item.value,
        skip: !hasReadFilesTool
      })
    };
  });

  const currentUserMessage: ChatItemType = {
    obj: ChatRoleEnum.Human,
    value: toolCallMessagesAdapt({
      skip: !hasReadFilesTool,
      userInput: runtimePrompt2ChatsValue({
        text: userChatInput,
        files: userFiles
      })
    })
  };

  const allMessages: ChatItemType[] = [
    ...systemMessages,
    ...processedHistories,
    currentUserMessage
  ];

  // 交互模式下且为入口节点时，移除最后两条消息
  return lastInteractive && isEntry ? allMessages.slice(0, -2) : allMessages;
};
