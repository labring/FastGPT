import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { getLLMModel } from '../../../../ai/model';
import { filterToolNodeIdByEdges, getNodeErrResponse, getHistories } from '../../utils';
import { runToolCall } from './toolCall';
import type { FileInputType } from './type';
import { type DispatchToolModuleProps, type ToolNodeItemType } from './type';
import type { UserChatItemFileItemType, ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  GPTMessages2Chats,
  chats2GPTMessages,
  getSystemPrompt_ChatItemType,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { filterToolResponseToPreview } from './utils';
import { parseUrlToFileType } from '../../../utils/context';
import { formatUserQueryWithFiles, parseFileInfoFromUrls } from '../../../utils/file';
import { postTextCensor } from '../../../../chat/postTextCensor';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { McpToolDataType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { getToolConfigStatus } from '@fastgpt/global/core/app/formEdit/utils';
import { SANDBOX_USER_FILES_PATH } from '@fastgpt/global/core/ai/sandbox/constants';

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

export const dispatchRunTools = async (props: DispatchToolModuleProps): Promise<Response> => {
  let {
    node: { nodeId, isEntry, inputs },
    runtimeNodes,
    runtimeEdges,
    histories,
    requestOrigin,
    chatConfig,
    lastInteractive,
    runningUserInfo,
    externalProvider,
    usageId,
    responseChatItemId,
    params: {
      model,
      systemPrompt,
      userChatInput,
      history = 6,
      fileUrlList: fileLinks,
      aiChatVision,
      aiChatReasoning,
      isResponseAnswerText = true,
      useAgentSandbox
    }
  } = props;

  const useSandbox = !!useAgentSandbox && !!global.feConfigs?.show_agent_sandbox;

  try {
    const toolModel = getLLMModel(model);
    const useVision = aiChatVision && toolModel.vision;
    const chatHistories = getHistories(history, histories);

    props.params.aiChatVision = aiChatVision && toolModel.vision;
    props.params.aiChatReasoning = aiChatReasoning && toolModel.reasoning;
    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    if (!fileUrlInput || !fileUrlInput.value || fileUrlInput.value.length === 0) {
      fileLinks = undefined;
    }

    const toolNodeIds = filterToolNodeIdByEdges({ nodeId, edges: runtimeEdges });

    // Gets the module to which the tool is connected
    const toolNodes = toolNodeIds
      .map((nodeId) => {
        const tool = runtimeNodes.find((item) => item.nodeId === nodeId);
        return tool;
      })
      .filter((tool) => {
        if (!tool) return false;
        // Check is valid and filter
        const configStatus = getToolConfigStatus({
          tool
        });
        if (configStatus.status === 'invalid' || configStatus.status === 'waitingForConfig') {
          return false;
        }
        return true;
      })
      .map<ToolNodeItemType>((_) => {
        const tool = _!;
        const toolParams: FlowNodeInputItemType[] = [];
        tool?.inputs.forEach((input) => {
          if (input.toolDescription) {
            toolParams.push(input);
          }
          if (
            (input.key === NodeInputKeyEnum.toolData || input.key === 'toolData') &&
            input.value?.inputSchema
          ) {
            const value = input.value as McpToolDataType;
            tool.jsonSchema = value.inputSchema;
          }
        });

        return {
          nodeId: tool.nodeId,
          name: tool.name,
          flowNodeType: tool.flowNodeType,
          avatar: tool.avatar,
          intro: tool.intro,
          toolDescription: tool.toolDescription,
          jsonSchema: tool.jsonSchema,
          toolParams
        };
      });

    // Check interactive entry
    props.node.isEntry = false;

    const { userFiles } = await getMultiInput({
      fileLinks
    });

    const concatenateSystemPrompt = [toolModel.defaultSystemChatPrompt, systemPrompt]
      .filter(Boolean)
      .join('\n\n-----\n\n');

    const allFiles = new Map<string, FileInputType>();
    const currentInputFiles: FileInputType[] = [];
    const messages = await (async () => {
      const value: ChatItemMiniType[] = [
        ...getSystemPrompt_ChatItemType(concatenateSystemPrompt),
        ...chatHistories,
        {
          dataId: responseChatItemId,
          obj: ChatRoleEnum.Human,
          value: runtimePrompt2ChatsValue({
            text: userChatInput,
            files: userFiles
          })
        }
      ];

      const runtimeMessages = lastInteractive && isEntry ? value.slice(0, -2) : value;

      const maxFiles = chatConfig?.fileSelectConfig?.maxFiles || 20;
      return Promise.all(
        runtimeMessages.map(async (message, index): Promise<ChatItemMiniType> => {
          if (message.obj !== ChatRoleEnum.Human) {
            return message;
          }

          const prefixId = message.dataId || `${index}`;
          const query = await formatUserQueryWithFiles({
            userQuery: message.value,
            parseFileFn: async (urls) => {
              const files = await parseFileInfoFromUrls({
                urls,
                requestOrigin,
                maxFiles,
                teamId: runningUserInfo.teamId
              }).then((res) =>
                res
                  .filter((item) => item.success)
                  .map((item, index) => ({
                    id: `${prefixId}-${index}`,
                    name: item.name,
                    url: item.url,
                    sandboxPath: useSandbox ? `${SANDBOX_USER_FILES_PATH}${item.name}` : undefined
                  }))
              );

              files.forEach((file) => {
                allFiles.set(file.id, file);
              });
              if (index === runtimeMessages.length - 1) {
                currentInputFiles.push(...files);
              }

              return files;
            }
          });

          return {
            ...message,
            value: query
          };
        })
      );
    })();

    // censor model and system key
    if (toolModel.censor && !externalProvider.openaiAccount?.key) {
      await postTextCensor({
        text: `${systemPrompt}
          ${userChatInput}
        `
      });
    }

    const {
      toolWorkflowInteractiveResponse,
      toolDispatchFlowResponses, // tool flow response
      toolCallInputTokens,
      toolCallOutputTokens,
      toolCallTotalPoints,
      completeMessages = [], // The actual message sent to AI(just save text)
      assistantResponses = [], // FastGPT system store assistant.value response
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

    // Usage computed
    // modelName 直接从 toolModel 获取；totalPoints 使用预计算值，保证梯度计费正确
    const modelName = toolModel.name;
    const modelTotalPoints = toolCallTotalPoints;
    const toolTotalPoints = toolDispatchFlowResponses
      .map((item) => item.flowUsages)
      .flat()
      .reduce((sum, item) => sum + item.totalPoints, 0);
    // concat tool usage
    const totalPointsUsage = modelTotalPoints + toolTotalPoints;

    // Preview assistant responses
    const previewAssistantResponses = filterToolResponseToPreview(assistantResponses);

    if (error) {
      return getNodeErrResponse({
        error,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          totalPoints: totalPointsUsage,
          toolCallInputTokens: toolCallInputTokens,
          toolCallOutputTokens: toolCallOutputTokens,
          childTotalPoints: toolTotalPoints,
          model: modelName,
          query: userChatInput,
          historyPreview: getHistoryPreview(
            GPTMessages2Chats({ messages: completeMessages, reserveTool: false }),
            10000,
            useVision
          ),
          toolDetail: toolDispatchFlowResponses.map((item) => item.flowResponses).flat(),
          mergeSignId: nodeId,
          finishReason: finish_reason,
          llmRequestIds: requestIds
        },
        [DispatchNodeResponseKeyEnum.runTimes]: toolDispatchFlowResponses.reduce(
          (sum, item) => sum + item.runTimes,
          0
        )
      });
    }

    return {
      data: {
        [NodeOutputKeyEnum.answerText]: previewAssistantResponses
          .filter((item) => item.text?.content)
          .map((item) => item.text?.content || '')
          .join('')
      },
      [DispatchNodeResponseKeyEnum.runTimes]: toolDispatchFlowResponses.reduce(
        (sum, item) => sum + item.runTimes,
        0
      ),
      [DispatchNodeResponseKeyEnum.assistantResponses]: isResponseAnswerText
        ? previewAssistantResponses
        : undefined,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        // 展示的积分消耗
        totalPoints: totalPointsUsage,
        toolCallInputTokens: toolCallInputTokens,
        toolCallOutputTokens: toolCallOutputTokens,
        childTotalPoints: toolTotalPoints,
        model: modelName,
        query: userChatInput,
        historyPreview: getHistoryPreview(
          GPTMessages2Chats({ messages: completeMessages, reserveTool: false }),
          10000,
          useVision
        ),
        toolDetail: toolDispatchFlowResponses.map((item) => item.flowResponses).flat(),
        mergeSignId: nodeId,
        finishReason: finish_reason,
        llmRequestIds: requestIds
      },
      [DispatchNodeResponseKeyEnum.interactive]: toolWorkflowInteractiveResponse
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};

const getMultiInput = async ({ fileLinks = [] }: { fileLinks?: string[] }) => {
  return {
    userFiles: fileLinks
      .map((url) => parseUrlToFileType(url))
      .filter(Boolean) as UserChatItemFileItemType[]
  };
};
