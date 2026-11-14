import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

import { getModelTestDefaults, setModelTestSnapshot } from '@test/modelCache';
import createHandler from '@/pages/api/core/dataset/create';
import folderCreateHandler from '@/pages/api/core/dataset/folder/create';
import {
  CreateDatasetBodySchema,
  type CreateDatasetBody,
  type CreateDatasetResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { publishSystemInstanceConfigSnapshot } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { getFakeUsers, getRootUser, getUser } from '@test/datas/users';
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

describe('generic dataset creation quota', () => {
  it('applies a newly published folder limit to both creation routes', async () => {
    const owner = await getRootUser();
    const originalSnapshot = getTestInstanceConfig();
    const publishLimit = (datasetFolderMaxAmount: number) => {
      publishSystemInstanceConfigSnapshot({
        snapshot: {
          ...originalSnapshot,
          resource: { ...originalSnapshot.resource, datasetFolderMaxAmount }
        }
      });
    };
    const createGenericFolder = (name: string) =>
      Call(createHandler, {
        auth: owner,
        body: { name, intro: '', type: DatasetTypeEnum.folder }
      });
    const createDedicatedFolder = (name: string) =>
      Call(folderCreateHandler, { auth: owner, body: { name, intro: '' } });

    try {
      publishLimit(0);
      expect((await createGenericFolder('generic-denied')).error).toBe(
        TeamErrEnum.datasetFolderAmountNotEnough
      );
      expect((await createDedicatedFolder('dedicated-denied')).error).toBe(
        TeamErrEnum.datasetFolderAmountNotEnough
      );
      expect(await MongoDataset.countDocuments({ teamId: owner.teamId })).toBe(0);

      publishLimit(1);
      const allowed = await createGenericFolder('generic-allowed');
      expect(allowed.code).toBe(200);
      expect((await MongoDataset.findById(allowed.data).lean())?.type).toBe(DatasetTypeEnum.folder);
      expect((await createDedicatedFolder('dedicated-overflow')).error).toBe(
        TeamErrEnum.datasetFolderAmountNotEnough
      );
      expect((await createGenericFolder('generic-overflow')).error).toBe(
        TeamErrEnum.datasetFolderAmountNotEnough
      );
      expect(
        await MongoDataset.countDocuments({ teamId: owner.teamId, type: DatasetTypeEnum.folder })
      ).toBe(1);
    } finally {
      publishSystemInstanceConfigSnapshot({ snapshot: originalSnapshot });
    }
  });

  it('enforces the dataset license quota for datasets while allowing folders on both routes', async () => {
    const owner = await getRootUser();
    await MongoDataset.create({
      name: 'existing-dataset',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      type: DatasetTypeEnum.dataset
    });
    const originalLicense = global.licenseData;

    try {
      global.licenseData = { maxDatasets: 1 } as typeof global.licenseData;
      const dataset = await Call(createHandler, {
        auth: owner,
        body: { name: 'denied-dataset', intro: '', type: DatasetTypeEnum.dataset }
      });
      const genericFolder = await Call(createHandler, {
        auth: owner,
        body: { name: 'generic-folder', intro: '', type: DatasetTypeEnum.folder }
      });
      const dedicatedFolder = await Call(folderCreateHandler, {
        auth: owner,
        body: { name: 'dedicated-folder', intro: '' }
      });

      expect(dataset.error).toBe(SystemErrEnum.licenseDatasetAmountLimit);
      expect(genericFolder.code).toBe(200);
      expect(dedicatedFolder.code).toBe(200);
      expect(
        await MongoDataset.countDocuments({ teamId: owner.teamId, type: DatasetTypeEnum.folder })
      ).toBe(2);
    } finally {
      global.licenseData = originalLicense;
    }
  });
});

describe('create dataset inheritPermission', () => {
  it('parses an omitted inheritPermission as true', () => {
    expect(
      CreateDatasetBodySchema.parse({
        name: 'folder',
        intro: '',
        type: DatasetTypeEnum.folder
      }).inheritPermission
    ).toBe(true);
  });

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

  it('inherits the parent snapshot when inheritPermission is omitted', async () => {
    const { owner, collaborator, teamId, parent } = await setupParentFolder();

    const { res, dataset } = await createChild({
      owner,
      parentId: String(parent._id),
      type: DatasetTypeEnum.folder
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

  // 普通知识库与 folder 一致：非 folder 类型同样写入并生效。
  it('writes only the owner snapshot for an independent dataset', async () => {
    const { owner, teamId, parent } = await setupParentFolder();

    const { res, dataset } = await createChild({
      owner,
      parentId: String(parent._id),
      type: DatasetTypeEnum.dataset,
      inheritPermission: false
    });

    expect(res.code).toBe(200);
    expect(dataset?.inheritPermission).toBe(false);
    await expect(datasetPermissions({ teamId, datasetId: String(dataset?._id) })).resolves.toEqual([
      `${String(owner.tmbId)}:${OwnerRoleVal}`
    ]);
  });

  it('inherits the parent snapshot for a dataset when inheritPermission is omitted', async () => {
    const { owner, collaborator, teamId, parent } = await setupParentFolder();

    const { res, dataset } = await createChild({
      owner,
      parentId: String(parent._id),
      type: DatasetTypeEnum.dataset
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

describe('generic dataset creation parent checks', () => {
  it('rejects a foreign-team ancestor behind an authorized parent folder', async () => {
    const { owner } = await getFakeUsers(1);
    const foreign = await getUser('foreign-team-owner');
    const ancestor = await MongoDataset.create({
      name: 'foreign-ancestor',
      type: DatasetTypeEnum.folder,
      teamId: foreign.teamId,
      tmbId: foreign.tmbId
    });
    const parent = await MongoDataset.create({
      name: 'local-parent',
      type: DatasetTypeEnum.folder,
      parentId: ancestor._id,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const result = await Call(createHandler, {
      auth: owner,
      body: {
        name: 'invalid-child',
        intro: '',
        type: DatasetTypeEnum.dataset,
        parentId: String(parent._id)
      }
    });
    expect(result.error).toBe(CommonErrEnum.invalidParams);
    expect(await MongoDataset.countDocuments({ name: 'invalid-child' })).toBe(0);
  });

  it('enforces folder depth at the boundary and permits a dataset in the deepest folder', async () => {
    const { owner } = await getFakeUsers(1);
    const ids: string[] = [];
    for (let i = 0; i < getTestInstanceConfig().resource.maxFolderDepth - 1; i++) {
      const folder = await MongoDataset.create({
        name: `level-${i}`,
        type: DatasetTypeEnum.folder,
        parentId: ids.at(-1) ?? null,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      });
      ids.push(String(folder._id));
    }
    const last = await Call(createHandler, {
      auth: owner,
      body: { name: 'last', intro: '', type: DatasetTypeEnum.folder, parentId: ids.at(-1) }
    });
    expect(last.code).toBe(200);
    expect((await MongoDataset.findById(last.data).lean())?.ancestorIds.map(String)).toEqual(ids);
    const overflow = await Call(createHandler, {
      auth: owner,
      body: { name: 'overflow', intro: '', type: DatasetTypeEnum.folder, parentId: last.data }
    });
    expect(overflow.error).toBe(CommonErrEnum.folderDepthLimit);
    expect(await MongoDataset.countDocuments({ name: 'overflow' })).toBe(0);
    const leaf = await Call(createHandler, {
      auth: owner,
      body: { name: 'leaf', intro: '', type: DatasetTypeEnum.dataset, parentId: last.data }
    });
    expect(leaf.code).toBe(200);
    const historical = await MongoDataset.create({
      name: 'historical-deep-folder',
      type: DatasetTypeEnum.folder,
      parentId: last.data,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const deepLeaf = await Call(createHandler, {
      auth: owner,
      body: {
        name: 'invalid-deep-leaf',
        intro: '',
        type: DatasetTypeEnum.dataset,
        parentId: String(historical._id)
      }
    });
    expect(deepLeaf.error).toBe(CommonErrEnum.folderDepthLimit);
    expect(await MongoDataset.countDocuments({ name: 'invalid-deep-leaf' })).toBe(0);
  });

  it.each([DatasetTypeEnum.folder, DatasetTypeEnum.dataset])(
    'rejects a dataset as the parent of %s',
    async (type) => {
      const { owner } = await getFakeUsers(1);
      const parent = await MongoDataset.create({
        name: 'leaf-parent',
        type: DatasetTypeEnum.dataset,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      });
      const res = await Call(createHandler, {
        auth: owner,
        body: { name: 'invalid', intro: '', type, parentId: String(parent._id) }
      });
      expect(res.error).toBe(CommonErrEnum.invalidParams);
      expect(await MongoDataset.countDocuments({ parentId: parent._id })).toBe(0);
    }
  );
});
