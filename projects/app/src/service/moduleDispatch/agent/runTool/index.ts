import {
  ModuleOutputKeyEnum,
  ModuleRunTimerOutputEnum
} from '@fastgpt/global/core/module/constants';
import type { ModuleItemType, RunningModuleItemType } from '@fastgpt/global/core/module/type.d';
import { ModelTypeEnum, getLLMModel } from '@fastgpt/service/core/ai/model';
import { getHistories } from '../../utils';
import { runToolWithToolChoice } from './toolChoice';
import {
  DispatchToolModuleProps,
  DispatchToolModuleResponse,
  RunToolResponse,
  ToolModuleItemType
} from './type.d';
import { ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  GPTMessages2Chats,
  chats2GPTMessages,
  getSystemPrompt,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';

export const dispatchRunTools = async (
  props: DispatchToolModuleProps
): Promise<DispatchToolModuleResponse> => {
  const startTime = Date.now();

  const {
    module: { name, flowType, outputs },
    runtimeModules,
    histories,
    params: { model, systemPrompt, userChatInput, history = 6 }
  } = props;

  const toolModel = getLLMModel(model);
  const chatHistories = getHistories(history, histories);

  /* get tool params */

  // get tool output targets
  const toolOutput = outputs.find((output) => output.key === ModuleOutputKeyEnum.selectedTools);

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
        ...(tool as RunningModuleItemType),
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
    responseData,
    totalTokens,
    completeMessages = []
  } = await (async () => {
    if (toolModel.toolChoice) {
      return runToolWithToolChoice({
        ...props,
        toolModules,
        toolModel,
        messages: chats2GPTMessages({ messages, reserveId: false })
      });
    }
    return {
      responseData: [],
      totalTokens: 0
    };
  })();

  const { totalPoints, modelName } = formatModelChars2Points({
    model,
    tokens: totalTokens,
    modelType: ModelTypeEnum.llm
  });

  const adaptMessages = GPTMessages2Chats(completeMessages);
  const startIndex = adaptMessages.findLastIndex((item) => item.obj === ChatRoleEnum.Human);
  const assistantResponse = adaptMessages.slice(startIndex + 1);

  return {
    [ModuleRunTimerOutputEnum.assistantResponse]: assistantResponse
      .map((item) => item.value)
      .flat(),
    [ModuleRunTimerOutputEnum.responseData]: [
      {
        moduleName: name,
        moduleType: flowType,
        runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
        tokens: totalTokens,
        totalPoints,
        model: modelName,
        query: userChatInput,
        historyPreview: getHistoryPreview(GPTMessages2Chats(completeMessages, false))
      }
    ].concat(responseData),
    [ModuleRunTimerOutputEnum.moduleDispatchBills]: [] // 聚合
  };
};
