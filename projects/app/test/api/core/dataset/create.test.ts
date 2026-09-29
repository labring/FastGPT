import { getModelTestDefaults, setModelTestSnapshot } from '@test/modelCache';
import createHandler from '@/pages/api/core/dataset/create';
import type {
  CreateDatasetBody,
  CreateDatasetResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import type { parseHeaderCertRet } from '@test/mocks/request';
import { Call } from '@test/utils/request';
import { describe, it, expect } from 'vitest';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';

describe('create dataset', () => {
  it.each([undefined, null, '', '   '])(
    'only inherits the default VLM when its reference is omitted (%s)',
    async (vlmModelId) => {
      const users = await getFakeUsers(1);
      const owner = users.members[0];
      await MongoResourcePermission.create({
        resourceType: 'team',
        teamId: owner.teamId,
        resourceId: null,
        tmbId: owner.tmbId,
        permission: TeamDatasetCreatePermissionVal
      });
      const previousDefaults = getModelTestDefaults();
      setModelTestSnapshot({
        defaultModels: {
          ...previousDefaults,
          datasetImageLLM: {
            ...previousDefaults.llm!,
            config: { ...previousDefaults.llm!.config, vision: true }
          }
        }
      });
      try {
        const res = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
          createHandler,
          {
            auth: owner,
            body: {
              name: 'optional-vision',
              intro: '',
              avatar: '',
              type: DatasetTypeEnum.dataset,
              vlmModelId
            }
          }
        );
        expect(res.code).toBe(200);
        const dataset = await MongoDataset.findById(res.data).lean();
        expect(dataset?.vlmModelId).toBe(
          vlmModelId === undefined ? previousDefaults.llm!.modelId : undefined
        );
      } finally {
        setModelTestSnapshot({ defaultModels: previousDefaults });
      }
    }
  );

  it('does not restore a legacy VLM name when the canonical selection is explicitly unset', async () => {
    const users = await getFakeUsers(1);
    const owner = users.members[0];
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: owner.teamId,
      resourceId: null,
      tmbId: owner.tmbId,
      permission: TeamDatasetCreatePermissionVal
    });
    const res = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: owner,
        body: {
          name: 'unset-vision',
          intro: '',
          avatar: '',
          type: DatasetTypeEnum.dataset,
          vlmModelId: '',
          vlmModel: 'deleted-legacy'
        }
      }
    );
    expect(res.code).toBe(200);
    expect(await MongoDataset.findById(res.data).lean()).not.toHaveProperty('vlmModelId');
  });
  it('should return 200 when create dataset success', async () => {
    const users = await getFakeUsers(2);
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId: users.members[0].teamId,
      resourceId: null,
      tmbId: users.members[0].tmbId,
      permission: TeamDatasetCreatePermissionVal
    });
    const res = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: users.members[0],
        body: {
          name: 'folder',
          intro: 'intro',
          avatar: 'avatar',
          type: DatasetTypeEnum.folder
        }
      }
    );
    expect(res.error).toBeUndefined();
    expect(res.code).toBe(200);
    const folderId = res.data as string;

    const res2 = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: users.members[0],
        body: {
          name: 'test',
          intro: 'intro',
          avatar: 'avatar',
          type: DatasetTypeEnum.dataset,
          parentId: folderId
        }
      }
    );

    expect(res2.error).toBeUndefined();
    expect(res2.code).toBe(200);
  });
});

describe('create dataset inheritPermission', () => {
  /** 父级 folder + 一个 read 协作者：子级是否合并父级快照可以直接观察。 */
  const setupParentFolder = async () => {
    const users = await getFakeUsers(2);
    const [owner, collaborator] = users.members;
    const teamId = users.owner.teamId;
    await MongoResourcePermission.create({
      resourceType: 'team',
      teamId,
      resourceId: null,
      tmbId: owner.tmbId,
      permission: TeamDatasetCreatePermissionVal
    });
    const parent = await MongoDataset.create({
      name: 'parent-folder',
      type: DatasetTypeEnum.folder,
      teamId,
      tmbId: owner.tmbId
    });
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId,
        resourceId: parent._id,
        tmbId: owner.tmbId,
        permission: OwnerRoleVal
      },
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId,
        resourceId: parent._id,
        tmbId: collaborator.tmbId,
        permission: ReadRoleVal
      }
    ]);
    return { owner, collaborator, teamId, parent };
  };

  /** dataset ACL 快照的可比较形式（协作者 + 权限位）。 */
  const datasetPermissions = async ({
    teamId,
    datasetId
  }: {
    teamId: string;
    datasetId: string;
  }) => {
    const rows = await MongoResourcePermission.find(
      { resourceType: PerResourceTypeEnum.dataset, teamId, resourceId: datasetId },
      'tmbId permission'
    ).lean();
    return rows.map((row) => `${String(row.tmbId)}:${row.permission}`).sort();
  };

  const createChild = async ({
    owner,
    parentId,
    type,
    inheritPermission
  }: {
    owner: parseHeaderCertRet;
    parentId: string;
    type: DatasetTypeEnum;
    inheritPermission?: boolean;
  }) => {
    const res = await Call<CreateDatasetBody, Record<string, never>, CreateDatasetResponse>(
      createHandler,
      {
        auth: owner,
        body: { name: 'child', intro: '', avatar: '', type, parentId, inheritPermission }
      }
    );
    return { res, dataset: await MongoDataset.findById(res.data).lean() };
  };

  it('writes only the owner snapshot for an independent folder', async () => {
    const { owner, teamId, parent } = await setupParentFolder();

    const { res, dataset } = await createChild({
      owner,
      parentId: String(parent._id),
      type: DatasetTypeEnum.folder,
      inheritPermission: false
    });

    expect(res.code).toBe(200);
    expect(dataset?.inheritPermission).toBe(false);
    await expect(datasetPermissions({ teamId, datasetId: String(dataset?._id) })).resolves.toEqual([
      `${String(owner.tmbId)}:${OwnerRoleVal}`
    ]);
  });

  // type=folder 之外的类型忽略该参数：只有 folder 声明了该字段。
  it('ignores the flag for a non-folder type', async () => {
    const { owner, collaborator, teamId, parent } = await setupParentFolder();

    const { res, dataset } = await createChild({
      owner,
      parentId: String(parent._id),
      type: DatasetTypeEnum.dataset,
      inheritPermission: false
    });

    expect(res.code).toBe(200);
    expect(dataset?.inheritPermission).toBe(true);
    await expect(datasetPermissions({ teamId, datasetId: String(dataset?._id) })).resolves.toEqual(
      [
        `${String(owner.tmbId)}:${OwnerRoleVal}`,
        `${String(collaborator.tmbId)}:${ReadRoleVal}`
      ].sort()
    );
  });
});
