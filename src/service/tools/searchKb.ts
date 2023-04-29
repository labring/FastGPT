import { openaiCreateEmbedding } from '../utils/openai';
import { PgClient } from '@/service/pg';
import { ModelDataStatusEnum } from '@/constants/model';

/**
 *  use openai embedding search kb
 */
export const searchKb_openai = async ({
  apiKey,
  isPay,
  text,
  similarity,
  modelId,
  userId
}: {
  apiKey: string;
  isPay: boolean;
  text: string;
  modelId: string;
  userId: string;
  similarity: number;
}) => {
  // 获取提示词的向量
  const { vector: promptVector } = await openaiCreateEmbedding({
    isPay,
    apiKey,
    userId,
    text
  });

  const vectorSearch = await PgClient.select<{ id: string; q: string; a: string }>('modelData', {
    fields: ['id', 'q', 'a'],
    where: [
      ['status', ModelDataStatusEnum.ready],
      'AND',
      ['model_id', modelId],
      'AND',
      `vector <=> '[${promptVector}]' < ${similarity}`
    ],
    order: [{ field: 'vector', mode: `<=> '[${promptVector}]'` }],
    limit: 20
  });

  const systemPrompts: string[] = vectorSearch.rows.map((item) => `${item.q}\n${item.a}`);

  return { systemPrompts };
};
