// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { adaptChatItem_openAI } from '@/utils/plugin/openai';
import { ChatContextFilter } from '@/service/utils/chat/index';
import type { ChatItemType } from '@/types/chat';
import { ChatRoleEnum } from '@/constants/chat';
import { getOpenAIApi, axiosConfig } from '@/service/ai/openai';
import type { RecognizeIntentionAgentItemType } from '@/types/app';

export type Props = {
  history?: ChatItemType[];
  userChatInput: string;
  agents: RecognizeIntentionAgentItemType[];
  description: string;
};
export type Response = { history: ChatItemType[] };

const agentModel = 'gpt-3.5-turbo-16k';
const agentFunName = 'agent_extract_data';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const response = await extract(req.body);

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
export async function extract({ agents, history = [], userChatInput, description }: Props) {
  const messages: ChatItemType[] = [
    ...history.slice(-4),
    {
      obj: ChatRoleEnum.Human,
      value: userChatInput
    }
  ];
  const filterMessages = ChatContextFilter({
    // @ts-ignore
    model: agentModel,
    prompts: messages,
    maxTokens: 3000
  });
  const adaptMessages = adaptChatItem_openAI({ messages: filterMessages, reserveId: false });

  const properties: Record<
    string,
    {
      type: string;
      description: string;
    }
  > = {};
  agents.forEach((item) => {
    properties[item.key] = {
      type: 'string',
      description: item.value
    };
  });

  //   function body
  const agentFunction = {
    name: agentFunName,
    description,
    parameters: {
      type: 'object',
      properties,
      required: agents.map((item) => item.key)
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

  return arg;
}
