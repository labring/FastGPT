import { MongoEmbeddingTrainset } from './schema';
import type { EmbeddingTrainsetSchemaType } from '@fastgpt/global/core/train/embedding/type';
import { EmbeddingTrainsetStatusEnum } from '@fastgpt/global/core/train/embedding/constants';
import { addLog } from '../../../../common/system/log';
import { calculateEmbeddingTrainsetStats } from '../data/controller';
import type { ClientSession } from '../../../../common/mongo';
import { EmbeddingTrainErrEnum } from '@fastgpt/global/common/error/code/train';

/**
 * Create embedding trainset (decoupled from App)
 *
 * @param params - Trainset creation parameters
 * @returns Trainset ID
 */
export async function createEmbeddingTrainset(params: {
  teamId: string;
  tmbId: string;
  name?: string;
  description?: string;
}): Promise<string> {
  const { teamId, tmbId, name, description } = params;

  const [{ _id }] = await MongoEmbeddingTrainset.create([
    {
      teamId,
      tmbId,
      name: name || `Embedding Training Set - ${new Date().toLocaleDateString()}`,
      description,
      status: EmbeddingTrainsetStatusEnum.pending
    }
  ]);

  addLog.info('Created embedding trainset', {
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
export async function getEmbeddingTrainset(
  trainsetId: string,
  teamId: string
): Promise<EmbeddingTrainsetSchemaType> {
  const trainset = await MongoEmbeddingTrainset.findOne({
    _id: trainsetId,
    teamId
  }).lean();

  if (!trainset) {
    return Promise.reject(EmbeddingTrainErrEnum.trainsetNotExist);
  }

  // Dynamically calculate statistics
  const statistics = await calculateEmbeddingTrainsetStats(trainsetId);

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
export async function deleteEmbeddingTrainset(
  trainsetId: string,
  session?: ClientSession
): Promise<void> {
  await MongoEmbeddingTrainset.deleteOne({ _id: trainsetId }, { session });

  addLog.info('Deleted embedding trainset', { trainsetId });
}
