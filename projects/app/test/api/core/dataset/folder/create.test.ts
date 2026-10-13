import folderCreateHandler from '@/pages/api/core/dataset/folder/create';
import {
  CreateDatasetFolderBodySchema,
  type CreateDatasetFolderBody
} from '@fastgpt/global/openapi/core/dataset/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import type { parseHeaderCertRet } from '@test/mocks/request';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('create dataset folder inheritPermission', () => {
  it('parses an omitted inheritPermission as true', () => {
    expect(
      CreateDatasetFolderBodySchema.parse({
        name: 'folder',
        intro: ''
      }).inheritPermission
    ).toBe(true);
  });

  /** 父级 folder + 一个 read 协作者：子级是否合并父级快照可以直接观察。 */
  const setupParentFolder = async () => {
    const users = await getFakeUsers(2);
    const [owner, collaborator] = users.members;
    const teamId = users.owner.teamId;
    const parent = await MongoDataset.create({
      name: 'parent-folder',
      type: DatasetTypeEnum.folder,
      teamId,
      tmbId: owner.tmbId
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.dataset,
      teamId,
      resourceId: parent._id,
      tmbId: collaborator.tmbId,
      permission: ReadRoleVal
    });
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

  // 接口不回传新 folder 的 id，按 name 回查。
  const createChild = async ({
    owner,
    parentId,
    inheritPermission
  }: {
    owner: parseHeaderCertRet;
    parentId: string;
    inheritPermission?: boolean;
  }) => {
    const res = await Call<CreateDatasetFolderBody, Record<string, never>, Record<string, never>>(
      folderCreateHandler,
      { auth: owner, body: { parentId, name: 'child', intro: '', inheritPermission } }
    );
    return { res, folder: await MongoDataset.findOne({ name: 'child' }).lean() };
  };

  it('merges the parent snapshot when inheritPermission is omitted', async () => {
    const { owner, collaborator, teamId, parent } = await setupParentFolder();

    const { res, folder } = await createChild({ owner, parentId: String(parent._id) });

    expect(res.code).toBe(200);
    expect(folder?.inheritPermission).toBe(true);
    await expect(datasetPermissions({ teamId, datasetId: String(folder?._id) })).resolves.toEqual(
      [
        `${String(owner.tmbId)}:${OwnerRoleVal}`,
        `${String(collaborator.tmbId)}:${ReadRoleVal}`
      ].sort()
    );
  });

  it('writes only the owner snapshot when inheritPermission is false', async () => {
    const { owner, teamId, parent } = await setupParentFolder();

    const { res, folder } = await createChild({
      owner,
      parentId: String(parent._id),
      inheritPermission: false
    });

    expect(res.code).toBe(200);
    expect(folder?.inheritPermission).toBe(false);
    await expect(datasetPermissions({ teamId, datasetId: String(folder?._id) })).resolves.toEqual([
      `${String(owner.tmbId)}:${OwnerRoleVal}`
    ]);
  });
});
