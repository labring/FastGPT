// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { adaptChatItem_openAI } from '@/utils/plugin/openai';
import { ChatContextFilter } from '@/service/utils/chat/index';
import type { ChatItemType } from '@/types/chat';
import { ChatRoleEnum } from '@/constants/chat';
import { getAIChatApi, axiosConfig } from '@/service/ai/openai';
import type { ClassifyQuestionAgentItemType } from '@/types/app';
import { SystemInputEnum } from '@/constants/app';

export type Props = {
  systemPrompt?: string;
  history?: ChatItemType[];
  [SystemInputEnum.userChatInput]: string;
  description: string;
  agents: ClassifyQuestionAgentItemType[];
};
export type Response = {
  arguments: Record<string, any>;
  deficiency: boolean;
};

const agentModel = 'gpt-3.5-turbo';
const agentFunName = 'agent_extract_data';
const maxTokens = 3000;

export async function extract({
  systemPrompt,
  agents,
  history = [],
  userChatInput,
  description
}: Props): Promise<Response> {
  const messages: ChatItemType[] = [
    ...(systemPrompt
      ? [
          {
            obj: ChatRoleEnum.System,
            value: systemPrompt
          }
        ]
      : []),
    ...history,
    {
      obj: ChatRoleEnum.Human,
      value: userChatInput
    }
  ];
  const filterMessages = ChatContextFilter({
    // @ts-ignore
    model: agentModel,
    prompts: messages,
    maxTokens
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

  const chatAPI = getAIChatApi();

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

  const arg = JSON.parse(response.data.choices?.[0]?.message?.function_call?.arguments || '{}');
  let deficiency = false;
  for (const key in arg) {
    if (arg[key] === '') {
      deficiency = true;
      break;
    }
  }

  return {
    arguments: arg,
    deficiency
  };
}
