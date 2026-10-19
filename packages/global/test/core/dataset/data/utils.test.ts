import { describe, expect, it } from 'vitest';
import {
  DatasetDataIndexStatusEnum,
  DatasetDataIndexTypeEnum
} from '@fastgpt/global/core/dataset/data/constants';
import {
  getDatasetDataExternalIndexes,
  isDatasetDataIndexed,
  indexedDatasetDataMatch,
  isDatasetDataProcessing,
  isDatasetDataFailed
} from '@fastgpt/global/core/dataset/data/utils';

const cases = [
  { status: undefined, processing: false, failed: false },
  { status: DatasetDataIndexStatusEnum.indexing, processing: true, failed: false },
  { status: DatasetDataIndexStatusEnum.indexed, processing: false, failed: false },
  { status: DatasetDataIndexStatusEnum.error, processing: false, failed: true },
  {
    status: DatasetDataIndexStatusEnum.rebuildIndexPending,
    processing: true,
    failed: false
  },
  {
    status: DatasetDataIndexStatusEnum.rebuildIndexRunning,
    processing: true,
    failed: false
  },
  { status: DatasetDataIndexStatusEnum.rebuildIndexFailed, processing: false, failed: true },
  {
    status: DatasetDataIndexStatusEnum.rebuildSynonymPending,
    processing: true,
    failed: false
  },
  {
    status: DatasetDataIndexStatusEnum.rebuildSynonymRunning,
    processing: true,
    failed: false
  },
  {
    status: DatasetDataIndexStatusEnum.rebuildSynonymFailed,
    processing: false,
    failed: true
  }
];

describe('isDatasetDataProcessing', () => {
  it.each(cases)('identifies the processing boundary for $status', ({ status, processing }) => {
    expect(isDatasetDataProcessing(status)).toBe(processing);
  });
});

describe('isDatasetDataFailed', () => {
  it.each(cases)('identifies data failure for $status', ({ status, failed }) => {
    expect(isDatasetDataFailed(status)).toBe(failed);
  });
});

describe('isDatasetDataIndexed', () => {
  it.each([
    [undefined, true],
    [DatasetDataIndexStatusEnum.indexed, true],
    ...Object.values(DatasetDataIndexStatusEnum)
      .filter((status) => status !== DatasetDataIndexStatusEnum.indexed)
      .map((status) => [status, false] as const)
  ] as const)('treats %s as indexed=%s', (status, expected) => {
    expect(isDatasetDataIndexed(status)).toBe(expected);
  });

  it('includes explicitly indexed and legacy data in the database query', () => {
    expect(indexedDatasetDataMatch).toEqual({
      $or: [
        { indexStatus: DatasetDataIndexStatusEnum.indexed },
        { indexStatus: { $exists: false } }
      ]
    });
  });
});

describe('getDatasetDataExternalIndexes', () => {
  // TD 2026101200346：FAQ 数据入库时恒写入 2 条 default 索引（分别由 q、a 生成），
  // 导出 CSV 前必须丢掉它们，否则表头恒多 2 个 index 列，且回导时会变成重复的自定义索引。
  it('drops the q/a system indexes of a row without custom indexes', () => {
    expect(
      getDatasetDataExternalIndexes([
        { type: DatasetDataIndexTypeEnum.default, text: 'question' },
        { type: DatasetDataIndexTypeEnum.default, text: 'answer' }
      ])
    ).toEqual([]);
  });

  it('keeps custom indexes and drops the system ones around them', () => {
    const custom = [
      { type: DatasetDataIndexTypeEnum.custom, text: 'tag-1' },
      { type: DatasetDataIndexTypeEnum.custom, text: 'tag-2' },
      { type: DatasetDataIndexTypeEnum.custom, text: 'tag-3' }
    ];

    expect(
      getDatasetDataExternalIndexes([
        { type: DatasetDataIndexTypeEnum.default, text: 'question' },
        ...custom,
        { type: DatasetDataIndexTypeEnum.default, text: 'answer' }
      ])
    ).toEqual(custom);
  });

  it('drops image embeddings, which are regenerated from the image input', () => {
    expect(
      getDatasetDataExternalIndexes([
        { type: DatasetDataIndexTypeEnum.imageEmbedding, text: 'image description' }
      ])
    ).toEqual([]);
  });

  // type 缺失是变更前创建的历史数据，schema 默认按 custom 处理，不能连用户索引一起丢掉。
  it('keeps indexes whose type is missing', () => {
    const legacy = [{ text: 'legacy-index' }];

    expect(getDatasetDataExternalIndexes(legacy)).toEqual(legacy);
  });

  it('tolerates a missing indexes field', () => {
    expect(getDatasetDataExternalIndexes(undefined)).toEqual([]);
  });
});
