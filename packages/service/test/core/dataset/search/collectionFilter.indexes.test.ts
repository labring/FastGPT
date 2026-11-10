import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoIndexManager } from '@fastgpt/service/common/mongo/indexManager';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetCollectionTagsV2 } from '@fastgpt/service/core/dataset/tag/schemaV2';
import {
  checkValue,
  filterCollectionByKeyValueTags,
  getForbidCollectionIdList,
  isAbsentAllowedOp
} from '@fastgpt/service/core/dataset/search/filter/collectionFilter';
import { countDatasetCollectionsByDatasetIds } from '@fastgpt/service/core/dataset/collection/entity';

const teamId = new Types.ObjectId();
const datasetId = new Types.ObjectId();
const parentId = new Types.ObjectId();
const tagDefinitions = [
  { _id: new Types.ObjectId(), tag: 'score', tagType: 'number' },
  { _id: new Types.ObjectId(), tag: 'multi', tagType: 'array' },
  { _id: new Types.ObjectId(), tag: 'text', tagType: 'string' },
  { _id: new Types.ObjectId(), tag: 'time', tagType: 'datetime' }
];
const definitions = new Map(tagDefinitions.map((tag) => [tag.tag, tag]));
const makeTags = ({
  score,
  multi,
  text,
  time = 1700000000000
}: {
  score: number | string;
  multi: string[] | string;
  text: string | string[];
  time?: number | string;
}) =>
  [score, multi, text, time].map((value, i) => ({ tagId: String(tagDefinitions[i]._id), value }));

/** 用原值比较器计算完整候选的结果，校验 Mongo 预筛不会改变旧值/空值语义。 */
const expectedIds = ({ docs, and, or }: { docs: any[]; and: any[]; or: any[] }) => {
  const matches = (doc: any, condition: any) => {
    const name = Object.keys(condition)[0];
    const op = Object.keys(condition[name])[0];
    const tag = definitions.get(name)!;
    const entry = doc.tags.find((item: any) => item.tagId === String(tag._id));
    return entry
      ? checkValue(op as any, condition[name][op], entry.value, tag.tagType)
      : isAbsentAllowedOp(op);
  };
  return docs
    .filter(
      (doc) =>
        and.every((c) => matches(doc, c)) && (or.length === 0 || or.some((c) => matches(doc, c)))
    )
    .map((doc) => String(doc._id))
    .sort();
};

