import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { z } from 'zod';

export type updateDefaultQuery = Record<string, never>;

const UpdateDefaultBodySchema = z.object({
  [ModelTypeEnum.llm]: z.string().optional(),
  [ModelTypeEnum.embedding]: z.string().optional(),
  [ModelTypeEnum.tts]: z.string().optional(),
  [ModelTypeEnum.stt]: z.string().optional(),
  [ModelTypeEnum.rerank]: z.string().optional(),
  datasetTextLLM: z.string().optional(),
  datasetImageLLM: z.string().optional(),
  chatTitleLLM: z.string().optional()
});

const UpdateDefaultResponseSchema = z.object({});

export type updateDefaultBody = z.infer<typeof UpdateDefaultBodySchema>;

export type updateDefaultResponse = z.infer<typeof UpdateDefaultResponseSchema>;

async function handler(
  req: ApiRequestProps<updateDefaultBody, updateDefaultQuery>
): Promise<updateDefaultResponse> {
  await authSystemAdmin({ req });

  const { llm, embedding, tts, stt, rerank, datasetTextLLM, datasetImageLLM, chatTitleLLM } =
    parseApiInput({ req, bodySchema: UpdateDefaultBodySchema }).body;

  await mongoSessionRun(async (session) => {
    // 用 pipeline update 一次性重算所有默认标记，避免多次 updateOne 造成额外数据库往返。
    await MongoSystemModel.updateMany(
      {},
      [
        {
          $set: {
            'metadata.isDefault': {
              $cond: [
                { $in: ['$model', [llm, embedding, tts, stt, rerank].filter(Boolean)] },
                true,
                '$$REMOVE'
              ]
            },
            'metadata.isDefaultDatasetTextModel': {
              $cond: [{ $eq: ['$model', datasetTextLLM] }, true, '$$REMOVE']
            },
            'metadata.isDefaultDatasetImageModel': {
              $cond: [{ $eq: ['$model', datasetImageLLM] }, true, '$$REMOVE']
            },
            'metadata.isDefaultChatTitleModel': {
              $cond: [{ $eq: ['$model', chatTitleLLM] }, true, '$$REMOVE']
            }
          }
        }
      ],
      { session }
    );
  });

  await updatedReloadSystemModel();

  return UpdateDefaultResponseSchema.parse({});
}

export default NextAPI(handler);
