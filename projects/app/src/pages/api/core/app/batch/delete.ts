import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  BatchResourceActionResponseSchema,
  BatchResourceDeleteBodySchema,
  BATCH_RESOURCE_ACTION_CONCURRENCY,
  type BatchResourceDeleteBody
} from '@fastgpt/global/openapi/common/batch/api';
import { deleteApp } from '@/service/core/app/delete';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { batchRunSettled } from '@fastgpt/global/common/system/utils';

const logger = getLogger(LogCategories.MODULE.APP.FOLDER);

export async function handler(req: ApiRequestProps<BatchResourceDeleteBody>) {
  const { body } = parseApiInput({
    req,
    bodySchema: BatchResourceDeleteBodySchema
  });

  const results = await batchRunSettled(
    body.ids,
    async (appId) => {
      const deletedIds = await deleteApp({ req, appId });
      return {
        id: appId,
        affectedIds: [appId, ...deletedIds]
      };
    },
    BATCH_RESOURCE_ACTION_CONCURRENCY
  );

  const successIds: string[] = [];
  const failedIds: string[] = [];
  const affectedIds = new Set<string>();

  results.forEach((item, index) => {
    const appId = body.ids[index];
    if (item.success) {
      successIds.push(item.data.id);
      item.data.affectedIds.forEach((id) => affectedIds.add(id));
    } else {
      logger.warn('Batch app delete failed', { appId, error: item.error });
      failedIds.push(appId);
    }
  });

  return BatchResourceActionResponseSchema.parse({
    successIds,
    failedIds,
    affectedIds: [...affectedIds]
  });
}

export default NextAPI(handler);