describe('collection filters with consolidated indexes', () => {
  beforeEach(async () => {
    await MongoIndexManager.syncModelIndexes({ model: MongoDatasetCollection });
  });
  afterEach(() => vi.restoreAllMocks());

  it('preserves legacy values, OR/negative and empty-array semantics while narrowing positive candidates', async () => {
    await MongoDatasetCollectionTagsV2.collection.insertMany(
      tagDefinitions.map((tag) => ({ ...tag, teamId, datasetId }))
    );
    const docs = Array.from({ length: 2000 }, (_, i) => ({
      _id: new Types.ObjectId(),
      teamId,
      datasetId,
      parentId,
      type: 'file',
      name: String(i),
      tags: makeTags({
        score: i,
        multi: i % 1000 === 0 ? ['rare'] : ['common'],
        text: i % 1000 === 0 ? 'rare' : 'common',
        time: 1700000000000 + i * 1000
      })
    }));
    docs.push(
      {
        ...docs[0],
        _id: new Types.ObjectId(),
        tags: makeTags({
          score: '999',
          multi: [],
          text: ['a', 'b'],
          time: new Date(1700000999000).toISOString()
        })
      },
      {
        ...docs[0],
        _id: new Types.ObjectId(),
        tags: makeTags({ score: 'invalid', multi: 'rare', text: 'legacy', time: 'invalid' })
      },
      { ...docs[0], _id: new Types.ObjectId(), tags: [] }
    );
    await MongoDatasetCollection.collection.insertMany(docs);
    await MongoDatasetCollection.collection.insertOne({
      ...docs[0],
      _id: new Types.ObjectId(),
      teamId: new Types.ObjectId()
    });

    for (const [and, or] of [
      [[{ score: { $eq: 999 } }], []],
      [[{ time: { $eq: new Date(1700000999000).toISOString() } }], []],
      [[{ multi: { $contains: ['rare'] } }], []],
      [[{ multi: { $is: ['rare', 'rare'] } }], []],
      [[], [{ score: { $gte: 1999 } }, { text: { $eq: 'rare' } }]],
      [[{ multi: { $in: ['rare', 'common'] } }], [{ score: { $ne: 42 } }]],
      [[{ text: { $eq: 'a,b' } }], []],
      [[{ multi: { $is: [] } }], []],
      [[], [{ multi: { $contains: 'rare' } }, { text: { $empty: true } }]],
      [[], [{ score: { $ne: 0 } }, { multi: { $contains: 'rare' } }]]
    ] as [any[], any[]][]) {
      const find = vi.spyOn(MongoDatasetCollection, 'find');
      const actual = await filterCollectionByKeyValueTags({
        teamId: String(teamId),
        datasetIds: [String(datasetId)],
        $and: and,
        $or: or
      });
      const query = find.mock.calls.at(-1)![0];
      expect(actual?.sort()).toEqual(expectedIds({ docs, and, or }));
      if (and[0]?.score?.$eq === 999 || and[0]?.multi?.$contains) {
        const explain = await MongoDatasetCollection.find(query, '_id tags').explain(
          'executionStats'
        );
        expect(explain.executionStats.totalDocsExamined).toBeLessThan(20);
      }
      find.mockRestore();
    }
  });

  it('covers forbid IDs, folder enumeration and non-folder counts without fetching documents', async () => {
    const docs = Array.from({ length: 2000 }, (_, i) => ({
      _id: new Types.ObjectId(),
      teamId,
      datasetId,
      parentId: i < 100 ? null : parentId,
      type: i % 100 === 0 ? 'folder' : 'file',
      name: String(i),
      inheritPermission: i % 3 !== 0,
      forbid: i % 1000 === 0
    }));
    await MongoDatasetCollection.collection.insertMany(docs);
    expect(
      (
        await getForbidCollectionIdList({ teamId: String(teamId), datasetIds: [String(datasetId)] })
      ).sort()
    ).toEqual(
      docs
        .filter((doc) => doc.forbid)
        .map((doc) => String(doc._id))
        .sort()
    );
    expect(
      (
        await countDatasetCollectionsByDatasetIds({
          teamId: String(teamId),
          datasetIds: [String(datasetId)]
        })
      ).get(String(datasetId))
    ).toBe(1980);
    const raw = MongoDatasetCollection.collection;
    const forbidden = await raw
      .find({ teamId, datasetId: { $in: [datasetId] }, forbid: true }, { projection: { _id: 1 } })
      .explain('executionStats');
    const folders = await raw
      .find({ teamId, datasetId, type: 'folder' }, { projection: { _id: 1, parentId: 1 } })
      .explain('executionStats');
    const count = await raw
      .aggregate([
        { $match: { teamId, datasetId: { $in: [datasetId] }, type: { $ne: 'folder' } } },
        { $group: { _id: '$datasetId', count: { $sum: 1 } } }
      ])
      .explain('executionStats');
    expect(forbidden.executionStats.totalDocsExamined).toBe(0);
    expect(folders.executionStats.totalDocsExamined).toBe(0);
    expect(
      count.executionStats?.totalDocsExamined ??
        count.stages?.[0].$cursor.executionStats.totalDocsExamined
    ).toBe(0);
    const roots = await raw
      .find({ teamId, datasetId, parentId: null, inheritPermission: { $ne: false } })
      .toArray();
    expect(roots.map((doc) => String(doc._id)).sort()).toEqual(
      docs
        .filter((doc) => doc.parentId === null && doc.inheritPermission)
        .map((doc) => String(doc._id))
        .sort()
    );
  });
});
