import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  BatchResourceActionResponseSchema,
  BatchResourceDeleteBodySchema,
  BATCH_RESOURCE_ACTION_CONCURRENCY,
  type BatchResourceDeleteBody
} from '@fastgpt/global/openapi/common/batch/api';
import { deleteDataset } from '@/service/core/dataset/delete';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { batchRunSettled } from '@fastgpt/global/common/system/utils';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

export async function handler(req: ApiRequestProps<BatchResourceDeleteBody>) {
  const { body } = parseApiInput({
    req,
    bodySchema: BatchResourceDeleteBodySchema
  });

  const results = await batchRunSettled(
    body.ids,
    async (id) => {
      const deletedIds = await deleteDataset({ req, id });
      return {
        id,
        affectedIds: [id, ...deletedIds]
      };
    },
    BATCH_RESOURCE_ACTION_CONCURRENCY
  );

  const successIds: string[] = [];
  const failedIds: string[] = [];
  const affectedIds = new Set<string>();

  results.forEach((item, index) => {
    const id = body.ids[index];
    if (item.success) {
      successIds.push(item.data.id);
      item.data.affectedIds.forEach((affectedId) => affectedIds.add(affectedId));
    } else {
      logger.warn('Batch dataset delete failed', { datasetId: id, error: item.error });
      failedIds.push(id);
    }
  });

  return BatchResourceActionResponseSchema.parse({
    successIds,
    failedIds,
    affectedIds: [...affectedIds]
  });
}

export default NextAPI(handler);
