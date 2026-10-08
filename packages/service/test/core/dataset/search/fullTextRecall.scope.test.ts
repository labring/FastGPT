import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { FullTextSearchItem } from '@fastgpt/service/common/vectorDB/type';

const searchMock = vi.hoisted(() => vi.fn());

// 只替换全文引擎；主数据和集合回查运行真实 Mongo 查询，验证引擎结果不能扩大检索范围。
vi.mock('@fastgpt/service/core/dataset/data/textStore', () => ({
  getFullTextStore: () => ({ search: searchMock })
}));

import { fullTextRecall } from '@fastgpt/service/core/dataset/search/defaultRecall/fullTextRecall';

/** 创建独立资源，模拟索引比主数据旧或引擎忽略过滤条件的情况。 */
const createFixtures = async () => {
  const teamId = new Types.ObjectId();
  const otherTeamId = new Types.ObjectId();
  const datasetId = new Types.ObjectId();
  const otherDatasetId = new Types.ObjectId();
  const tmbId = new Types.ObjectId();

  const createCollection = async (
    name: string,
    scope: { teamId?: Types.ObjectId; datasetId?: Types.ObjectId; forbid?: boolean } = {}
  ) =>
    MongoDatasetCollection.create({
      teamId,
      datasetId,
      tmbId,
      type: DatasetCollectionTypeEnum.file,
      ...scope,
      name
    });

  const readable = await createCollection('readable-source');
  const hidden = await createCollection('hidden-source');
  const forbidden = await createCollection('forbidden-source', { forbid: true });
  const anotherDataset = await createCollection('other-dataset-source', {
    datasetId: otherDatasetId
  });
  const anotherTeam = await createCollection('other-team-source', { teamId: otherTeamId });

  const createData = async (
    collection: typeof readable,
    scope: { teamId?: Types.ObjectId; datasetId?: Types.ObjectId } = {}
  ) =>
    MongoDatasetData.create({
      teamId: collection.teamId,
      datasetId: collection.datasetId,
      tmbId,
      collectionId: collection._id,
      q: `${collection.name} question`,
      a: `${collection.name} answer`,
      chunkIndex: 3,
      metadata: { origin: collection.name },
      indexes: [{ dataId: `${collection.name}-vector`, text: collection.name }],
      ...scope
    });

  const readableData = await createData(readable);
  const hiddenData = await createData(hidden);
  const forbiddenData = await createData(forbidden);
  const otherDatasetData = await createData(anotherDataset);
  const otherTeamData = await createData(anotherTeam);

  const hit = (data: typeof readableData, score = 2): FullTextSearchItem => ({
    dataId: String(data._id),
    collectionId: String(data.collectionId),
    score
  });

  const recall = (overrides: Partial<Parameters<typeof fullTextRecall>[0]> = {}) =>
    fullTextRecall({
      teamId: String(teamId),
      datasetIds: [String(datasetId)],
      queryGroups: [{ source: 'text', queries: ['question'] }],
      limit: 10,
      forbidCollectionIdList: [],
      ...overrides
    });

  return {
    teamId,
    datasetId,
    otherTeamId,
    otherDatasetId,
    readable,
    hidden,
    forbidden,
    anotherDataset,
    anotherTeam,
    readableData,
    hiddenData,
    forbiddenData,
    otherDatasetData,
    otherTeamData,
    createData,
    hit,
    recall
  };
};

beforeEach(() => {
  searchMock.mockReset();
});

