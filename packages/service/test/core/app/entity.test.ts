import { beforeEach, describe, expect, it, vi } from 'vitest';
import { model, Schema, Types, type PipelineStage } from 'mongoose';
import { AppListSortEnum } from '@fastgpt/global/core/app/constants';
import { findAppsForList, findAppsPage } from '@fastgpt/service/core/app/entity';

const mocks = vi.hoisted(() => ({ find: vi.fn(), countDocuments: vi.fn(), aggregate: vi.fn() }));
vi.mock('@fastgpt/service/core/app/schema', () => ({ MongoApp: mocks }));

const castModel = model(
  'AppListQueryCasting',
  new Schema({
    teamId: Schema.Types.ObjectId,
    parentId: Schema.Types.ObjectId,
    tmbId: Schema.Types.ObjectId
  })
);
const filter = { teamId: new Types.ObjectId().toHexString(), deleteTime: null };
const fields = '_id name isPinned';
const options = { filter, fields, pinnedFirst: true, limit: 2 };

const queryResult = (items: { _id: string }[]) => {
  const query = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(items)
  };
  mocks.find.mockReturnValueOnce(query);
  return query;
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockImplementation((query) => ({ cast: () => castModel.find(query).cast(castModel) }));
  mocks.aggregate.mockResolvedValue([]);
});

describe('findAppsForList', () => {
  it('keeps the V1 non-paginated query unlimited', async () => {
    const query = queryResult([{ _id: 'normal' }]);
    await findAppsForList({ filter, fields });
    expect(query.limit).toHaveBeenCalledWith(0);
    expect(query.skip).toHaveBeenCalledWith(0);
  });

  it('preserves ordinary query sorting, pagination and projection without aggregation', async () => {
    const query = queryResult([{ _id: 'normal' }]);
    await findAppsForList({ filter, fields: '_id name', offset: 5, limit: 5 });
    expect(mocks.find).toHaveBeenCalledWith(filter, '_id name');
    expect(query.sort).toHaveBeenCalledWith({ updateTime: -1, _id: -1 });
    expect(query.skip).toHaveBeenCalledWith(5);
    expect(query.limit).toHaveBeenCalledWith(5);
    expect(mocks.aggregate).not.toHaveBeenCalled();
    expect(mocks.countDocuments).not.toHaveBeenCalled();
  });

  it('normalizes missing/false pins and sorts both groups in one unlimited query', async () => {
    await findAppsForList({ filter, fields, pinnedFirst: true });
    expect(mocks.aggregate).toHaveBeenCalledExactlyOnceWith([
      { $match: { ...filter, teamId: new Types.ObjectId(filter.teamId) } },
      {
        $addFields: {
          _pinRank: { $cond: [{ $eq: ['$isPinned', true] }, 1, 0] },
          _listSortTime: { $cond: [{ $eq: ['$isPinned', true] }, '$pinnedAt', '$updateTime'] }
        }
      },
      { $sort: { _pinRank: -1, _listSortTime: -1, _id: -1 } },
      { $project: { _id: 1, name: 1, isPinned: 1 } }
    ]);
    expect(mocks.countDocuments).not.toHaveBeenCalled();
  });

  it('applies explicit ordering inside each group before skipping and limiting', async () => {
    await findAppsForList({ ...options, sort: AppListSortEnum.createTimeAsc, offset: 3 });
    expect(mocks.aggregate.mock.calls[0][0].slice(1)).toEqual([
      { $addFields: { _pinRank: { $cond: [{ $eq: ['$isPinned', true] }, 1, 0] } } },
      { $sort: { _pinRank: -1, createTime: 1, _id: -1 } },
      { $skip: 3 },
      { $limit: 2 },
      { $project: { _id: 1, name: 1, isPinned: 1 } }
    ]);
  });
});

describe('findAppsPage', () => {
  it('preserves find/count behavior when pin ordering is disabled', async () => {
    queryResult([{ _id: 'normal' }]);
    mocks.countDocuments.mockResolvedValue(3);
    expect(await findAppsPage({ filter, fields, limit: 2 })).toEqual({
      list: [{ _id: 'normal' }],
      total: 3
    });
    expect(mocks.countDocuments).toHaveBeenCalledWith(filter);
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it('reads list and total from one facet, without a second group read after unpinning', async () => {
    const apps = [
      { _id: 'first', isPinned: true },
      { _id: 'second', isPinned: false }
    ];
    mocks.aggregate.mockImplementation(async () => {
      const list = structuredClone(apps);
      apps[0].isPinned = false;
      return [{ list, count: [{ total: apps.length }] }];
    });
    const result = await findAppsPage(options);
    expect(result).toEqual({
      list: [
        { _id: 'first', isPinned: true },
        { _id: 'second', isPinned: false }
      ],
      total: 2
    });
    expect(mocks.aggregate).toHaveBeenCalledTimes(1);
    expect(mocks.find).toHaveBeenCalledExactlyOnceWith(filter);
    expect(mocks.countDocuments).not.toHaveBeenCalled();
    const pipeline: PipelineStage[] = mocks.aggregate.mock.calls[0][0];
    expect(pipeline).toHaveLength(2);
    expect(pipeline[1]).toEqual({
      $facet: {
        list: expect.arrayContaining([
          { $limit: 2 },
          { $project: { _id: 1, name: 1, isPinned: 1 } }
        ]),
        count: [{ $count: 'total' }]
      }
    });
  });

  it('casts nested permission, team, folder and member IDs before aggregation', async () => {
    const appId = new Types.ObjectId().toHexString();
    const parentId = new Types.ObjectId().toHexString();
    const tmbId = new Types.ObjectId().toHexString();
    await findAppsPage({
      ...options,
      filter: {
        $and: [filter, { _id: { $in: [appId], $ne: parentId }, tmbId: { $in: [tmbId] } }],
        parentId
      }
    });
    expect(mocks.aggregate.mock.calls[0][0][0]).toEqual({
      $match: {
        $and: [
          { ...filter, teamId: new Types.ObjectId(filter.teamId) },
          {
            _id: { $in: [new Types.ObjectId(appId)], $ne: new Types.ObjectId(parentId) },
            tmbId: { $in: [new Types.ObjectId(tmbId)] }
          }
        ],
        parentId: new Types.ObjectId(parentId)
      }
    });
  });

  it('rejects invalid IDs before executing an aggregate', async () => {
    await expect(findAppsPage({ ...options, filter: { teamId: 'invalid' } })).rejects.toThrow(
      'Cast to ObjectId'
    );
    expect(mocks.aggregate).not.toHaveBeenCalled();
  });

  it.each([{ result: [] }, { result: [{ list: [], count: [] }] }])(
    'returns zero for an empty aggregation (%j)',
    async ({ result }) => {
      mocks.aggregate.mockResolvedValue(result);
      expect(await findAppsPage(options)).toEqual({ list: [], total: 0 });
    }
  );

  it('keeps total when the requested offset is beyond all matches', async () => {
    mocks.aggregate.mockResolvedValue([{ list: [], count: [{ total: 3 }] }]);
    expect(await findAppsPage({ ...options, offset: 5 })).toEqual({ list: [], total: 3 });
    expect(mocks.aggregate.mock.calls[0][0][1].$facet.list).toContainEqual({ $skip: 5 });
  });
});
