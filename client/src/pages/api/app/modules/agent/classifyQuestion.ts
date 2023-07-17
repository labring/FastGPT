// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { adaptChatItem_openAI } from '@/utils/plugin/openai';
import { ChatContextFilter } from '@/service/utils/chat/index';
import type { ChatItemType } from '@/types/chat';
import { ChatRoleEnum } from '@/constants/chat';
import { getOpenAIApi, axiosConfig } from '@/service/ai/openai';
import type { ClassifyQuestionAgentItemType } from '@/types/app';
import { countModelPrice, pushTaskBillListItem } from '@/service/events/pushBill';
import { getModel } from '@/service/utils/data';
import { authUser } from '@/service/utils/auth';

export type Props = {
  systemPrompt?: string;
  history?: ChatItemType[];
  userChatInput: string;
  agents: ClassifyQuestionAgentItemType[];
  billId?: string;
};
export type Response = { history: ChatItemType[] };

const agentModel = 'gpt-3.5-turbo-16k';
const agentFunName = 'agent_user_question';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authUser({ req, authRoot: true });
    let { userChatInput } = req.body as Props;

    if (!userChatInput) {
      throw new Error('userChatInput is empty');
    }

    const response = await classifyQuestion(req.body);

    jsonRes(res, {
      data: response
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

/* request openai chat */
export async function classifyQuestion({
  agents,
  systemPrompt,
  history = [],
  userChatInput,
  billId
}: Props) {
  const messages: ChatItemType[] = [
    ...(systemPrompt
      ? [
          {
            obj: ChatRoleEnum.System,
            value: systemPrompt
          }
        ]
      : []),
    {
      obj: ChatRoleEnum.Human,
      value: userChatInput
    }
  ];
  const filterMessages = ChatContextFilter({
    // @ts-ignore
    model: agentModel,
    prompts: messages,
    maxTokens: 1500
  });
  const adaptMessages = adaptChatItem_openAI({ messages: filterMessages, reserveId: false });

  //   function body
  const agentFunction = {
    name: agentFunName,
    description: '判断用户问题的类型，并返回不同的值',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: agents.map((item) => `${item.value}，返回: '${item.key}'`).join('\n'),
          enum: agents.map((item) => item.key)
        }
      },
      required: ['type']
    }
  };
  const chatAPI = getOpenAIApi();

  const response = await chatAPI.createChatCompletion(
    {
      model: agentModel,
      temperature: 0,
      messages: [...adaptMessages],
      function_call: { name: agentFunName },
      functions: [agentFunction]
    },
    {
      ...axiosConfig()
    }
  );

  const arg = JSON.parse(response.data.choices?.[0]?.message?.function_call?.arguments || '');

  if (!arg.type) {
    throw new Error('');
  }

  const totalTokens = response.data.usage?.total_tokens || 0;

  await pushTaskBillListItem({
    billId,
    moduleName: 'Classify Question',
    amount: countModelPrice({ model: agentModel, tokens: totalTokens }),
    model: getModel(agentModel)?.name,
    tokenLen: totalTokens
  });

  console.log(
    'CQ',
    agents.findIndex((item) => item.key === arg.type)
  );

  return {
    [arg.type]: 1
  };
}
