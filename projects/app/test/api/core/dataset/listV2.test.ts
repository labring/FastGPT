import handler from '@/pages/api/core/dataset/listV2';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  GetDatasetListV2Body,
  GetDatasetListV2Response
} from '@fastgpt/global/openapi/core/dataset/api';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import * as resourceLookup from '@fastgpt/service/core/app/resourceLookup';
import { getFakeUsers, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, vi } from 'vitest';

describe('POST /api/core/dataset/listV2 - datasetIds', () => {
  it.each(['pagination', 'ids'] as const)(
    'only queries reference counts when requested in %s mode',
    async (mode) => {
      const user = await getUser(`dataset-count-${getNanoid(6)}`);
      const dataset = await MongoDataset.create({
        name: 'Selectable dataset',
        teamId: user.teamId,
        tmbId: user.tmbId
      });
      const countSpy = vi.spyOn(resourceLookup, 'countTeamAppsByPublishedResourceGroups');
      try {
        const query = mode === 'ids' ? { datasetIds: [String(dataset._id)] } : { parentId: null };
        for (const withAppCount of [undefined, false]) {
          const result = await Call<
            GetDatasetListV2Body,
            Record<string, never>,
            GetDatasetListV2Response
          >(handler, {
            auth: user,
            body: { ...query, withAppCount }
          });
          expect(result.code).toBe(200);
          expect(result.data.list).toHaveLength(1);
          expect(result.data.list[0]).not.toHaveProperty('appCount');
        }
        expect(countSpy).not.toHaveBeenCalled();
        const counted = await Call<
          GetDatasetListV2Body,
          Record<string, never>,
          GetDatasetListV2Response
        >(handler, {
          auth: user,
          body: { ...query, withAppCount: true }
        });
        expect(counted.code).toBe(200);
        expect(counted.data.list[0]?.appCount).toBe(0);
        expect(countSpy).toHaveBeenCalledOnce();
      } finally {
        countSpy.mockRestore();
      }
    }
  );

  it('跨目录返回全部指定资源，并排除已删除资源', async () => {
    const user = await getUser(`dataset-ids-${getNanoid(6)}`);
    const parentId = new Types.ObjectId();
    const datasets = await MongoDataset.create(
      Array.from({ length: 51 }, (_, index) => ({
        name: `Selected ${index}`,
        type: index === 0 ? DatasetTypeEnum.folder : DatasetTypeEnum.dataset,
        teamId: user.teamId,
        tmbId: user.tmbId,
        parentId: index % 2 ? parentId : null
      }))
    );
    await MongoDatasetCollection.create({
      name: 'Selected file',
      type: DatasetCollectionTypeEnum.file,
      teamId: user.teamId,
      tmbId: user.tmbId,
      datasetId: datasets[1]._id
    });
    const [deleted] = await MongoDataset.create([
      {
        name: 'Deleted',
        teamId: user.teamId,
        tmbId: user.tmbId,
        deleteTime: new Date()
      },
      { name: 'Not requested', teamId: user.teamId, tmbId: user.tmbId }
    ]);
    const ids = datasets.map((dataset) => String(dataset._id));
    const response = await Call<unknown, Record<string, never>, GetDatasetListV2Response>(handler, {
      auth: user,
      body: {
        datasetIds: [...ids, ids[0], String(deleted._id), String(new Types.ObjectId())],
        parentId: String(new Types.ObjectId()),
        pageNum: 3,
        pageSize: 1,
        offset: 1000,
        withAppCount: true,
        withFileCount: true
      }
    });

    expect(response.code).toBe(200);
    expect(response.data.total).toBe(51);
    expect(response.data.list.map((dataset) => String(dataset._id)).sort()).toEqual(
      [...ids].sort()
    );
    expect(response.data.list.every((dataset) => dataset.permission.hasReadPer)).toBe(true);
    expect(
      response.data.list.find((dataset) => dataset.type === DatasetTypeEnum.dataset)
    ).toMatchObject({
      appCount: 0,
      sourceMember: { name: expect.any(String) }
    });
    expect(
      response.data.list.find((dataset) => String(dataset._id) === String(datasets[1]._id))
    ).toMatchObject({ fileCount: 1 });
    expect(
      response.data.list.find((dataset) => dataset.type === DatasetTypeEnum.folder)
    ).not.toHaveProperty('fileCount');
  });

  it('指定 ID 与团队及读取权限取交集，权限撤销后返回空列表', async () => {
    const { owner, members } = await getFakeUsers(1);
    const member = members[0];
    const outsider = await getUser(`dataset-ids-other-team-${getNanoid(6)}`);
    const [readable, notRequested, forbidden, foreign] = await MongoDataset.create(
      ['Readable', 'Not requested', 'Forbidden', 'Other team'].map((name, index) => ({
        name,
        teamId: index === 3 ? outsider.teamId : owner.teamId,
        tmbId: index === 3 ? outsider.tmbId : owner.tmbId
      }))
    );
    await MongoResourcePermission.create(
      [readable, notRequested, foreign].map((dataset) => ({
        resourceType: PerResourceTypeEnum.dataset,
        teamId: dataset.teamId,
        resourceId: dataset._id,
        tmbId: member.tmbId,
        permission: ReadPermissionVal
      }))
    );
    const body = {
      datasetIds: [readable, forbidden, foreign].map((dataset) => String(dataset._id))
    };
    const response = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handler, { auth: member, body });

    expect(response.code).toBe(200);
    expect(response.data.total).toBe(1);
    expect(response.data.list.map((dataset) => String(dataset._id))).toEqual([
      String(readable._id)
    ]);
    expect(response.data.list[0].permission).toMatchObject({ hasReadPer: true, isOwner: false });

    await MongoResourcePermission.deleteOne({
      resourceType: PerResourceTypeEnum.dataset,
      resourceId: readable._id,
      tmbId: member.tmbId
    });
    const revoked = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handler, { auth: member, body });
    expect(revoked.code).toBe(200);
    expect(revoked.data).toEqual({ list: [], total: 0 });
  });

  it('保留类型、搜索和创建者筛选', async () => {
    const { owner, members } = await getFakeUsers(1);
    const datasets = await MongoDataset.create(
      [
        { name: 'Match target' },
        { name: 'Match wrong type', type: DatasetTypeEnum.websiteDataset },
        { name: 'Match wrong creator', tmbId: members[0].tmbId },
        { name: 'Other name' }
      ].map((dataset) => ({
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        type: DatasetTypeEnum.dataset,
        ...dataset
      }))
    );
    const response = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handler, {
      auth: owner,
      body: {
        datasetIds: datasets.map((dataset) => String(dataset._id)),
        type: [DatasetTypeEnum.dataset],
        searchKey: 'Match',
        tmbIds: [owner.tmbId]
      }
    });
    expect(response.code).toBe(200);
    expect(response.data.total).toBe(1);
    expect(response.data.list.map((dataset) => dataset.name)).toEqual(['Match target']);
  });

  it('不传 datasetIds 时保留目录范围和普通分页', async () => {
    const user = await getUser(`dataset-ids-empty-${getNanoid(6)}`);
    const datasets = await MongoDataset.create(
      [0, 1, 2].map((index) => ({
        name: `Dataset ${index}`,
        teamId: user.teamId,
        tmbId: user.tmbId,
        parentId: index === 2 ? new Types.ObjectId() : null,
        updateTime: new Date(2026, 0, index + 1)
      }))
    );
    const response = await Call<
      GetDatasetListV2Body,
      Record<string, never>,
      GetDatasetListV2Response
    >(handler, {
      auth: user,
      body: { parentId: null, pageNum: 2, pageSize: 1 }
    });
    expect(response.code).toBe(200);
    expect(response.data.total).toBe(2);
    expect(response.data.list.map((dataset) => String(dataset._id))).toEqual([
      String(datasets[0]._id)
    ]);
  });

  it('非法 datasetIds 在 API 边界被拒绝', async () => {
    const response = await Call(handler, { body: { datasetIds: ['invalid-id'] } });
    expect(response.error).toBeInstanceOf(ApiRequestInputParseError);
  });

  it('无效 datasetIds 不会回退为分页查询', async () => {
    const response = await Call(handler, {
      body: { datasetIds: [], parentId: null, pageSize: 20 }
    });
    expect(response.error).toBeInstanceOf(ApiRequestInputParseError);
  });
});
