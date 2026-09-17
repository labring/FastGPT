import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  BatchResourceActionResponseSchema,
  BatchResourceMoveBodySchema,
  BATCH_RESOURCE_ACTION_CONCURRENCY,
  type BatchResourceMoveBody
} from '@fastgpt/global/openapi/common/batch/api';
import { moveDataset } from '@/service/core/dataset/move';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { batchRunSettled } from '@fastgpt/global/common/system/utils';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

export async function handler(req: ApiRequestProps<BatchResourceMoveBody>) {
  const { body } = parseApiInput({
    req,
    bodySchema: BatchResourceMoveBodySchema
  });

  const results = await batchRunSettled(
    body.ids,
    async (id) => {
      await moveDataset({ req, id, parentId: body.parentId });
      return id;
    },
    BATCH_RESOURCE_ACTION_CONCURRENCY
  );

  const successIds: string[] = [];
  const failedIds: string[] = [];

  results.forEach((item, index) => {
    const id = body.ids[index];
    if (item.success) {
      successIds.push(item.data);
    } else {
      logger.warn('Batch dataset move failed', { datasetId: id, error: item.error });
      failedIds.push(id);
    }
  });

  return BatchResourceActionResponseSchema.parse({
    successIds,
    failedIds,
    affectedIds: successIds
  });
}

export default NextAPI(handler);
