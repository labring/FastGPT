import { describe, expect, it } from 'vitest';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  ReadPermissionVal,
  ReadRoleVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { assertDatasetPermission } from '@fastgpt/service/support/permission/dataset/utils';

const props = {
  dataset: { _id: 'dataset', teamId: 'team', tmbId: 'creator' } as DatasetSchemaType,
  teamId: 'team',
  tmbId: 'member',
  isTeamOwner: false,
  isRoot: false,
  role: ReadRoleVal,
  per: ReadPermissionVal
};

describe('assertDatasetPermission', () => {
  it('普通成员按有效 role 检查读写', () => {
    expect(assertDatasetPermission(props).permission.hasReadPer).toBe(true);
    expect(() => assertDatasetPermission({ ...props, per: WritePermissionVal })).toThrow(
      DatasetErrEnum.unAuthDataset
    );
  });
  it('跨团队 owner 不能授权，root 可旁路', () => {
    expect(() =>
      assertDatasetPermission({ ...props, teamId: 'foreign', isTeamOwner: true })
    ).toThrow(DatasetErrEnum.unAuthDataset);
    expect(
      assertDatasetPermission({
        ...props,
        teamId: 'foreign',
        isRoot: true,
        role: 0,
        per: WritePermissionVal
      }).permission.isOwner
    ).toBe(true);
  });
  it.each([{ isTeamOwner: true }, { tmbId: 'creator' }])(
    '知识库或团队 owner 由资源事实确定：%j',
    (owner) => {
      expect(
        assertDatasetPermission({ ...props, ...owner, role: 0, per: WritePermissionVal }).permission
          .isOwner
      ).toBe(true);
    }
  );
});
