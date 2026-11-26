import handler, {
  type hasDatasetTrainingErrorQuery,
  type hasDatasetTrainingErrorResponse
} from '@/pages/api/core/dataset/training/hasDatasetTrainingError';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetQaTraining } from '@test/datas/datasetQaTraining';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

type EmptyBody = Record<string, never>;

describe('dataset training error existence test', () => {
  it('should only report final or blocked training errors', async () => {
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'test',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModel: 'test',
      agentModel: 'test'
    });
    const collection = await MongoDatasetCollection.create({
      name: 'test',
      type: DatasetCollectionTypeEnum.file,
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id
    });

    const qa = await MongoDatasetQaTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      q: 'a QA source',
      status: 'active'
    });

    const noFinalErrorRes = await Call<
      EmptyBody,
      hasDatasetTrainingErrorQuery,
      hasDatasetTrainingErrorResponse
    >(handler, {
      auth: root,
      query: {
        datasetId: dataset._id
      }
    });

    expect(noFinalErrorRes.code).toBe(200);
    expect(noFinalErrorRes.data.hasError).toBe(false);

    await qa.updateOne({ $set: { status: 'error', errorMsg: 'QA failed' } });

    const finalErrorRes = await Call<
      EmptyBody,
      hasDatasetTrainingErrorQuery,
      hasDatasetTrainingErrorResponse
    >(handler, {
      auth: root,
      query: {
        datasetId: dataset._id
      }
    });

    expect(finalErrorRes.code).toBe(200);
    expect(finalErrorRes.data.hasError).toBe(true);
  });
});
