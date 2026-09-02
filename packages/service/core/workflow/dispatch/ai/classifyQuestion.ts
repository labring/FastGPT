import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ClassifyQuestionAgentItemType } from '@fastgpt/global/core/workflow/template/system/classifyQuestion/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

import { getCQSystemPrompt } from '@fastgpt/global/core/ai/prompt/agent';
import { type LLMSystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import { getLLMModelData } from '../../../ai/model';
import { getHistories } from '../utils';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { createLLMResponse } from '../../../ai/llm/request';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getWorkflowSourceNodeKey } from '../utils/source';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.AI);

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.aiModelId]?: string;
  [NodeInputKeyEnum.aiModel]?: string;
  [NodeInputKeyEnum.aiSystemPrompt]?: string;
  [NodeInputKeyEnum.history]?: ChatItemMiniType[] | number;
  [NodeInputKeyEnum.userChatInput]: string;
  [NodeInputKeyEnum.agents]: ClassifyQuestionAgentItemType[];
}>;
type CQResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.cqResult]: string;
}>;
type ActionProps = Props & {
  cqModel: LLMSystemModelDataType;
  lastMemory?: ClassifyQuestionAgentItemType;
};

/* request openai chat */
export const dispatchClassifyQuestion = async (props: Props): Promise<CQResponse> => {
  const {
    runningAppInfo,
    node: { nodeId, name },
    histories,
    params: { modelId, model, history = 6, agents, userChatInput }
  } = props as Props;

  if (!userChatInput) {
    return Promise.reject('Input is empty');
  }

  const cqModel = getLLMModelData({ modelId, model });

  const memoryKey = getWorkflowSourceNodeKey({ runningAppInfo, nodeId });
  const chatHistories = getHistories(history, histories);
  // @ts-ignore
  const lastMemory = chatHistories[chatHistories.length - 1]?.memories?.[
    memoryKey
  ] as ClassifyQuestionAgentItemType;

  const { arg, inputTokens, outputTokens, usedUserOpenAIKey } = await completions({
    ...props,
    lastMemory,
    histories: chatHistories,
    cqModel
  });

  const result = agents.find((item) => item.key === arg?.type) || agents[agents.length - 1];

  const { totalPoints } = formatModelChars2Points({
    model: cqModel,
    inputTokens: inputTokens,
    outputTokens: outputTokens
  });
  props.usagePush([
    {
      moduleName: name,
      totalPoints: usedUserOpenAIKey ? 0 : totalPoints,
      modelId: cqModel.modelId,
      inputTokens: inputTokens,
      outputTokens: outputTokens
    }
  ]);

  return {
    data: {
      [NodeOutputKeyEnum.cqResult]: result.value
    },
    [DispatchNodeResponseKeyEnum.toolResponse]: result.value,
    [DispatchNodeResponseKeyEnum.skipHandleId]: agents
      .filter((item) => item.key !== result.key)
      .map((item) => getHandleId(nodeId, 'source', item.key)),
    [DispatchNodeResponseKeyEnum.memories]: {
      [memoryKey]: result
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: usedUserOpenAIKey ? 0 : totalPoints,
      model: cqModel.name,
      query: userChatInput,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      cqList: agents,
      cqResult: result.value,
      contextTotalLen: chatHistories.length + 2
    }
  };
};

const completions = async ({
  cqModel,
  externalProvider,
  runningUserInfo,
  histories,
  lastMemory,
  params: { agents, systemPrompt = '', userChatInput }
}: ActionProps) => {
  const messages: ChatItemMiniType[] = [
    {
      obj: ChatRoleEnum.System,
      value: [
        {
          text: {
            content: getCQSystemPrompt({
              systemPrompt,
              memory: lastMemory ? JSON.stringify(lastMemory) : '',
              typeList: JSON.stringify(
                agents.map((item) => ({ id: item.key, description: item.value }))
              )
            })
          }
        }
      ]
    },
    ...histories,
    {
      obj: ChatRoleEnum.Human,
      value: [
        {
          text: {
            content: userChatInput
          }
        }
      ]
    }
  ];

  const {
    answerText: answer,
    usage: { inputTokens, outputTokens, usedUserOpenAIKey }
  } = await createLLMResponse({
    body: {
      model: cqModel,
      messages: chats2GPTMessages({ messages, reserveId: false, reserveReason: false }),
      stream: true
    },
    userKey: externalProvider.openaiAccount,
    teamId: runningUserInfo.teamId
  });

  // console.log(JSON.stringify(chats2GPTMessages({ messages, reserveId: false }), null, 2));

  const id =
    agents.find((item) => answer.includes(item.key))?.key ||
    agents.find((item) => answer.includes(item.value))?.key ||
    '';

  if (!id) {
    logger.warn('Classify question returned unknown type', { answer });
  }

  return {
    inputTokens,
    outputTokens,
    usedUserOpenAIKey,
    arg: { type: id }
  };
};
