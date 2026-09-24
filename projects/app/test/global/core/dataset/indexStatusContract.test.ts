import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DatasetDataIndexStatusEnum,
  DatasetDataIndexStatusMap,
  getDatasetDataIndexStatusMapData
} from '@fastgpt/global/core/dataset/data/constants';
import {
  indexedDatasetDataMatch,
  isDatasetDataIndexed
} from '@fastgpt/global/core/dataset/data/utils';
import { DatasetDataItemSchema, DatasetDataSchema } from '@fastgpt/global/core/dataset/type';
import { GetDataListItemSchema } from '@fastgpt/global/openapi/core/dataset/data/api';
import { Types } from '@fastgpt/service/common/mongo';
import zhCN from '@fastgpt/web/i18n/zh-CN/dataset.json';
import zhHant from '@fastgpt/web/i18n/zh-Hant/dataset.json';
import en from '@fastgpt/web/i18n/en/dataset.json';
import koKR from '@fastgpt/web/i18n/ko-KR/dataset.json';

const buildItem = (extra: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  teamId: new Types.ObjectId(),
  tmbId: new Types.ObjectId(),
  datasetId: new Types.ObjectId(),
  collectionId: new Types.ObjectId(),
  q: 'question',
  chunkIndex: 0,
  updateTime: new Date(),
  fullTextToken: '',
  indexes: [],
  ...extra
});

describe('indexStatus schema contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** DS-01：旧数据字段缺失时业务语义为已完成索引。 */
  it('treats missing indexStatus as indexed without backfilling', () => {
    expect(isDatasetDataIndexed(undefined)).toBe(true);
    expect(isDatasetDataIndexed(DatasetDataIndexStatusEnum.indexed)).toBe(true);
    expect(isDatasetDataIndexed(DatasetDataIndexStatusEnum.parsed)).toBe(false);
    expect(isDatasetDataIndexed(DatasetDataIndexStatusEnum.indexing)).toBe(false);
  });

  it('builds an indexed-or-missing query for status-aware reads', () => {
    expect(indexedDatasetDataMatch).toEqual({
      $or: [
        { indexStatus: DatasetDataIndexStatusEnum.indexed },
        { indexStatus: { $exists: false } }
      ]
    });
  });

  /** DS-04：schema 必须接受 indexStatus，否则 strict 模式下写入会静默失效。 */
  it.each(Object.values(DatasetDataIndexStatusEnum))(
    'accepts %s on the mongo data schema',
    (indexStatus) => {
      expect(DatasetDataSchema.parse(buildItem({ indexStatus })).indexStatus).toBe(indexStatus);
      expect(DatasetDataSchema.parse(buildItem()).indexStatus).toBeUndefined();
    }
  );

  it('rejects unknown status values', () => {
    expect(() => DatasetDataSchema.parse(buildItem({ indexStatus: 'pending' }))).toThrow();
  });

  it('keeps the field optional in the API item schemas', () => {
    expect(
      DatasetDataItemSchema.parse({
        id: new Types.ObjectId(),
        teamId: new Types.ObjectId(),
        datasetId: new Types.ObjectId(),
        collectionId: new Types.ObjectId(),
        updateTime: new Date(),
        sourceName: 'source',
        chunkIndex: 0,
        indexes: [],
        isOwner: true,
        q: 'question'
      }).indexStatus
    ).toBeUndefined();

    expect(
      GetDataListItemSchema.parse({
        _id: new Types.ObjectId(),
        datasetId: new Types.ObjectId(),
        collectionId: new Types.ObjectId(),
        q: 'question',
        indexStatus: DatasetDataIndexStatusEnum.parsed
      }).indexStatus
    ).toBe(DatasetDataIndexStatusEnum.parsed);
  });
});

describe('indexStatus display contract', () => {
  /** DS-11 / DS-14：三态都有展示信息，缺失字段按 indexed 展示。 */
  it('maps every status to a display entry and falls back to indexed', () => {
    Object.values(DatasetDataIndexStatusEnum).forEach((status) => {
      const info = getDatasetDataIndexStatusMapData(status);
      expect(DatasetDataIndexStatusMap[status]).toBe(info);
      expect(info.label).toBeTruthy();
    });

    expect(getDatasetDataIndexStatusMapData(undefined)).toBe(
      DatasetDataIndexStatusMap[DatasetDataIndexStatusEnum.indexed]
    );
  });

  /** UI-07：新增状态文案在四个语言包中完整可用。 */
  it('provides status labels in all supported locales', () => {
    const locales: [string, Record<string, string>][] = [
      ['zh-CN', zhCN],
      ['zh-Hant', zhHant],
      ['en', en],
      ['ko-KR', koKR]
    ];

    locales.forEach(([locale, resource]) => {
      Object.values(DatasetDataIndexStatusEnum).forEach((status) => {
        const key = `data_index_status_${status}`;
        expect(resource[key], `${locale} 缺少 ${key}`).toBeTruthy();
      });
    });
  });
});
