import {
  getModelTestMap,
  getModelTestDefaults,
  setModelTestMap,
  addModelTestModel
} from '@test/modelCache';
import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/dataset/detail';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { getUser } from '@test/datas/users';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { Call } from '@test/utils/request';
import type {
  GetDatasetDetailQuery,
  GetDatasetDetailResponse
} from '@fastgpt/global/openapi/core/dataset/api';

describe('GET /api/core/dataset/detail', () => {
  it.each(['unconfigured', 'deleted-legacy', 'deleted-id', 'disabled'])(
    'returns model IDs for selector state without exposing legacy fallback fields (%s)',
    async (state) => {
      const owner = await getUser(`dataset-model-display-${getNanoid(6)}`);
      const originalMap = getModelTestMap();
      const disabledModel = {
        ...getModelTestDefaults().llm!,
        modelId: '68ad85a7463006c963799a77',
        model: 'disabled-vision',
        isActive: false,
        config: { ...getModelTestDefaults().llm!.config, vision: true }
      };
      setModelTestMap(new Map(originalMap));
      addModelTestModel(disabledModel);
      const modelConfig = (() => {
        if (state === 'deleted-legacy') return { vlmModel: 'deleted-vision' };
        if (state === 'deleted-id')
          return { vlmModelId: '68ad85a7463006c963799a78', vlmModel: 'deleted-vision' };
        if (state === 'disabled')
          return { vlmModelId: disabledModel.modelId, vlmModel: disabledModel.model };
        return {};
      })();
      try {
        const dataset = await MongoDataset.create({
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          name: 'Model display',
          type: DatasetTypeEnum.dataset,
          ...modelConfig
        });
        const result = await Call<
          Record<string, never>,
          GetDatasetDetailQuery,
          GetDatasetDetailResponse
        >(handler, {
          auth: owner,
          query: { id: String(dataset._id) }
        });
        expect(result.code).toBe(200);
        expect(result.data).not.toHaveProperty('modelReferences');
        expect(result.data.vlmModelId).toBe(modelConfig.vlmModelId);
        if (state === 'disabled') {
          expect(result.data.vlmModel).toMatchObject({
            modelId: disabledModel.modelId,
            isActive: false
          });
        } else {
          expect(result.data.vlmModel).toBeUndefined();
        }
      } finally {
        setModelTestMap(originalMap);
      }
    }
  );

  it.each([true, false])(
    'returns details without createTime (legacy missing=%s)',
    async (missing) => {
      const owner = await getUser(`dataset-detail-${getNanoid(6)}`);
      const dataset = await MongoDataset.create({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'Dataset detail',
        type: DatasetTypeEnum.dataset
      });
      if (missing) {
        // 绕过新建默认值，模拟尚未补齐创建时间的旧版本记录。
        await MongoDataset.collection.updateOne(
          { _id: dataset._id },
          { $unset: { createTime: '' } }
        );
        expect(await MongoDataset.findById(dataset._id).lean()).not.toHaveProperty('createTime');
      }

      const result = await Call<
        Record<string, never>,
        GetDatasetDetailQuery,
        GetDatasetDetailResponse
      >(handler, {
        auth: owner,
        query: { id: String(dataset._id) }
      });

      expect(result.code).toBe(200);
      expect(result.data).toMatchObject({ _id: String(dataset._id), name: 'Dataset detail' });
      expect(result.data).toHaveProperty('permission');
      expect(result.data.hasTrainingTask).toBe(false);
      expect(result.data).not.toHaveProperty('createTime');
    }
  );

  it('returns task existence for ordinary failures and every rebuild status while preserving sync status', async () => {
    const owner = await getUser(`dataset-tasks-${getNanoid(6)}`);
    const dataset = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'Task status',
      type: DatasetTypeEnum.dataset
    });
    const scope = {
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      datasetId: dataset._id,
      collectionId: new Types.ObjectId()
    };
    const read = async () => {
      const result = await Call(handler, { auth: owner, query: { id: String(dataset._id) } });
      expect(result.code).toBe(200);
      expect(result.data.status).toBe('active');
      expect(result.data).not.toHaveProperty('rebuildingCount');
      expect(result.data).not.toHaveProperty('trainingCount');
      return result.data.hasTrainingTask;
    };
    expect(await read()).toBe(false);
    const training = await MongoDatasetTraining.create({
      ...scope,
      billId: 'test',
      mode: TrainingModeEnum.index,
      retryCount: 0,
      errorMsg: 'manual retry required'
    });
    expect(await read()).toBe(true);
    await MongoDatasetTraining.deleteOne({ _id: training._id });

    const data = await MongoDatasetData.create({ ...scope, q: 'saved' });
    for (const indexStatus of [
      DatasetDataIndexStatusEnum.rebuildIndexPending,
      DatasetDataIndexStatusEnum.rebuildIndexRunning,
      DatasetDataIndexStatusEnum.rebuildIndexFailed,
      DatasetDataIndexStatusEnum.rebuildSynonymPending,
      DatasetDataIndexStatusEnum.rebuildSynonymRunning,
      DatasetDataIndexStatusEnum.rebuildSynonymFailed
    ]) {
      await MongoDatasetData.updateOne({ _id: data._id }, { $set: { indexStatus } });
      expect(await read()).toBe(true);
    }
    await MongoDatasetData.updateOne(
      { _id: data._id },
      { $set: { indexStatus: DatasetDataIndexStatusEnum.indexed } }
    );
    expect(await read()).toBe(false);
  });
});
