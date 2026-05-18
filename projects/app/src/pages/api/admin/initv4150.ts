import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { getLogger } from '@fastgpt/service/common/logger';

const logger = getLogger(['initv4150']);

/**
 * Migrate model configs for permission refactoring:
 * 1. Set isShared = true for all existing models (backward compatible)
 * 2. tmbId and teamId remain undefined (system-level models)
 * 3. No alias migration needed (name already exists)
 */
async function handler(req: ApiRequestProps, res: ApiResponseType<any>) {
  await authCert({ req, authRoot: true });

  logger.info('Starting model permission migration...');

  const models = await MongoSystemModel.find({}).lean();
  logger.info(`Found ${models.length} models`);

  let updatedCount = 0;

  for (const model of models) {
    const updates: Record<string, any> = {};

    if (model.isShared === undefined) {
      updates.isShared = true;
      updatedCount++;
    }

    if (Object.keys(updates).length > 0) {
      await MongoSystemModel.updateOne({ _id: model._id }, { $set: updates });
    }
  }

  logger.info(`Migration complete: ${updatedCount} models updated`);

  return { total: models.length, updated: updatedCount };
}

export default NextAPI(handler);
