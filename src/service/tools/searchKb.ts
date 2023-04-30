import { openaiCreateEmbedding } from '../utils/openai';
import { PgClient } from '@/service/pg';
import { ModelDataStatusEnum, ModelVectorSearchModeEnum } from '@/constants/model';
import { ModelSchema } from '@/types/mongoSchema';
import { systemPromptFilter } from '../utils/tools';

/**
 *  use openai embedding search kb
 */
export const searchKb_openai = async ({
  apiKey,
  isPay,
  text,
  similarity,
  model,
  userId
}: {
  apiKey: string;
  isPay: boolean;
  text: string;
  model: ModelSchema;
  userId: string;
  similarity: number;
}): Promise<{
  code: 200 | 201;
  searchPrompt?: {
    obj: 'Human' | 'AI' | 'SYSTEM';
    value: string;
  };
}> => {
  // 获取提示词的向量
  const { vector: promptVector } = await openaiCreateEmbedding({
    isPay,
    apiKey,
    userId,
    text
  });

  const vectorSearch = await PgClient.select<{ q: string; a: string }>('modelData', {
    fields: ['q', 'a'],
    where: [
      ['status', ModelDataStatusEnum.ready],
      'AND',
      ['model_id', model._id],
      'AND',
      `vector <=> '[${promptVector}]' < ${similarity}`
    ],
    order: [{ field: 'vector', mode: `<=> '[${promptVector}]'` }],
    limit: 20
  });

  const systemPrompts: string[] = vectorSearch.rows.map((item) => `${item.q}\n${item.a}`);

  // filter system prompt
  if (
    systemPrompts.length === 0 &&
    model.chat.searchMode === ModelVectorSearchModeEnum.hightSimilarity
  ) {
    return {
      code: 201,
      searchPrompt: {
        obj: 'AI',
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
            obj: 'SYSTEM',
            value: model.chat.systemPrompt
          }
        : undefined
    };
  }

  // 有匹配情况下，system 添加知识库内容。
  // 系统提示词过滤，最多 2500 tokens
  const filterSystemPrompt = systemPromptFilter({
    model: model.chat.chatModel,
    prompts: systemPrompts,
    maxTokens: 2500
  });

  return {
    code: 200,
    searchPrompt: {
      obj: 'SYSTEM',
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
