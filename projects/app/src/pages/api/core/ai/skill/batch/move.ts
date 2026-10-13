import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  BatchResourceActionResponseSchema,
  BatchResourceMoveBodySchema,
  BATCH_RESOURCE_ACTION_CONCURRENCY,
  type BatchResourceMoveBody
} from '@fastgpt/global/openapi/common/batch/api';
import { moveSkill } from '@/service/core/ai/skill/move';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { batchRunSettled } from '@fastgpt/global/common/system/utils';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.CREATION);

export async function handler(req: ApiRequestProps<BatchResourceMoveBody>) {
  const { body } = parseApiInput({
    req,
    bodySchema: BatchResourceMoveBodySchema
  });

  const results = await batchRunSettled(
    body.ids,
    async (skillId) => {
      await moveSkill({ req, skillId, parentId: body.parentId });
      return skillId;
    },
    BATCH_RESOURCE_ACTION_CONCURRENCY
  );

  const successIds: string[] = [];
  const failedIds: string[] = [];

  results.forEach((item, index) => {
    const skillId = body.ids[index];
    if (item.success) {
      successIds.push(item.data);
    } else {
      logger.warn('Batch skill move failed', { skillId, error: item.error });
      failedIds.push(skillId);
    }
  });

  return BatchResourceActionResponseSchema.parse({
    successIds,
    failedIds,
    affectedIds: successIds
  });
}

export default NextAPI(handler);
