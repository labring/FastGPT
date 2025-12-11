import { UnrecoverableError } from 'bullmq';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { MongoRerankTrainsetData } from '../../data/schema';
import { addLog } from '../../../../../common/system/log';

/**
 * Stage 1: Data Preparation
 *
 * Organizes training data into JSONL format for AICP upload.
 * Uses streaming to avoid memory overflow.
 * Queries data for the specific trainset associated with this task.
 *
 * @param task - Training task data
 * @returns Train dataset ID and temporary file path
 * @throws {UnrecoverableError} When no train data available
 */
export async function runPrepareStage(task: RerankTrainTaskSchemaType): Promise<{
  trainDatasetId: string;
  trainDatasetFilePath: string;
}> {
  addLog.info('Run prepare stage', { taskId: String(task._id) });

  const tmpDir = os.tmpdir();
  const tmpFilePath = path.join(tmpDir, `rerank_train_${task._id}_${Date.now()}.jsonl`);

  const writeStream = fs.createWriteStream(tmpFilePath, { encoding: 'utf-8' });

  let dataCount = 0;

  // Query training data for the specific trainset
  const cursor = MongoRerankTrainsetData.find({
    trainsetId: task.trainsetId
  }).cursor();

  for await (const data of cursor) {
    const jsonLine = JSON.stringify({
      messages: [
        {
          role: 'user',
          content: data.query,
          loss: null
        }
      ],
      positive_messages: data.positiveDocs.map((doc) => [
        {
          role: 'assistant',
          content: doc
        }
      ]),
      negative_messages: data.negativeDocs.map((doc) => [
        {
          role: 'assistant',
          content: doc
        }
      ])
    });

    writeStream.write(jsonLine + '\n');

    dataCount++;
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end((err: Error | null | undefined) => {
      if (err) reject(err);
      else resolve();
    });
  });

  if (dataCount === 0) {
    throw new UnrecoverableError('No train data available');
  }

  addLog.info('Prepared train data', {
    taskId: String(task._id),
    dataCount,
    trainsetId: String(task.trainsetId),
    filePath: tmpFilePath
  });

  return {
    trainDatasetId: String(task.trainsetId),
    trainDatasetFilePath: tmpFilePath
  };
}
