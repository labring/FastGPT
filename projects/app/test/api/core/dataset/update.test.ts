import updateHandler from '@/pages/api/core/dataset/update';
import type { UpdateDatasetBody } from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, it, expect, beforeEach } from 'vitest';
import { RebuildEmbeddingBodySchema } from '@fastgpt/global/openapi/core/dataset/training/api';
import { getModelTestDefaults, setModelTestSnapshot } from '@test/modelCache';
import { getCachedModelHandle } from '@fastgpt/service/core/ai/config/handle';

describe('update dataset', () => {
  it.each(['legacy', 'id', 'invalid-id', 'invalid-name', 'clear-id', 'clear-legacy'] as const)(
    'resolves legacy model updates without overriding canonical selections (%s)',
    async (mode) => {
      const owner = (await getFakeUsers(1)).members[0];
      const previousModels = getCachedModelHandle()!.getAllModels();
      const llm = getModelTestDefaults().llm!;
      setModelTestSnapshot({
        models: previousModels.map((model) =>
          model.modelId === llm.modelId
            ? { ...llm, config: { ...llm.config, vision: true } }
            : model
        )
      });
      try {
        const dataset = await MongoDataset.create({
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          name: 'legacy-update',
          type: DatasetTypeEnum.dataset,
          agentModelId: 'original-agent',
          vlmModelId: 'original-vlm',
          vlmModel: 'original-name'
        });
        const body: UpdateDatasetBody = {
          id: String(dataset._id),
          agentModel: llm.model,
          vlmModel: llm.model
        };
        if (mode === 'id') {
          Object.assign(body, {
            agentModelId: llm.modelId,
            vlmModelId: llm.modelId,
            agentModel: 'missing-legacy',
            vlmModel: 'missing-legacy'
          });
        } else if (mode === 'invalid-id') {
          body.agentModelId = 'missing-id';
        } else if (mode === 'invalid-name') {
          body.agentModel = 'missing-legacy';
        } else if (mode === 'clear-id') {
          body.vlmModelId = null;
        } else if (mode === 'clear-legacy') {
          body.vlmModel = '';
        }
        const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
          auth: owner,
          body
        });
        const updated = await MongoDataset.findById(dataset._id).lean();
        if (mode === 'invalid-id' || mode === 'invalid-name') {
          expect(res.code).not.toBe(200);
          expect(updated).toMatchObject({
            agentModelId: 'original-agent',
            vlmModelId: 'original-vlm'
          });
        } else {
          expect(res.code).toBe(200);
          expect(updated?.agentModelId).toBe(llm.modelId);
          if (mode === 'clear-id' || mode === 'clear-legacy') {
            expect(updated).not.toHaveProperty('vlmModelId');
            expect(updated).not.toHaveProperty('vlmModel');
          } else {
            expect(updated?.vlmModelId).toBe(llm.modelId);
          }
        }
      } finally {
        setModelTestSnapshot({ models: previousModels });
      }
    }
  );

  it.each([null, '', '   '])(
    'clears only the VLM including its legacy field (%s)',
    async (vlmModelId) => {
      const users = await getFakeUsers(1);
      const owner = users.members[0];
      const dataset = await MongoDataset.create({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        name: 'clear-vlm',
        type: DatasetTypeEnum.dataset,
        agentModelId: 'preserve-agent',
        vectorModelId: 'preserve-vector',
        vlmModelId: 'deleted-vlm',
        vlmModel: 'old-vision'
      });
      const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
        auth: owner,
        body: { id: String(dataset._id), vlmModelId }
      });
      expect(res.code).toBe(200);
      const updated = await MongoDataset.findById(dataset._id).lean();
      expect(updated).not.toHaveProperty('vlmModelId');
      expect(updated).not.toHaveProperty('vlmModel');
      expect(updated).toMatchObject({
        agentModelId: 'preserve-agent',
        vectorModelId: 'preserve-vector'
      });
    }
  );

  it('leaves VLM references untouched when the update omits the field', async () => {
    const users = await getFakeUsers(1);
    const owner = users.members[0];
    const dataset = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'keep',
      type: DatasetTypeEnum.dataset,
      vlmModelId: 'original-id',
      vlmModel: 'original-name'
    });
    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: { id: String(dataset._id), name: 'renamed' }
    });
    expect(res.code).toBe(200);
    expect(await MongoDataset.findById(dataset._id).lean()).toMatchObject({
      vlmModelId: 'original-id',
      vlmModel: 'original-name'
    });
  });

  it.each([null, '', '   '])('rejects clearing text and embedding models (%s)', async (modelId) => {
    const users = await getFakeUsers(1);
    const owner = users.members[0];
    const dataset = await MongoDataset.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      name: 'required-model',
      type: DatasetTypeEnum.dataset,
      agentModelId: 'original-agent'
    });
    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: owner,
      body: { id: String(dataset._id), agentModelId: modelId } as any
    });
    expect(res.code).not.toBe(200);
    expect(await MongoDataset.findById(dataset._id).lean()).toMatchObject({
      agentModelId: 'original-agent'
    });
    expect(
      RebuildEmbeddingBodySchema.safeParse({
        datasetId: String(dataset._id),
        vectorModelId: modelId
      }).success
    ).toBe(false);
  });
  beforeEach(async () => {
    // Clean up any datasets created during tests
    await MongoDataset.deleteMany({});
  });

  it('should return 200 when update dataset with token auth', async () => {
    const users = await getFakeUsers(1);
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: users.members[0].teamId,
      resourceId: null,
      tmbId: users.members[0].tmbId,
      permission: TeamDatasetCreatePermissionVal
    });

    // Create a dataset via raw Mongo for testing update
    const dataset = await MongoDataset.create({
      teamId: users.members[0].teamId,
      tmbId: users.members[0].tmbId,
      name: 'old-name',
      type: DatasetTypeEnum.dataset,
      updateTime: new Date('2026-01-01T00:00:00.000Z')
    });

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: users.members[0],
      body: {
        id: String(dataset._id),
        name: 'updated-name'
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);

    const updatedDataset = await MongoDataset.findById(dataset._id).lean();
    expect(updatedDataset?.name).toBe('updated-name');
    expect(updatedDataset?.updateTime.getTime()).toBeGreaterThan(
      new Date('2026-01-01T00:00:00.000Z').getTime()
    );
  });

  it('should return 200 when update dataset with API Key auth (#7006)', async () => {
    const users = await getFakeUsers(1);

    // Create a dataset
    const dataset = await MongoDataset.create({
      teamId: users.members[0].teamId,
      tmbId: users.members[0].tmbId,
      name: 'old-name',
      type: DatasetTypeEnum.dataset
    });

    // Verify authType is not apikey - this test ensures authApiKey flag is respected
    // by the parseHeaderCert mock which grants access based on the auth object
    const apikeyAuth = {
      ...users.members[0],
      authType: 'apikey' as const,
      apikey: 'test-api-key'
    };

    const res = await Call<UpdateDatasetBody, Record<string, never>, string>(updateHandler, {
      auth: apikeyAuth,
      body: {
        id: String(dataset._id),
        name: 'updated-by-apikey'
      }
    });

    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
  });
});
