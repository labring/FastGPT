import { describe, expect, it } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { isValidPinyinNameSortKey } from '@fastgpt/service/common/string/sortKey';
import { buildDatasetCollectionNameSortKey } from '@fastgpt/service/core/dataset/collection/sortKey';
import {
  bulkRenameDatasetCollections,
  hasUnmigratedDatasetCollectionSortKey,
  queryDatasetCollectionListPage
} from '@fastgpt/service/core/dataset/collection/mongo/collectionQuery';

const sortByKey = (names: string[]) =>
  [...names].sort((a, b) => {
    const ka = buildDatasetCollectionNameSortKey(a);
    const kb = buildDatasetCollectionNameSortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

const hasBlockingSortStage = (plan: unknown): boolean => {
  if (!plan || typeof plan !== 'object') return false;
  if (Array.isArray(plan)) return plan.some(hasBlockingSortStage);
  const record = plan as Record<string, unknown>;
  if (record.stage === 'SORT') return true;
  return Object.values(record).some(hasBlockingSortStage);
};

const collectIndexNames = (plan: unknown, acc = new Set<string>()): Set<string> => {
  if (!plan || typeof plan !== 'object') return acc;
  if (Array.isArray(plan)) {
    plan.forEach((item) => collectIndexNames(item, acc));
    return acc;
  }
  const record = plan as Record<string, unknown>;
  if (record.stage === 'IXSCAN' && typeof record.indexName === 'string') {
    acc.add(record.indexName);
  }
  Object.values(record).forEach((value) => collectIndexNames(value, acc));
  return acc;
};

describe('buildDatasetCollectionNameSortKey', () => {
  it('uses normal polyphone mode (non-surname) and orders A-Z (Chinese before English) -> digits -> symbols', () => {
    expect(
      buildDatasetCollectionNameSortKey('单据管理').startsWith('0:d:0:dan ju guan li\x1f')
    ).toBe(true);
    expect(
      buildDatasetCollectionNameSortKey('曾几何时').startsWith('0:c:0:ceng ji he shi\x1f')
    ).toBe(true);
    expect(buildDatasetCollectionNameSortKey('仇恨').startsWith('0:c:0:chou hen\x1f')).toBe(true);
    expect(isValidPinyinNameSortKey(buildDatasetCollectionNameSortKey('单据管理'))).toBe(true);

    expect(
      sortByKey([
        '📄文档',
        '_draft',
        '10号文件',
        '2号文件',
        'Zebra.md',
        '资料库',
        '单据管理',
        'Doc.md',
        'Apple.pdf',
        '安全规范'
      ])
    ).toEqual([
      '安全规范',
      'Apple.pdf',
      '单据管理',
      'Doc.md',
      '资料库',
      'Zebra.md',
      '10号文件',
      '2号文件',
      '_draft',
      '📄文档'
    ]);

    // 非汉字开头的混合文件名按规范化原名字典序比较，不因汉字转拼音插入空格而倒序
    expect(sortByKey(['A中说明', 'Ab说明', 'aB说明', 'A1说明'])).toEqual([
      'A1说明',
      'Ab说明',
      'aB说明',
      'A中说明'
    ]);
    expect(sortByKey(['2阿文档', '2B文档', '20文档'])).toEqual(['20文档', '2B文档', '2阿文档']);
    expect(sortByKey(['#中测试', '#b测试'])).toEqual(['#b测试', '#中测试']);
  });
});

describe('DatasetCollection nameSortKey hooks and collectionQuery', () => {
  const createBase = () => ({
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    datasetId: new Types.ObjectId(),
    parentId: null as Types.ObjectId | null,
    type: DatasetCollectionTypeEnum.file
  });

  it('keeps nameSortKey in sync across create, insertMany, updateOne ($set & top-level), and bulkRenameDatasetCollections', async () => {
    const base = createBase();

    const single = await MongoDatasetCollection.create({ ...base, name: '初始文档' });
    expect(single.nameSortKey).toBe(buildDatasetCollectionNameSortKey('初始文档'));

    const inserted = await MongoDatasetCollection.insertMany([
      { ...base, name: '批量文件A', apiFileId: 'api-a' },
      { ...base, name: '批量文件B', apiFileId: 'api-b' }
    ]);
    expect(inserted.map((doc) => doc.nameSortKey)).toEqual([
      buildDatasetCollectionNameSortKey('批量文件A'),
      buildDatasetCollectionNameSortKey('批量文件B')
    ]);

    await MongoDatasetCollection.updateOne({ _id: single._id }, { $set: { name: '安全手册' } });
    expect((await MongoDatasetCollection.findById(single._id).lean())?.nameSortKey).toBe(
      buildDatasetCollectionNameSortKey('安全手册')
    );

    // 顶层更新载荷（如 datasetParse 队列写回网页标题）
    await MongoDatasetCollection.updateOne({ _id: single._id }, { name: '单据中心' });
    expect((await MongoDatasetCollection.findById(single._id).lean())?.nameSortKey).toBe(
      buildDatasetCollectionNameSortKey('单据中心')
    );

    // Pro API 同步批量改名入口（绕过 Mongoose Hook，须显式双写）
    const renameRes = await bulkRenameDatasetCollections({
      teamId: String(base.teamId),
      datasetId: String(base.datasetId),
      items: [
        { collectionId: String(inserted[0]._id), apiFileId: 'api-a', name: '阿凡达' },
        { collectionId: String(inserted[1]._id), apiFileId: 'api-b', name: '007说明' }
      ]
    });
    expect(renameRes.modifiedCount).toBe(2);

    const renamed = await MongoDatasetCollection.find({
      _id: { $in: [inserted[0]._id, inserted[1]._id] }
    })
      .sort({ nameSortKey: 1 })
      .lean();
    expect(renamed.map((doc) => ({ name: doc.name, key: doc.nameSortKey }))).toEqual([
      { name: '阿凡达', key: buildDatasetCollectionNameSortKey('阿凡达') },
      { name: '007说明', key: buildDatasetCollectionNameSortKey('007说明') }
    ]);
  });

  it('uses fg_dataset_col_parent_name_sort index without blocking SORT for both asc and desc, and falls back when unmigrated docs exist', async () => {
    await MongoDatasetCollection.createIndexes();
    const base = createBase();
    await MongoDatasetCollection.insertMany([
      { ...base, name: '资料库' },
      { ...base, name: 'Apple' },
      { ...base, name: '安全规范' },
      { ...base, name: '123报告' },
      { ...base, name: '#置顶符号' }
    ]);

    const match = {
      teamId: base.teamId,
      datasetId: base.datasetId,
      parentId: null
    };
    const selectField = { _id: 1, name: 1 } as const;

    expect(await hasUnmigratedDatasetCollectionSortKey(match)).toBe(false);

    const asc = await queryDatasetCollectionListPage({
      match,
      selectField,
      sortBy: 'name',
      sortOrder: 'asc',
      offset: 0,
      pageSize: 10
    });
    const desc = await queryDatasetCollectionListPage({
      match,
      selectField,
      sortBy: 'name',
      sortOrder: 'desc',
      offset: 0,
      pageSize: 10
    });

    const expectedAsc = ['安全规范', 'Apple', '资料库', '123报告', '#置顶符号'];
    expect(asc.map((item) => item.name)).toEqual(expectedAsc);
    expect(desc.map((item) => item.name)).toEqual([...expectedAsc].reverse());

    // 验证正向与严格逆序扫描均命中 fg_dataset_col_parent_name_sort 且无阻塞排序
    for (const dir of [1, -1] as const) {
      const explain = await MongoDatasetCollection.find(match, selectField)
        .sort({ nameSortKey: dir, _id: dir })
        .limit(10)
        .explain('queryPlanner');
      const winningPlan = (explain as { queryPlanner?: { winningPlan?: unknown } }).queryPlanner
        ?.winningPlan;
      expect(collectIndexNames(winningPlan).has('fg_dataset_col_parent_name_sort')).toBe(true);
      expect(hasBlockingSortStage(winningPlan)).toBe(false);
    }

    // 写入一条缺失 nameSortKey 的存量记录，验证过渡探测触发旧 lower(name) 回落排序
    await MongoDatasetCollection.collection.insertOne({
      _id: new Types.ObjectId(),
      teamId: base.teamId,
      tmbId: base.tmbId,
      datasetId: base.datasetId,
      parentId: null,
      type: DatasetCollectionTypeEnum.file,
      name: 'beta',
      createTime: new Date(),
      updateTime: new Date()
    });

    expect(await hasUnmigratedDatasetCollectionSortKey(match)).toBe(true);

    const fallbackAsc = await queryDatasetCollectionListPage({
      match,
      selectField,
      sortBy: 'name',
      sortOrder: 'asc',
      offset: 0,
      pageSize: 10
    });
    // 回落到 lower(name) 时 ASCII 符号/数字/英文全部排在中文之前
    expect(fallbackAsc.map((item) => item.name)).toEqual([
      '#置顶符号',
      '123报告',
      'Apple',
      'beta',
      '安全规范',
      '资料库'
    ]);

    // 空权限结果集直接短路
    expect(
      await queryDatasetCollectionListPage({
        match: { ...match, _id: { $in: [] } },
        selectField,
        sortBy: 'name',
        sortOrder: 'asc',
        offset: 0,
        pageSize: 10
      })
    ).toEqual([]);
  });
});
