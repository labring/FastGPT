import { MongoRerankTrainset } from './schema';
import type { RerankTrainsetSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { RerankTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../common/system/log';
import { calculateTrainsetStats } from '../data/controller';
import type { ClientSession } from '../../../../common/mongo';

/**
 * Create rerank trainset (decoupled from App)
 *
 * @param params - Trainset creation parameters
 * @returns Trainset ID
 */
export async function createRerankTrainset(params: {
  teamId: string;
  tmbId: string;
  name?: string;
  description?: string;
}): Promise<string> {
  const { teamId, tmbId, name, description } = params;

  const [{ _id }] = await MongoRerankTrainset.create([
    {
      teamId,
      tmbId,
      name: name || `Training Set - ${new Date().toLocaleDateString()}`,
      description,
      status: RerankTrainsetStatusEnum.pending
    }
  ]);

  addLog.info('Created rerank trainset', {
    teamId,
    trainsetId: String(_id)
  });

  return String(_id);
}

/**
 * Get trainset with statistics
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

/**
 * Delete trainset record
 *
 * Call within a MongoDB session/transaction when cascading deletions must be atomic.
 *
 * @param trainsetId - Trainset ID to delete
 * @param session - Optional MongoDB session for transaction support
 */
export async function deleteRerankTrainset(
  trainsetId: string,
  session?: ClientSession
): Promise<void> {
  await MongoRerankTrainset.deleteOne({ _id: trainsetId }, { session });

  addLog.info('Deleted rerank trainset', { trainsetId });
}
