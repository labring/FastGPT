import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { z } from 'zod';
import { Types } from '@fastgpt/service/common/mongo';

export type updateDefaultQuery = Record<string, never>;

const UpdateDefaultBodySchema = z.object({
  [ModelTypeEnum.llm]: z.string().optional(),
  [ModelTypeEnum.embedding]: z.string().optional(),
  [ModelTypeEnum.tts]: z.string().optional(),
  [ModelTypeEnum.stt]: z.string().optional(),
  [ModelTypeEnum.rerank]: z.string().optional(),
  datasetTextLLMModelId: z.string().optional(),
  datasetImageLLMModelId: z.string().optional(),
  chatTitleLLMModelId: z.string().optional()
});

export type updateDefaultBody = z.infer<typeof UpdateDefaultBodySchema>;

async function handler(req: ApiRequestProps<updateDefaultBody, updateDefaultQuery>): Promise<void> {
  await authSystemAdmin({ req });

  const {
    llm,
    embedding,
    tts,
    stt,
    rerank,
    datasetTextLLMModelId,
    datasetImageLLMModelId,
    chatTitleLLMModelId
  } = parseApiInput({ req, bodySchema: UpdateDefaultBodySchema }).body;
  const defaultModelIds = [llm, embedding, tts, stt, rerank]
    .filter((modelId): modelId is string => !!modelId)
    .map((modelId) => new Types.ObjectId(modelId));
  const datasetTextModelId = datasetTextLLMModelId
    ? new Types.ObjectId(datasetTextLLMModelId)
    : null;
  const datasetImageModelId = datasetImageLLMModelId
    ? new Types.ObjectId(datasetImageLLMModelId)
    : null;
  const chatTitleModelId = chatTitleLLMModelId ? new Types.ObjectId(chatTitleLLMModelId) : null;

  await mongoSessionRun(async (session) => {
    // 用 pipeline update 一次性重算所有默认标记，避免多次 updateOne 造成额外数据库往返。
    await MongoSystemModel.updateMany(
      {},
      [
        {
          $set: {
            isDefault: {
              $cond: [{ $in: ['$_id', defaultModelIds] }, true, '$$REMOVE']
            },
            isDefaultDatasetTextModel: {
              $cond: [{ $eq: ['$_id', datasetTextModelId] }, true, '$$REMOVE']
            },
            isDefaultDatasetImageModel: {
              $cond: [{ $eq: ['$_id', datasetImageModelId] }, true, '$$REMOVE']
            },
            isDefaultChatTitleModel: {
              $cond: [{ $eq: ['$_id', chatTitleModelId] }, true, '$$REMOVE']
            }
          }
        }
      ],
      { session }
    );
  });

  await updatedReloadSystemModel();
}

export default NextAPI(handler);
