import { PgClient } from '@/service/pg';
import { ModelDataStatusEnum, ModelVectorSearchModeEnum, ChatModelMap } from '@/constants/model';
import { ModelSchema } from '@/types/mongoSchema';
import { openaiCreateEmbedding } from '../utils/chat/openai';
import { ChatRoleEnum } from '@/constants/chat';
import { sliceTextByToken } from '@/utils/chat';
import { ChatItemSimpleType } from '@/types/chat';

/**
 *  use openai embedding search kb
 */
export const searchKb = async ({
  userApiKey,
  systemApiKey,
  prompts,
  similarity = 0.2,
  model,
  userId
}: {
  userApiKey?: string;
  systemApiKey: string;
  prompts: ChatItemSimpleType[];
  model: ModelSchema;
  userId: string;
  similarity?: number;
}): Promise<{
  code: 200 | 201;
  searchPrompt?: {
    obj: `${ChatRoleEnum}`;
    value: string;
  };
}> => {
  async function search(textArr: string[] = []) {
    // 获取提示词的向量
    const { vectors: promptVectors } = await openaiCreateEmbedding({
      userApiKey,
      systemApiKey,
      userId,
      textArr
    });

    const searchRes = await Promise.all(
      promptVectors.map((promptVector) =>
        PgClient.select<{ id: string; q: string; a: string }>('modelData', {
          fields: ['id', 'q', 'a'],
          where: [
            ['status', ModelDataStatusEnum.ready],
            'AND',
            ['model_id', model._id],
            'AND',
            `vector <=> '[${promptVector}]' < ${similarity}`
          ],
          order: [{ field: 'vector', mode: `<=> '[${promptVector}]'` }],
          limit: 20
        }).then((res) => res.rows)
      )
    );

    // Remove repeat record
    const idSet = new Set<string>();
    const filterSearch = searchRes.map((search) =>
      search.filter((item) => {
        if (idSet.has(item.id)) {
          return false;
        }
        idSet.add(item.id);
        return true;
      })
    );

    return filterSearch.map((item) => item.map((item) => `${item.q}\n${item.a}`).join('\n'));
  }
  const modelConstantsData = ChatModelMap[model.chat.chatModel];

  // search three times
  const userPrompts = prompts.filter((item) => item.obj === 'Human');

  const searchArr: string[] = [
    userPrompts[userPrompts.length - 1].value,
    userPrompts[userPrompts.length - 2]?.value
  ].filter((item) => item);
  const systemPrompts = await search(searchArr);

  // filter system prompt
  if (
    systemPrompts.length === 0 &&
    model.chat.searchMode === ModelVectorSearchModeEnum.hightSimilarity
  ) {
    return {
      code: 201,
      searchPrompt: {
        obj: ChatRoleEnum.AI,
        value: '对不起，你的问题不在知识库中。'
      }
    };
  }
  /* 高相似度+无上下文，不添加额外知识,仅用系统提示词 */
  if (systemPrompts.length === 0 && model.chat.searchMode === ModelVectorSearchModeEnum.noContext) {
    return {
      code: 200,
      searchPrompt: model.chat.systemPrompt
        ? {
            obj: ChatRoleEnum.System,
            value: model.chat.systemPrompt
          }
        : undefined
    };
  }

  /* 有匹配情况下，system 添加知识库内容。 */

  // filter system prompts. max 70% tokens
  const filterRateMap: Record<number, number[]> = {
    1: [0.7],
    2: [0.5, 0.2]
  };
  const filterRate = filterRateMap[systemPrompts.length] || filterRateMap[0];

  const filterSystemPrompt = filterRate
    .map((rate, i) =>
      sliceTextByToken({
        model: model.chat.chatModel,
        text: systemPrompts[i],
        length: Math.floor(modelConstantsData.contextMaxToken * rate)
      })
    )
    .join('\n');

  return {
    code: 200,
    searchPrompt: {
      obj: ChatRoleEnum.System,
      value: `
${model.chat.systemPrompt}
${
  model.chat.searchMode === ModelVectorSearchModeEnum.hightSimilarity ? `不回答知识库外的内容.` : ''
}
知识库内容为: ${filterSystemPrompt}'
`
    }
  };
};
