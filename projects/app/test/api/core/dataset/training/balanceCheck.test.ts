import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { getRootUser } from '@test/datas/users';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { getErrText } from '@fastgpt/global/common/error/utils';

// Mock checkTeamAIPoints — set to always-allow by default, overridden in specific tests.
let rejectBalanceCheck = true;
vi.mock('@fastgpt/service/support/permission/teamLimit', async (importOriginal) => {
  const mod = (await importOriginal()) as any;
  const { TeamErrEnum } = await import('@fastgpt/global/common/error/code/team');
  return {
    ...mod,
    checkTeamAIPoints: vi.fn(() =>
      rejectBalanceCheck ? Promise.reject(TeamErrEnum.aiPointsNotEnough) : Promise.resolve()
    )
  };
});

// Mock createLLMResponse so queue workers never make real API calls.
vi.mock('@fastgpt/service/core/ai/llm/request', async (importOriginal) => {
  const mod = (await importOriginal()) as any;
  return {
    ...mod,
    createLLMResponse: vi.fn(() =>
      Promise.resolve({
        answerText: 'mock answer',
        usage: { inputTokens: 0, outputTokens: 0 }
      })
    )
  };
});

import { generateVector } from '@/service/core/dataset/queues/generateVector';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';

const mockCheckTeamAIPoints = vi.mocked(checkTeamAIPoints);
const mockCreateLLMResponse = vi.mocked(createLLMResponse);

describe('E2E: Training queue balance check handling', () => {
  let root: Awaited<ReturnType<typeof getRootUser>>;

  beforeEach(async () => {
    root = await getRootUser();
    rejectBalanceCheck = true;
    vi.clearAllMocks();
  });

  describe('Balance check failure — generateVector worker', () => {
    it('should set retryCount=0 and errorMsg instead of deleting the training record', async () => {
      const dataset = await MongoDataset.create({
        name: 'balance-vector-test-ds',
        teamId: root.teamId,
        tmbId: root.tmbId,
        vectorModelId: 'mock-embedding-id',
        agentModelId: 'mock-llm-id'
      });

      const collection = await MongoDatasetCollection.create({
        name: 'balance-vector-test-coll',
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id
      });

      const training = await MongoDatasetTraining.create({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test-bill',
        mode: TrainingModeEnum.chunk,
        q: 'test question for vector',
        a: 'test answer',
        retryCount: 5,
        chunkIndex: 0
      });

      await generateVector();

      const updated = await MongoDatasetTraining.findById(training._id).lean();
      expect(updated, 'training record should not be deleted').not.toBeNull();
      expect(updated!.retryCount).toBe(0);
      expect(updated!.errorMsg).toBe(getErrText(DatasetErrEnum.insufficientQuota));

      expect(mockCheckTeamAIPoints).toHaveBeenCalledWith(String(root.teamId));
      expect(mockCreateLLMResponse).not.toHaveBeenCalled();
    });

    it('should not re-pick records with retryCount=0 after balance failure', async () => {
      const dataset = await MongoDataset.create({
        name: 'balance-noretry-ds',
        teamId: root.teamId,
        tmbId: root.tmbId,
        vectorModelId: 'mock-embedding-id',
        agentModelId: 'mock-llm-id'
      });

      const collection = await MongoDatasetCollection.create({
        name: 'balance-noretry-coll',
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id
      });

      const alreadyFailed = await MongoDatasetTraining.create({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test-bill-already-failed',
        mode: TrainingModeEnum.chunk,
        q: 'already failed record',
        retryCount: 0,
        errorMsg: getErrText(DatasetErrEnum.insufficientQuota)
      });

      const freshRecord = await MongoDatasetTraining.create({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        collectionId: collection._id,
        billId: 'test-bill-fresh',
        mode: TrainingModeEnum.chunk,
        q: 'fresh record',
        a: 'fresh answer',
        retryCount: 5,
        chunkIndex: 0
      });

      await generateVector();

      const failedAfter = await MongoDatasetTraining.findById(alreadyFailed._id).lean();
      expect(failedAfter!.retryCount).toBe(0);
      expect(failedAfter!.errorMsg).toBe(getErrText(DatasetErrEnum.insufficientQuota));

      const freshAfter = await MongoDatasetTraining.findById(freshRecord._id).lean();
      expect(freshAfter, 'fresh record should not be deleted').not.toBeNull();
      expect(freshAfter!.retryCount).toBe(0);
      expect(freshAfter!.errorMsg).toBe(getErrText(DatasetErrEnum.insufficientQuota));

      expect(mockCheckTeamAIPoints).toHaveBeenCalledTimes(1);
    });
  });
});
