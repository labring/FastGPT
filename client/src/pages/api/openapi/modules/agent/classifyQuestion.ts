// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { adaptChatItem_openAI } from '@/utils/plugin/openai';
import { ChatContextFilter } from '@/service/utils/chat/index';
import type { ChatItemType } from '@/types/chat';
import { ChatRoleEnum } from '@/constants/chat';
import { getOpenAIApi, axiosConfig } from '@/service/ai/openai';
import type { ClassifyQuestionAgentItemType } from '@/types/app';

export type Props = {
  systemPrompt?: string;
  history?: ChatItemType[];
  userChatInput: string;
  agents: ClassifyQuestionAgentItemType[];
};
export type Response = { history: ChatItemType[] };

const agentModel = 'gpt-3.5-turbo-16k';
const agentFunName = 'agent_user_question';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let { systemPrompt, agents, history = [], userChatInput } = req.body as Props;

    const response = await classifyQuestion({
      systemPrompt,
      history,
      userChatInput,
      agents
    });

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
  userChatInput
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
    description: '严格判断用户问题的类型',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: agents.map((item) => `${item.value}，返回: '${item.key}'`).join('; '),
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
  console.log(
    '意图结果',
    agents.findIndex((item) => item.key === arg.type)
  );

  return {
    [arg.type]: 1
  };
}
