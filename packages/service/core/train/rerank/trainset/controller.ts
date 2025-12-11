import { MongoRerankTrainset } from './schema';
import { MongoApp } from '../../../app/schema';
import type { RerankTrainsetSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { RerankTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../common/system/log';
import { calculateTrainsetStats } from '../data/controller';

/**
 * Create rerank trainset
 *
 * Supports 1:N relationship - one app can have multiple trainsets.
 *
 * @param params - Trainset creation parameters
 * @returns Trainset ID
 * @throws {Error} When app not found
 */
export async function createRerankTrainset(params: {
  appId: string;
  teamId: string;
  tmbId: string;
  name?: string;
  description?: string;
}): Promise<string> {
  const { appId, teamId, tmbId, name, description } = params;

  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    throw new Error('App not found');
  }

  const [{ _id }] = await MongoRerankTrainset.create([
    {
      appId,
      teamId,
      tmbId,
      name: name || `${app.name} - Training Set`,
      description,
      status: RerankTrainsetStatusEnum.pending
    }
  ]);

  addLog.info('Created rerank trainset', {
    appId,
    trainsetId: String(_id)
  });

  return String(_id);
}

/**
 * Get trainset with statistics
 *
 * Similar to evaluation module's getEvaluation, dynamically calculates and attaches statistics.
 *
 * @param trainsetId - Trainset ID
 * @param teamId - Team ID for permission validation
 * @returns Trainset with statistics
 * @throws {Error} When trainset not found or permission denied
 */
export async function getRerankTrainset(
  trainsetId: string,
  teamId: string
): Promise<RerankTrainsetSchemaType> {
  const trainset = await MongoRerankTrainset.findOne({
    _id: trainsetId,
    teamId
  }).lean();

  if (!trainset) {
    throw new Error('Trainset not found or permission denied');
  }

  // Dynamically calculate statistics
  const statistics = await calculateTrainsetStats(trainsetId);

  return {
    ...trainset,
    statistics
  };
}

/** Delete trainset (requires cascading delete of training data in transaction) */
export async function deleteRerankTrainset(trainsetId: string): Promise<void> {
  await MongoRerankTrainset.deleteOne({ _id: trainsetId });

  addLog.info('Deleted rerank trainset', { trainsetId });
}
