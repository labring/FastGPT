import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  BatchResourceActionResponseSchema,
  BatchResourceMoveBodySchema,
  BATCH_RESOURCE_ACTION_CONCURRENCY,
  type BatchResourceMoveBody
} from '@fastgpt/global/openapi/common/batch/api';
import { moveApp } from '@/service/core/app/move';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { batchRunSettled } from '@fastgpt/global/common/system/utils';

const logger = getLogger(LogCategories.MODULE.APP.FOLDER);

export async function handler(req: ApiRequestProps<BatchResourceMoveBody>) {
  const { body } = parseApiInput({
    req,
    bodySchema: BatchResourceMoveBodySchema
  });

  const results = await batchRunSettled(
    body.ids,
    async (appId) => {
      await moveApp({ req, appId, parentId: body.parentId });
      return appId;
    },
    BATCH_RESOURCE_ACTION_CONCURRENCY
  );

  const successIds: string[] = [];
  const failedIds: string[] = [];

  results.forEach((item, index) => {
    const appId = body.ids[index];
    if (item.success) {
      successIds.push(item.data);
    } else {
      logger.warn('Batch app move failed', { appId, error: item.error });
      failedIds.push(appId);
    }
  });

  return BatchResourceActionResponseSchema.parse({
    successIds,
    failedIds,
    affectedIds: successIds
  });
}

export default NextAPI(handler);
