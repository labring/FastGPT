import { MongoRerankTrainset } from './schema';
import type { RerankTrainsetSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { RerankTrainsetStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../../../common/system/log';
import { calculateRerankTrainsetStats } from '../data/controller';
import type { ClientSession } from '../../../../common/mongo';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';

/**
 * Create rerank trainset
 *
 * @param params - Trainset creation parameters
 * @returns Trainset ID
 */
export async function createRerankTrainset(params: {
  teamId: string;
  tmbId: string;
  name?: string;
  description?: string;
}): Promise<RerankTrainsetSchemaType> {
  const { teamId, tmbId, name, description } = params;

  const [doc] = await MongoRerankTrainset.create([
    {
      teamId,
      tmbId,
      name: name || `Rerank Training Set - ${new Date().toLocaleDateString()}`,
      description,
      status: RerankTrainsetStatusEnum.pending
    }
  ]);

  addLog.info('Created rerank trainset', {
    teamId,
    trainsetId: String(doc._id)
  });

  return doc.toObject() as RerankTrainsetSchemaType;
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
    return Promise.reject(RerankTrainErrEnum.rerankTrainsetNotExist);
  }

  // Dynamically calculate statistics
  const statistics = await calculateRerankTrainsetStats(trainsetId);

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
