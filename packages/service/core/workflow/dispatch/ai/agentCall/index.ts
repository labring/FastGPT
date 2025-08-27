import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  ChatDispatchProps,
  DispatchNodeResultType,
  RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import { getLLMModel } from '../../../../ai/model';
import { filterToolNodeIdByEdges, getNodeErrResponse, getHistories } from '../../utils';
import { runAgentCall } from './agentCall';
import { type DispatchAgentModuleProps, type ToolNodeItemType } from './type';
import { type ChatItemType, type UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
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
import { getMultiplePrompt } from '../agent/constants';
import { filterToolResponseToPreview } from '../agent/utils';
import { getFileContentFromLinks, getHistoryFileLinks } from '../../tools/readFiles';
import { parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getDocumentQuotePrompt } from '@fastgpt/global/core/ai/prompt/AIChat';
import { postTextCensor } from '../../../../chat/postTextCensor';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { McpToolDataType } from '@fastgpt/global/core/app/mcpTools/type';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

export const dispatchAgentCall = async (props: DispatchAgentModuleProps): Promise<Response> => {
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

    // Gets the modules to which the tools are connected
    const toolNodes = toolNodeIds
      .map((nodeId) => {
        const tool = runtimeNodes.find((item) => item.nodeId === nodeId);
        return tool;
      })
      .filter(Boolean)
      .map<ToolNodeItemType>((tool) => {
        const toolParams: FlowNodeInputItemType[] = [];
        let jsonSchema: JSONSchemaInputType | undefined = undefined;

        tool?.inputs.forEach((input) => {
          if (input.toolDescription) {
            toolParams.push(input);
          }

          if (input.key === NodeInputKeyEnum.toolData || input.key === 'toolData') {
            const value = input.value as McpToolDataType;
            jsonSchema = value.inputSchema;
          }
        });

        return {
          ...(tool as RuntimeNodeItemType),
          toolParams,
          jsonSchema
        };
      });

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

    // 构建 Agent 专用的系统提示词
    const agentSystemPrompt = buildAgentSystemPrompt({
      model: agentModel,
      systemPrompt,
      documentQuoteText,
      version
    });

    const messages: ChatItemType[] = (() => {
      const value: ChatItemType[] = [
        ...getSystemPrompt_ChatItemType(agentSystemPrompt),
        // Add file input prompt to histories
        ...chatHistories.map((item) => {
          if (item.obj === ChatRoleEnum.Human) {
            return {
              ...item,
              value: agentCallMessagesAdapt({
                userInput: item.value,
                skip: !hasReadFilesTool
              })
            };
          }
          return item;
        }),
        {
          obj: ChatRoleEnum.Human,
          value: agentCallMessagesAdapt({
            skip: !hasReadFilesTool,
            userInput: runtimePrompt2ChatsValue({
              text: userChatInput,
              files: userFiles
            })
          })
        }
      ];
      if (lastInteractive && isEntry) {
        return value.slice(0, -2);
      }
      return value;
    })();

    // censor model and system key
    if (agentModel.censor && !externalProvider.openaiAccount?.key) {
      await postTextCensor({
        text: `${systemPrompt}
          ${userChatInput}
        `
      });
    }

    const {
      agentWorkflowInteractiveResponse,
      dispatchFlowResponse, // agent flow response
      agentCallInputTokens,
      agentCallOutputTokens,
      completeMessages = [], // The actual message sent to AI(just save text)
      assistantResponses = [], // FastGPT system store assistant.value response
      runTimes,
      finish_reason
    } = await (async () => {
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

      return runAgentCall({
        ...props,
        ...requestParams,
        maxRunAgentTimes: 10 // Agent 最大运行次数
      });
    })();

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

// 构建 Agent 专用的系统提示词
function buildAgentSystemPrompt({
  model,
  systemPrompt,
  documentQuoteText,
  version
}: {
  model: any;
  systemPrompt: string;
  documentQuoteText: string;
  version?: string;
}) {
  const agentPrompt = `你是一个智能 Agent，具备以下核心能力：

## 核心能力
1. **计划制定与管理**：根据用户需求制定详细的执行计划，并实时跟踪和调整计划进度
2. **工具调用编排**：可以调用各种工具来完成特定任务，支持并行和串行工具调用
3. **上下文理解**：能够理解对话历史、文档内容和当前状态
4. **自主决策**：根据当前情况和计划进度做出最优决策

## 工作流程
1. **需求分析**：深入理解用户需求，识别关键目标和约束条件
2. **计划制定**：使用 plan_agent 工具制定详细的执行计划
3. **工具编排**：根据计划选择和调用合适的工具
4. **结果处理**：分析工具返回结果，判断是否满足预期
5. **计划调整**：根据执行结果动态调整计划
6. **最终输出**：给出完整、准确的回答

## 特殊指令
- 对于复杂任务，必须先使用 plan_agent 制定计划
- 在执行过程中如需调整计划，再次调用 plan_agent
- 始终保持计划的可见性和可追踪性
- 遇到错误时要有容错和重试机制

请始终保持专业、准确、有条理的回答风格，确保用户能够清楚了解执行进度和结果。`;

  return [
    model.defaultSystemChatPrompt,
    agentPrompt,
    systemPrompt,
    documentQuoteText
      ? replaceVariable(getDocumentQuotePrompt(version || ''), {
          quote: documentQuoteText
        })
      : ''
  ]
    .filter(Boolean)
    .join('\n\n===---===---===\n\n');
}

/*
Agent call，auth add file prompt to question。
Guide the Agent to use tools effectively.
*/
const agentCallMessagesAdapt = ({
  userInput,
  skip
}: {
  userInput: UserChatItemValueItemType[];
  skip?: boolean;
}): UserChatItemValueItemType[] => {
  if (skip) return userInput;

  const files = userInput.filter((item) => item.type === 'file');

  if (files.length > 0) {
    const filesCount = files.filter((file) => file.file?.type === 'file').length;
    const imgCount = files.filter((file) => file.file?.type === 'image').length;

    if (userInput.some((item) => item.type === 'text')) {
      return userInput.map((item) => {
        if (item.type === 'text') {
          const text = item.text?.content || '';

          return {
            ...item,
            text: {
              content: getMultiplePrompt({ fileCount: filesCount, imgCount, question: text })
            }
          };
        }
        return item;
      });
    }

    // Every input is a file
    return [
      {
        type: ChatItemValueTypeEnum.text,
        text: {
          content: getMultiplePrompt({ fileCount: filesCount, imgCount, question: '' })
        }
      }
    ];
  }

  return userInput;
};
