import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  DatasetDataIndexStatusEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import type { SqlFullTextRow } from '@fastgpt/service/common/vectorDB/fullText/type';
import type { SqlFullTextProvider } from '@fastgpt/global/core/dataset/fullText/schema';
import { migrateSqlFullTextRecord } from '@/migration/tasks/4180/20261110_migrate_sql_fulltext/service';
import { mockVectorInsert, mockVectorDelete } from '@test/mocks/common/vector';
import { mockGetVectors, createMockVectorsResponse } from '@test/mocks/core/ai/embedding';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

// 实际执行 Mongo 事务和索引生成编排，只隔离模型请求、物理 SQL 及用量上报。
vi.unmock('@fastgpt/service/common/mongo/sessionRun');
const state = vi.hoisted(() => ({
  provider: 'pg' as SqlFullTextProvider,
  rows: new Map<string, SqlFullTextRow>(),
  fill: vi.fn(),
  missing: vi.fn(),
  model: vi.fn(),
  points: vi.fn(),
  usage: vi.fn(),
  config: vi.fn(),
  matcher: vi.fn()
}));
vi.mock('@fastgpt/service/common/vectorDB/fullText/controller', () => ({
  getSqlFullTextAdapter: () => ({
    provider: state.provider,
    fill: state.fill,
    findMissingVectorIds: state.missing
  })
}));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getTeamModelHandle: async () => ({ getModelData: state.model })
}));
vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAIPoints: state.points
}));
vi.mock('@/service/support/wallet/usage/push', () => ({ pushGenerateVectorUsage: state.usage }));
vi.mock('@fastgpt/service/core/dataset/synonym/entity', () => ({
  getDatasetSynonymConfig: state.config,
  getDatasetSynonymMatcher: state.matcher
}));

const seed = async () => {
  const teamId = new Types.ObjectId();
  const dataset = await MongoDataset.create({
    teamId,
    tmbId: new Types.ObjectId(),
    name: 'repair',
    vectorModel: 'original-embedding'
  });
  const data = await MongoDatasetData.create({
    teamId,
    datasetId: dataset._id,
    tmbId: new Types.ObjectId(),
    collectionId: new Types.ObjectId(),
    q: '原正文',
    a: '原答案',
    synonymVersion: 0,
    indexes: [
      { dataId: '1', text: '缺失的索引', type: DatasetDataIndexTypeEnum.custom },
      { dataId: '2', text: '现有的索引', type: DatasetDataIndexTypeEnum.custom }
    ]
  });
  state.rows.set('2', {
    vectorId: '2',
    teamId: String(teamId),
    datasetId: String(dataset._id),
    collectionId: String(data.collectionId),
    text: '现有的索引'
  });
  return { dataset, data, id: String(data._id) };
};

beforeEach(() => {
  state.provider = 'pg';
  state.rows.clear();
  state.fill
    .mockReset()
    .mockImplementation(async (rows: SqlFullTextRow[]) =>
      rows
        .filter((row) =>
          Object.entries(row).some(
            ([key, value]) => state.rows.get(row.vectorId)?.[key as keyof SqlFullTextRow] !== value
          )
        )
        .map((row) => row.vectorId)
    );
  state.missing
    .mockReset()
    .mockImplementation(async (ids: string[]) => ids.filter((id) => !state.rows.has(id)));
  state.model
    .mockReset()
    .mockReturnValue({ model: 'original-embedding', config: { maxToken: 8192 } });
  state.points.mockReset().mockResolvedValue(undefined);
  state.usage.mockReset();
  state.config.mockReset().mockResolvedValue(null);
  state.matcher.mockReset();
  mockGetVectors
    .mockReset()
    .mockImplementation(async ({ inputs }) =>
      createMockVectorsResponse(inputs.map((input) => input.input))
    );
  mockVectorInsert
    .mockReset()
    .mockImplementation(async ({ texts, teamId, datasetId, collectionId }) => {
      const insertIds = texts.map((text: string, n: number) => {
        const vectorId = String(100 + n);
        state.rows.set(vectorId, {
          vectorId,
          text,
          teamId: String(teamId),
          datasetId: String(datasetId),
          collectionId: String(collectionId)
        });
        return vectorId;
      });
      return { insertIds };
    });
  mockVectorDelete
    .mockReset()
    .mockImplementation(async ({ idList }) =>
      idList.forEach((id: string) => state.rows.delete(id))
    );
});