describe.sequential('fullTextRecall authoritative Mongo scope', () => {
  it('keeps permitted content, metadata, indexes and source attribution', async () => {
    const f = await createFixtures();
    searchMock.mockResolvedValue([f.hit(f.readableData, 4)]);

    const result = await f.recall();

    expect(result.imageCaptionFullTextRecallResults).toEqual([]);
    expect(result.textFullTextRecallResults).toEqual([
      expect.objectContaining({
        id: String(f.readableData._id),
        datasetId: String(f.datasetId),
        collectionId: String(f.readable._id),
        q: 'readable-source question',
        a: 'readable-source answer',
        sourceName: 'readable-source',
        chunkIndex: 3,
        metadata: { origin: 'readable-source' },
        indexes: [expect.objectContaining({ dataId: 'readable-source-vector' })]
      })
    ]);
  });

  it('drops inaccessible engine hits while retaining the authorized hit', async () => {
    const f = await createFixtures();
    searchMock.mockResolvedValue([f.hit(f.hiddenData, 10), f.hit(f.readableData, 2)]);

    const result = await f.recall({ filterCollectionIdList: [String(f.readable._id)] });

    expect(result.textFullTextRecallResults.map((item) => item.id)).toEqual([
      String(f.readableData._id)
    ]);
    expect(JSON.stringify(result)).not.toContain('hidden-source');
    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({ filterCollectionIdList: [String(f.readable._id)] })
    );
  });

  it('does not hydrate another team even if its dataset ID matches', async () => {
    const f = await createFixtures();
    searchMock.mockResolvedValue([f.hit(f.otherTeamData), f.hit(f.readableData)]);

    const result = await f.recall();

    expect(result.textFullTextRecallResults.map((item) => item.id)).toEqual([
      String(f.readableData._id)
    ]);
    expect(JSON.stringify(result)).not.toContain('other-team-source');
  });

  it('does not hydrate another dataset in the same team', async () => {
    const f = await createFixtures();
    searchMock.mockResolvedValue([f.hit(f.otherDatasetData), f.hit(f.readableData)]);

    const result = await f.recall();

    expect(result.textFullTextRecallResults.map((item) => item.id)).toEqual([
      String(f.readableData._id)
    ]);
    expect(JSON.stringify(result)).not.toContain('other-dataset-source');
  });

  it('supports multiple selected datasets without weakening team isolation', async () => {
    const f = await createFixtures();
    searchMock.mockResolvedValue([
      f.hit(f.readableData),
      f.hit(f.otherDatasetData),
      f.hit(f.otherTeamData)
    ]);

    const result = await f.recall({
      datasetIds: [String(f.datasetId), String(f.otherDatasetId)]
    });

    expect(result.textFullTextRecallResults.map((item) => item.id)).toEqual([
      String(f.readableData._id),
      String(f.otherDatasetData._id)
    ]);
  });

  it('excludes forbidden IDs even when the engine returns them', async () => {
    const f = await createFixtures();
    searchMock.mockResolvedValue([f.hit(f.hiddenData), f.hit(f.readableData)]);

    const result = await f.recall({ forbidCollectionIdList: [String(f.hidden._id)] });

    expect(result.textFullTextRecallResults.map((item) => item.id)).toEqual([
      String(f.readableData._id)
    ]);
  });

  it('forbidden IDs take precedence over the readable set', async () => {
    const f = await createFixtures();
    searchMock.mockResolvedValue([f.hit(f.hiddenData), f.hit(f.readableData)]);

    const result = await f.recall({
      filterCollectionIdList: [String(f.hidden._id), String(f.readable._id)],
      forbidCollectionIdList: [String(f.hidden._id)]
    });

    expect(result.textFullTextRecallResults.map((item) => item.id)).toEqual([
      String(f.readableData._id)
    ]);
  });

  it('compares collection scopes using canonical ObjectIds', async () => {
    const f = await createFixtures();
    searchMock.mockResolvedValue([
      { ...f.hit(f.readableData), collectionId: String(f.readable._id).toUpperCase() }
    ]);

    const result = await f.recall({
      filterCollectionIdList: [String(f.readable._id).toUpperCase()]
    });

    expect(result.textFullTextRecallResults.map((item) => item.id)).toEqual([
      String(f.readableData._id)
    ]);
    await expect(
      f.recall({ forbidCollectionIdList: [String(f.readable._id).toUpperCase()] })
    ).resolves.toEqual({ textFullTextRecallResults: [], imageCaptionFullTextRecallResults: [] });
  });

  it('checks current forbid state rather than relying on an earlier forbid list', async () => {
    const f = await createFixtures();
    searchMock.mockResolvedValue([f.hit(f.forbiddenData), f.hit(f.readableData)]);

    const result = await f.recall();

    expect(result.textFullTextRecallResults.map((item) => item.id)).toEqual([
      String(f.readableData._id)
    ]);
    expect(JSON.stringify(result)).not.toContain('forbidden-source');
  });

  it('does not attach an authorized source to data from another collection', async () => {
    const f = await createFixtures();
    searchMock.mockResolvedValue([
      { ...f.hit(f.hiddenData), collectionId: String(f.readable._id) },
      f.hit(f.readableData)
    ]);

    const result = await f.recall({ filterCollectionIdList: [String(f.readable._id)] });

    expect(result.textFullTextRecallResults.map((item) => item.id)).toEqual([
      String(f.readableData._id)
    ]);
    expect(JSON.stringify(result)).not.toContain('hidden-source question');
  });

  it('rejects stale collection IDs after a data row moves', async () => {
    const f = await createFixtures();
    const staleHit = f.hit(f.readableData);
    await MongoDatasetData.updateOne(
      { _id: f.readableData._id },
      { $set: { collectionId: f.hidden._id } }
    );
    searchMock.mockResolvedValue([staleHit]);

    await expect(f.recall()).resolves.toEqual({
      textFullTextRecallResults: [],
      imageCaptionFullTextRecallResults: []
    });
  });

  it('rejects data/collection dataset mismatches even when both datasets are selected', async () => {
    const f = await createFixtures();
    const inconsistent = await f.createData(f.readable, { datasetId: f.otherDatasetId });
    searchMock.mockResolvedValue([f.hit(inconsistent), f.hit(f.readableData)]);

    const result = await f.recall({
      datasetIds: [String(f.datasetId), String(f.otherDatasetId)]
    });

    expect(result.textFullTextRecallResults.map((item) => item.id)).toEqual([
      String(f.readableData._id)
    ]);
  });

  it('rejects a foreign data row that points at a selected collection', async () => {
    const f = await createFixtures();
    const foreign = await f.createData(f.readable, { teamId: f.otherTeamId });
    searchMock.mockResolvedValue([f.hit(foreign), f.hit(f.readableData)]);

    const result = await f.recall();

    expect(result.textFullTextRecallResults.map((item) => item.id)).toEqual([
      String(f.readableData._id)
    ]);
  });

  it('skips deleted data and deleted collections independently', async () => {
    const f = await createFixtures();
    await MongoDatasetData.deleteOne({ _id: f.hiddenData._id });
    await MongoDatasetCollection.deleteOne({ _id: f.anotherDataset._id });
    searchMock.mockResolvedValue([
      f.hit(f.hiddenData),
      f.hit(f.otherDatasetData),
      f.hit(f.readableData)
    ]);

    const result = await f.recall({
      datasetIds: [String(f.datasetId), String(f.otherDatasetId)]
    });

    expect(result.textFullTextRecallResults.map((item) => item.id)).toEqual([
      String(f.readableData._id)
    ]);
  });

  it('applies the same scope to image captions and text queries', async () => {
    const f = await createFixtures();
    searchMock.mockResolvedValue([f.hit(f.hiddenData), f.hit(f.readableData)]);

    const result = await f.recall({
      filterCollectionIdList: [String(f.readable._id)],
      queryGroups: [
        { source: 'text', queries: ['text question'] },
        { source: 'imageCaption', queries: ['image caption'] }
      ]
    });

    for (const list of [
      result.textFullTextRecallResults,
      result.imageCaptionFullTextRecallResults
    ]) {
      expect(list.map((item) => item.id)).toEqual([String(f.readableData._id)]);
    }
    expect(searchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves query fusion and applies the result limit after scope filtering', async () => {
    const f = await createFixtures();
    searchMock
      .mockResolvedValueOnce([f.hit(f.hiddenData, 10), f.hit(f.readableData, 3)])
      .mockResolvedValueOnce([f.hit(f.readableData, 5)]);

    const result = await f.recall({
      limit: 1,
      filterCollectionIdList: [String(f.readable._id)],
      queryGroups: [{ source: 'text', queries: ['question', 'expanded question'] }]
    });

    expect(result.textFullTextRecallResults).toHaveLength(1);
    expect(result.textFullTextRecallResults[0].id).toBe(String(f.readableData._id));
    expect(result.textFullTextRecallResults[0].score[0].index).toBe(0);
  });

  it('drops an unknown data ID without dropping the valid sibling', async () => {
    const f = await createFixtures();
    searchMock.mockResolvedValue([
      { ...f.hit(f.readableData), dataId: String(new Types.ObjectId()) },
      f.hit(f.readableData)
    ]);

    const result = await f.recall();

    expect(result.textFullTextRecallResults.map((item) => item.id)).toEqual([
      String(f.readableData._id)
    ]);
  });

  it('rejects a stale Mongo text index after data moves to an inaccessible collection', async () => {
    const f = await createFixtures();
    const { MongoFullTextStore } = await vi.importActual<
      typeof import('@fastgpt/service/core/dataset/data/textStore')
    >('@fastgpt/service/core/dataset/data/textStore');
    const store = new MongoFullTextStore();
    await MongoDatasetDataText.createIndexes();
    await store.write([
      {
        teamId: String(f.teamId),
        datasetId: String(f.datasetId),
        collectionId: String(f.readable._id),
        dataId: String(f.readableData._id),
        fullText: 'question'
      }
    ]);
    await MongoDatasetData.updateOne(
      { _id: f.readableData._id },
      { $set: { collectionId: f.hidden._id } }
    );
    searchMock.mockImplementation((props) => store.search(props));

    const result = await f.recall({ filterCollectionIdList: [String(f.readable._id)] });

    expect(await searchMock.mock.results[0].value).toEqual([
      expect.objectContaining({
        dataId: String(f.readableData._id),
        collectionId: String(f.readable._id)
      })
    ]);
    expect(result.textFullTextRecallResults).toEqual([]);
  });

  it('keeps a live Mongo text index result with the same content and source', async () => {
    const f = await createFixtures();
    const { MongoFullTextStore } = await vi.importActual<
      typeof import('@fastgpt/service/core/dataset/data/textStore')
    >('@fastgpt/service/core/dataset/data/textStore');
    const store = new MongoFullTextStore();
    await MongoDatasetDataText.createIndexes();
    await store.write([
      {
        teamId: String(f.teamId),
        datasetId: String(f.datasetId),
        collectionId: String(f.readable._id),
        dataId: String(f.readableData._id),
        fullText: 'question'
      }
    ]);
    searchMock.mockImplementation((props) => store.search(props));

    const result = await f.recall({ filterCollectionIdList: [String(f.readable._id)] });

    expect(result.textFullTextRecallResults).toEqual([
      expect.objectContaining({
        id: String(f.readableData._id),
        collectionId: String(f.readable._id),
        sourceName: 'readable-source',
        q: 'readable-source question'
      })
    ]);
  });
});
