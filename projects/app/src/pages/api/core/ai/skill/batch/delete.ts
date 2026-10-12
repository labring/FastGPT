import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  BatchResourceActionResponseSchema,
  BatchResourceDeleteBodySchema,
  BATCH_RESOURCE_ACTION_CONCURRENCY,
  type BatchResourceDeleteBody
} from '@fastgpt/global/openapi/common/batch/api';
import { deleteSkill } from '@/service/core/ai/skill/delete';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { batchRunSettled } from '@fastgpt/global/common/system/utils';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.CREATION);

export async function handler(req: ApiRequestProps<BatchResourceDeleteBody>) {
  const { body } = parseApiInput({
    req,
    bodySchema: BatchResourceDeleteBodySchema
  });

  const results = await batchRunSettled(
    body.ids,
    async (skillId) => {
      const deletedIds = await deleteSkill({ req, skillId });
      return {
        id: skillId,
        affectedIds: [skillId, ...deletedIds]
      };
    },
    BATCH_RESOURCE_ACTION_CONCURRENCY
  );

  const successIds: string[] = [];
  const failedIds: string[] = [];
  const affectedIds = new Set<string>();

  results.forEach((item, index) => {
    const skillId = body.ids[index];
    if (item.success) {
      successIds.push(item.data.id);
      item.data.affectedIds.forEach((id) => affectedIds.add(id));
    } else {
      logger.warn('Batch skill delete failed', { skillId, error: item.error });
      failedIds.push(skillId);
    }
  });

  return BatchResourceActionResponseSchema.parse({
    successIds,
    failedIds,
    affectedIds: [...affectedIds]
  });
}

export default NextAPI(handler);
