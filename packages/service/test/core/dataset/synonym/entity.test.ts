import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';
import { MongoDatasetSynonym } from '@fastgpt/service/core/dataset/synonym/schema';
import { MongoDatasetSynonymMapping } from '@fastgpt/service/core/dataset/synonym/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { Types } from '@fastgpt/service/common/mongo';
import {
  assertDatasetSynonymEnabled,
  cleanupUnusedDatasetSynonymMappings,
  getDatasetSynonymRuntimeConfig,
  getDatasetSynonymTransformContext
} from '@fastgpt/service/core/dataset/synonym/entity';

const originalDatasetSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;

describe('dataset synonym feature switch', () => {
  beforeEach(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
  });

  afterAll(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = originalDatasetSynonymEnabled;
  });

  it('returns no-op runtime values without querying MongoDB when disabled', async () => {
    const findConfig = vi.spyOn(MongoDatasetSynonym, 'findOne');

    await expect(
      getDatasetSynonymRuntimeConfig({ teamId: 'team-id', datasetId: 'dataset-id' })
    ).resolves.toBeNull();
    const context = await getDatasetSynonymTransformContext({
      teamId: 'team-id',
      datasetId: 'dataset-id'
    });

    expect(context.version).toBe(0);
    expect(context.transformText('keep original text')).toBe('keep original text');
    await expect(context.isCurrent()).resolves.toBe(true);
    expect(findConfig).not.toHaveBeenCalled();
  });

  it('rejects management operations when disabled', () => {
    expect(() => assertDatasetSynonymEnabled()).toThrow('知识库同义词功能未启用');
  });

  it('keeps historical mappings until all chunks use the active version', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const collectionId = new Types.ObjectId();
    const synonym = await MongoDatasetSynonym.create({
      teamId,
      datasetId,
      version: 2,
      enabled: true,
      schemaVersion: 1
    });
    await MongoDatasetSynonymMapping.create(
      [1, 2].map((fileVersion) => ({
        logicalMappingId: new Types.ObjectId(),
        teamId,
        datasetId,
        synonymFileId: synonym._id,
        fileVersion,
        standardizedTerm: `standard-${fileVersion}`,
        normalizedStandardizedTerm: `standard-${fileVersion}`,
        synonymTerms: [`alias-${fileVersion}`],
        normalizedSynonymTerms: [`alias-${fileVersion}`],
        allTerms: `standard-${fileVersion} alias-${fileVersion}`,
        fingerprint: `mapping-${fileVersion}`
      }))
    );
    const data = await MongoDatasetData.create({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: 'chunk',
      indexes: [],
      synonymVersion: 1
    });

    await expect(
      cleanupUnusedDatasetSynonymMappings({
        teamId: String(teamId),
        datasetId: String(datasetId),
        activeVersion: 2
      })
    ).resolves.toBe(false);
    await expect(MongoDatasetSynonymMapping.countDocuments({ datasetId })).resolves.toBe(2);

    await MongoDatasetData.updateOne({ _id: data._id }, { $set: { synonymVersion: 2 } });
    await expect(
      cleanupUnusedDatasetSynonymMappings({
        teamId: String(teamId),
        datasetId: String(datasetId),
        activeVersion: 2
      })
    ).resolves.toBe(true);
    await expect(MongoDatasetSynonymMapping.find({ datasetId }).lean()).resolves.toEqual([
      expect.objectContaining({ fileVersion: 2 })
    ]);
  });

  it('preserves mappings newer than the version being cleaned up', async () => {
    const teamId = new Types.ObjectId();
    const datasetId = new Types.ObjectId();
    const synonym = await MongoDatasetSynonym.create({
      teamId,
      datasetId,
      version: 2,
      enabled: true,
      schemaVersion: 1
    });
    await MongoDatasetSynonymMapping.create(
      [1, 2, 3].map((fileVersion) => ({
        logicalMappingId: new Types.ObjectId(),
        teamId,
        datasetId,
        synonymFileId: synonym._id,
        fileVersion,
        standardizedTerm: `standard-${fileVersion}`,
        normalizedStandardizedTerm: `standard-${fileVersion}`,
        synonymTerms: [`alias-${fileVersion}`],
        normalizedSynonymTerms: [`alias-${fileVersion}`],
        allTerms: `standard-${fileVersion} alias-${fileVersion}`,
        fingerprint: `mapping-${fileVersion}`
      }))
    );

    await expect(
      cleanupUnusedDatasetSynonymMappings({
        teamId: String(teamId),
        datasetId: String(datasetId),
        activeVersion: 2
      })
    ).resolves.toBe(true);
    const mappings = await MongoDatasetSynonymMapping.find({ datasetId }).sort({ fileVersion: 1 });
    expect(mappings.map(({ fileVersion }) => fileVersion)).toEqual([2, 3]);
  });
});
