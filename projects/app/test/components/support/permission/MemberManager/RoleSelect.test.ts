import { describe, expect, it } from 'vitest';
import { AppReadChatLogRoleVal } from '@fastgpt/global/support/permission/app/constant';
import {
  ManageRoleVal,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { replaceSingleRole } from '@/components/support/permission/MemberManager/RoleSelect';

describe('replaceSingleRole', () => {
  it('preserves application-specific roles when changing the base role', () => {
    expect(
      replaceSingleRole({
        role: ReadRoleVal | AppReadChatLogRoleVal,
        selectedSingleRole: ReadRoleVal,
        newSingleRole: WriteRoleVal
      })
    ).toBe(WriteRoleVal | AppReadChatLogRoleVal);

    expect(
      replaceSingleRole({
        role: WriteRoleVal | AppReadChatLogRoleVal,
        selectedSingleRole: WriteRoleVal,
        newSingleRole: ManageRoleVal
      })
    ).toBe(ManageRoleVal | AppReadChatLogRoleVal);
  });

  it('replaces the base role when no additional role is present', () => {
    expect(
      replaceSingleRole({
        role: ReadRoleVal,
        selectedSingleRole: ReadRoleVal,
        newSingleRole: WriteRoleVal
      })
    ).toBe(WriteRoleVal);
  });
});