describe('SQL full-text missing vector repair', () => {
  it('repairs only missing PG rows, without checking or charging points, and skips repaired rows on retry', async () => {
    const { data, id } = await seed();
    state.points.mockRejectedValue(new Error('insufficient points'));
    expect(await migrateSqlFullTextRecord(id)).toBe(2);
    const current = (await MongoDatasetData.findById(id).lean())!;
    expect(current.indexes.map((index) => index.dataId)).toEqual(['100', '2']);
    expect(current).toMatchObject({ q: data.q, a: data.a, synonymVersion: 0 });
    expect(current.indexes[1]).toEqual(data.toObject().indexes[1]);
    expect(mockGetVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ model: 'original-embedding' }),
        inputs: [{ type: 'text', input: '缺失的索引' }]
      })
    );
    expect(state.rows.get('100')?.text).toBe('缺失的索引');
    expect(await migrateSqlFullTextRecord(id)).toBe(2);
    expect(await migrateSqlFullTextRecord(id, { validateOnly: true })).toBe(2);
    expect(mockGetVectors).toHaveBeenCalledOnce();
    expect(mockVectorInsert).toHaveBeenCalledOnce();
    expect(state.points).not.toHaveBeenCalled();
    expect(state.usage).not.toHaveBeenCalled();
  });

  it('uses the recorded historical synonym input for both vector and full text', async () => {
    const { id } = await seed();
    await MongoDatasetData.updateOne({ _id: id }, { $set: { synonymVersion: 3 } });
    state.config.mockResolvedValue({ version: 9, enabled: true });
    state.matcher.mockResolvedValue({
      hasMappings: true,
      transform: (text: string) => ({ transformedText: text.replace('缺失', '历史词') })
    });
    await migrateSqlFullTextRecord(id);
    expect(state.rows.get('100')?.text).toBe('历史词的索引');
    expect(mockGetVectors.mock.calls[0][0].inputs).toEqual([
      { type: 'text', input: '历史词的索引' }
    ]);
    expect((await MongoDatasetData.findById(id).lean())?.indexes[0].text).toBe('缺失的索引');
    expect(state.matcher).toHaveBeenCalledWith(expect.objectContaining({ fileVersion: 3 }));
  });

  it('repairs a historical BSON index without adding defaults or rewriting healthy index fields', async () => {
    const { id } = await seed();
    const _id = new Types.ObjectId(id);
    const missing = {
      defaultIndex: true,
      dataId: '1',
      text: '缺失的索引',
      _id: new Types.ObjectId()
    };
    const healthy = { text: '现有的索引', _id: new Types.ObjectId(), dataId: '2' };
    const original = (await MongoDatasetData.collection.findOne({ _id }))!;
    await MongoDatasetData.collection.deleteOne({ _id });
    await MongoDatasetData.collection.insertOne({
      ...original,
      indexes: [missing, healthy]
    });

    expect(await migrateSqlFullTextRecord(id)).toBe(2);
    const raw = await MongoDatasetData.collection.findOne({ _id });
    expect(raw?.indexes).toEqual([{ ...missing, dataId: '100' }, healthy]);
  });

  it.each(['ownership', 'text'] as const)(
    'rejects existing-row %s conflicts without generating replacements',
    async (kind) => {
      const { id } = await seed();
      state.rows.set('1', {
        ...state.rows.get('2')!,
        vectorId: '1',
        text: '缺失的索引',
        ...(kind === 'ownership' ? { teamId: 'other-team' } : { text: 'conflict' })
      });
      await expect(migrateSqlFullTextRecord(id)).rejects.toThrow('wrong ownership or conflicting');
      expect(mockGetVectors).not.toHaveBeenCalled();
    }
  );

  it('keeps explicit validation read-only even for physically missing rows', async () => {
    const { id } = await seed();
    await expect(migrateSqlFullTextRecord(id, { validateOnly: true })).rejects.toThrow(
      'requires repair'
    );
    expect(state.missing).not.toHaveBeenCalled();
    expect(mockVectorInsert).not.toHaveBeenCalled();
  });

  it.each(['edit', 'delete', 'model'] as const)(
    'discards new vectors after a concurrent %s',
    async (change) => {
      const { data, dataset, id } = await seed();
      const insert = mockVectorInsert.getMockImplementation()!;
      mockVectorInsert.mockImplementation(async (props) => {
        const result = await insert(props);
        if (change === 'delete') await MongoDatasetData.deleteOne({ _id: id });
        if (change === 'edit')
          await MongoDatasetData.updateOne({ _id: id }, { $set: { 'indexes.0.text': '新的编辑' } });
        if (change === 'model')
          await MongoDataset.updateOne(
            { _id: dataset._id },
            { $set: { vectorModel: 'new-model' } }
          );
        return result;
      });
      await expect(migrateSqlFullTextRecord(id)).rejects.toThrow(
        change === 'model' ? 'model changed' : 'changed or was deleted'
      );
      expect(state.rows.has('100')).toBe(false);
      expect(state.rows.get('2')?.text).toBe('现有的索引');
      const current = await MongoDatasetData.findById(id).lean();
      if (change === 'delete') expect(current).toBeNull();
      else {
        expect(current?.indexes.map((index) => index.dataId)).toEqual(
          data.indexes.map((index) => index.dataId)
        );
        if (change === 'edit') expect(current?.indexes[0].text).toBe('新的编辑');
      }
      expect(state.usage).not.toHaveBeenCalled();
    }
  );

  it('cleans uncommitted vectors after lease loss and leaves the source references intact', async () => {
    const { id } = await seed();
    const assertActive = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('lease lost'));
    await expect(migrateSqlFullTextRecord(id, { assertActive })).rejects.toThrow('lease lost');
    expect(state.rows.has('100')).toBe(false);
    expect((await MongoDatasetData.findById(id).lean())?.indexes[0].dataId).toBe('1');
  });

  it('preserves committed vector references when the transaction reports an ambiguous result', async () => {
    const { id } = await seed();
    const run = mongoSessionRun;
    vi.spyOn(
      await import('@fastgpt/service/common/mongo/sessionRun'),
      'mongoSessionRun'
    ).mockImplementationOnce(async (fn) => {
      await run(fn);
      throw new Error('commit response lost');
    });
    await expect(migrateSqlFullTextRecord(id)).rejects.toThrow('commit response lost');
    expect((await MongoDatasetData.findById(id).lean())?.indexes[0].dataId).toBe('100');
    expect(state.rows.has('100')).toBe(true);
  });

  it('rejects unavailable models and data awaiting rebuild before making model requests', async () => {
    const { id } = await seed();
    state.model.mockImplementation(() => {
      throw new Error('disabled');
    });
    await expect(migrateSqlFullTextRecord(id)).rejects.toThrow('model is unavailable');
    await MongoDatasetData.updateOne(
      { _id: id },
      { $set: { indexStatus: DatasetDataIndexStatusEnum.rebuildIndexPending } }
    );
    await expect(migrateSqlFullTextRecord(id)).rejects.toThrow('awaiting indexing');
    expect(mockGetVectors).not.toHaveBeenCalled();
  });

  it.each(['dataset', 'model reference'] as const)(
    'does not guess when the %s is missing',
    async (missing) => {
      const { dataset, id } = await seed();
      if (missing === 'dataset') await MongoDataset.deleteOne({ _id: dataset._id });
      else await MongoDataset.updateOne({ _id: dataset._id }, { $unset: { vectorModel: '' } });
      await expect(migrateSqlFullTextRecord(id)).rejects.toThrow('is missing');
      expect(mockGetVectors).not.toHaveBeenCalled();
    }
  );

  it.each(['oceanbase', 'seekdb', 'opengauss'] as const)(
    'reports missing %s rows for explicit rebuild without calling the model or billing',
    async (provider) => {
      state.provider = provider;
      const { id } = await seed();
      await expect(migrateSqlFullTextRecord(id)).rejects.toThrow(
        'rebuild this data before migrating'
      );
      expect(mockGetVectors).not.toHaveBeenCalled();
      expect(state.points).not.toHaveBeenCalled();
      expect(state.usage).not.toHaveBeenCalled();
    }
  );

  it('keeps old references when the embedding request fails', async () => {
    const { id } = await seed();
    mockGetVectors.mockRejectedValueOnce(new Error('embedding unavailable'));
    await expect(migrateSqlFullTextRecord(id)).rejects.toThrow('embedding unavailable');
    expect(mockVectorInsert).not.toHaveBeenCalled();
    expect((await MongoDatasetData.findById(id).lean())?.indexes[0].dataId).toBe('1');
  });

  it('does not silently remove unsupported image indexes when another missing text index was generated', async () => {
    const { id } = await seed();
    await MongoDatasetData.updateOne(
      { _id: id },
      {
        $push: {
          indexes: {
            dataId: '3',
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: 'unavailable.png'
          }
        }
      }
    );
    await expect(migrateSqlFullTextRecord(id)).rejects.toThrow('could not generate vectors');
    expect(state.rows.has('100')).toBe(false);
    expect(
      (await MongoDatasetData.findById(id).lean())?.indexes.map((index) => index.dataId)
    ).toEqual(['1', '2', '3']);
  });
});
