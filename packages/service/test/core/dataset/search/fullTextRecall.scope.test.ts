import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { FullTextSearchItem } from '@fastgpt/service/common/vectorDB/type';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba';

const searchMock = vi.hoisted(() => vi.fn());
const authCollectionMock = vi.hoisted(() => vi.fn());

// 异常引擎命中是防御性测试，不代表系统支持移动数据块；回查使用真实 Mongo。
vi.mock('@fastgpt/service/core/dataset/data/textStore', () => ({
  getFullTextStore: () => ({ search: searchMock })
}));

// API 集成只固定已授权身份并绕过 HTTP 包装；入参解析、事务和数据库写入保持真实。
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: vi.fn(),
  authDatasetCollection: authCollectionMock
}));
// 全局测试默认绕过事务；本组使用隔离的 replica set 验证真实 API 提交后的集合状态。
vi.mock('@fastgpt/service/common/mongo/sessionRun', async (importOriginal) => importOriginal());

import { fullTextRecall } from '@fastgpt/service/core/dataset/search/defaultRecall/fullTextRecall';
import { multiQueryRecall } from '@fastgpt/service/core/dataset/search/defaultRecall/multiQueryRecall';
import updateCollection from '@/pages/api/core/dataset/collection/update';

/** 创建独立资源；异常归属只用于防御性覆盖，禁用回归使用真实集合更新接口。 */
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

  const recallRequest = () =>
    multiQueryRecall({
      teamId: String(teamId),
      datasetIds: [String(datasetId)],
      model: {
        modelId: String(new Types.ObjectId()),
        provider: 'openai',
        model: 'unused-embedding-model',
        name: 'Unused embedding model',
        type: ModelTypeEnum.embedding,
        scope: ModelScopeEnum.system,
        isActive: true,
        config: { defaultToken: 100, maxToken: 100, weight: 0 }
      },
      readableCollectionIdList: [String(readable._id)],
      embeddingLimit: 0,
      fullTextLimit: 10,
      textQueries: ['question'],
      imageCaptionQueries: [],
      imageQueries: []
    });

  const setForbid = async (forbid: boolean) => {
    authCollectionMock.mockResolvedValue({ collection: readable, teamId, tmbId });
    await (updateCollection as unknown as (req: ApiRequestProps) => Promise<unknown>)({
      body: { id: String(readable._id), forbid }
    } as ApiRequestProps);
  };

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
    recall,
    recallRequest,
    setForbid
  };
};

beforeEach(() => {
  searchMock.mockReset();
  authCollectionMock.mockReset();
});

describe.sequential('fullTextRecall authoritative Mongo scope', () => {
  beforeAll(async () => {
    // 分词模块异步加载原生词典，单独运行真实全文用例时必须等待初始化完成。
    await vi.waitFor(async () => {
      expect(await jiebaSplit({ text: 'question' })).toBe('question');
    });
  });

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

  it('excludes a collection disabled through the API while full-text recall is in flight', async () => {
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
    searchMock.mockImplementation(async (props) => {
      // 调度层已读取禁用列表；真实索引命中后调用禁用 API，固定并发更新发生的时机。
      expect(props.forbidCollectionIdList).not.toContain(String(f.readable._id));
      const hits = await store.search(props);
      await f.setForbid(true);
      return hits;
    });

    const result = await f.recallRequest();

    expect(await searchMock.mock.results[0].value).toEqual([
      expect.objectContaining({
        dataId: String(f.readableData._id),
        collectionId: String(f.readable._id)
      })
    ]);
    expect(await MongoDatasetCollection.findById(f.readable._id).lean()).toMatchObject({
      forbid: true
    });
    const data = await MongoDatasetData.findById(f.readableData._id).lean();
    expect(String(data?.collectionId)).toBe(String(f.readable._id));
    expect(String(data?.datasetId)).toBe(String(f.datasetId));
    expect(await MongoDatasetDataText.countDocuments({ dataId: f.readableData._id })).toBe(1);
    expect(result.textFullTextRecallResults).toEqual([]);

    // 重新启用使用同一 API 和索引，正常检索无需重建索引即可恢复。
    await f.setForbid(false);
    searchMock.mockImplementation((props) => store.search(props));
    const enabled = await f.recallRequest();
    expect(enabled.textFullTextRecallResults.map((item) => item.id)).toEqual([
      String(f.readableData._id)
    ]);
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
