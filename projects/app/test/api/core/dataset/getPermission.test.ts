import * as getPermissionApi from '@/pages/api/core/dataset/getPermission';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  GetDatasetPermissionQuery,
  GetDatasetPermissionResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import { getFakeUsers, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('get dataset permission api', () => {
  it('returns dataset permission when the caller owns the dataset', async () => {
    const users = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'permission-dataset',
      type: DatasetTypeEnum.dataset,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId
    });

    const res = await Call<
      Record<string, never>,
      GetDatasetPermissionQuery,
      GetDatasetPermissionResponse
    >(getPermissionApi.default, {
      auth: users.owner,
      query: { id: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    expect(res.data).toEqual({
      datasetName: 'permission-dataset',
      permission: { hasReadPer: true, hasWritePer: true }
    });
  });

  it('returns empty permission when the caller belongs to another team', async () => {
    const users = await getFakeUsers(1);
    const outsider = await getUser('dataset-permission-outsider');
    const dataset = await MongoDataset.create({
      name: 'private-dataset',
      type: DatasetTypeEnum.dataset,
      teamId: users.owner.teamId,
      tmbId: users.owner.tmbId
    });

    const res = await Call<
      Record<string, never>,
      GetDatasetPermissionQuery,
      GetDatasetPermissionResponse
    >(getPermissionApi.default, {
      auth: outsider,
      query: { id: String(dataset._id) }
    });

    expect(res.code).toBe(200);
    expect(res.data).toEqual({
      datasetName: '',
      permission: { hasReadPer: false, hasWritePer: false }
    });
  });

  it('rejects an empty dataset id at the API boundary', async () => {
    const users = await getFakeUsers(1);

    const res = await Call<
      Record<string, never>,
      GetDatasetPermissionQuery,
      GetDatasetPermissionResponse
    >(getPermissionApi.default, {
      auth: users.owner,
      query: { id: '' }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeInstanceOf(ApiRequestInputParseError);
  });
});
