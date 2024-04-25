// @ts-nocheck
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import { ModelTypeEnum, getLLMModel } from '../../../../ai/model';
import { getHistories } from '../../utils';
import { runToolWithToolChoice } from './toolChoice';
import { DispatchToolModuleProps, ToolModuleItemType } from './type.d';
import { ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  GPTMessages2Chats,
  chats2GPTMessages,
  getSystemPrompt,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { runToolWithFunctionCall } from './functionCall';
import { runToolWithPromptCall } from './promptCall';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { Prompt_Tool_Call } from './constants';

type Response = DispatchNodeResultType<{}>;

export const dispatchRunTools = async (props: DispatchToolModuleProps): Promise<Response> => {
  const {
    module: { name, outputs },
    runtimeModules,
    histories,
    params: { model, systemPrompt, userChatInput, history = 6 }
  } = props;

  const toolModel = getLLMModel(model);
  const chatHistories = getHistories(history, histories);

  /* get tool params */

  // get tool output targets
  const toolOutput = outputs.find((output) => output.key === NodeOutputKeyEnum.selectedTools);

  if (!toolOutput) {
    return Promise.reject('No tool output found');
  }

  const targets = toolOutput.targets;

  // Gets the module to which the tool is connected
  const toolModules = targets
    .map((item) => {
      const tool = runtimeModules.find((module) => module.moduleId === item.moduleId);
      return tool;
    })
    .filter(Boolean)
    .map<ToolModuleItemType>((tool) => {
      const toolParams = tool?.inputs.filter((input) => !!input.toolDescription) || [];
      return {
        ...(tool as RuntimeNodeItemType),
        toolParams
      };
    });

  const messages: ChatItemType[] = [
    ...getSystemPrompt(systemPrompt),
    ...chatHistories,
    {
      obj: ChatRoleEnum.Human,
      value: runtimePrompt2ChatsValue({
        text: userChatInput,
        files: []
      })
    }
  ];

  const {
    dispatchFlowResponse, // tool flow response
    totalTokens,
    completeMessages = [], // The actual message sent to AI(just save text)
    assistantResponses = [] // FastGPT system store assistant.value response
  } = await (async () => {
    const adaptMessages = chats2GPTMessages({ messages, reserveId: false });

    if (toolModel.toolChoice) {
      return runToolWithToolChoice({
        ...props,
        toolModules,
        toolModel,
        messages: adaptMessages
      });
    }
    if (toolModel.functionCall) {
      return runToolWithFunctionCall({
        ...props,
        toolModules,
        toolModel,
        messages: adaptMessages
      });
    }

    const lastMessage = adaptMessages[adaptMessages.length - 1];
    if (typeof lastMessage.content !== 'string') {
      return Promise.reject('暂时只支持纯文本');
    }

    lastMessage.content = replaceVariable(Prompt_Tool_Call, {
      question: userChatInput
    });

    return runToolWithPromptCall({
      ...props,
      toolModules,
      toolModel,
      messages: adaptMessages
    });
  })();

  const { totalPoints, modelName } = formatModelChars2Points({
    model,
    tokens: totalTokens,
    modelType: ModelTypeEnum.llm
  });

  // flat child tool response
  const childToolResponse = dispatchFlowResponse.map((item) => item.flowResponses).flat();

  // concat tool usage
  const totalPointsUsage =
    totalPoints +
    dispatchFlowResponse.reduce((sum, item) => {
      const childrenTotal = item.flowUsages.reduce((sum, item) => sum + item.totalPoints, 0);
      return sum + childrenTotal;
    }, 0);
  const flatUsages = dispatchFlowResponse.map((item) => item.flowUsages).flat();

  return {
    [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: totalPointsUsage,
      toolCallTokens: totalTokens,
      model: modelName,
      query: userChatInput,
      historyPreview: getHistoryPreview(GPTMessages2Chats(completeMessages, false)),
      toolDetail: childToolResponse
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
      {
        moduleName: name,
        totalPoints,
        model: modelName,
        tokens: totalTokens
      },
      ...flatUsages
    ]
  };
};
