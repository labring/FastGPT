import React, { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { memberManagerMocks as mocks, setupMemberManagerTest } from '../memberManagerTestUtils';
import GroupEditModal from '@/pageComponents/account/team/GroupManage/GroupManageMember';
import type { MemberGroupListItemType } from '@fastgpt/global/support/permission/memberGroup/type';
import type { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

const member = (
  tmbId: string,
  groupRole: 'owner' | 'admin' | 'member'
): TeamMemberItemType<{ withGroupRole: true; withPermission: true; withOrgs: true }> => ({
  tmbId,
  groupRole,
  memberName: tmbId,
  avatar: '',
  userId: 'user',
  teamId: 'team',
  isSetMemberName: true,
  role: 'owner',
  status: 'active',
  createTime: new Date(0),
  permission: new TeamPermission()
});

describe('GroupEditModal', () => {
  const harness = setupMemberManagerTest();
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const render = (id = 'group') =>
    harness.render(
      React.createElement(GroupEditModal, {
        group: { _id: id } as MemberGroupListItemType<true>,
        onClose,
        onSuccess
      })
    );

  it('blocks editing before loading and lets role changes toggle against the draft', async () => {
    await render();
    expect(harness.button('common:Save')).toBeUndefined();
    expect(mocks.loadMembers).toHaveBeenCalledWith(
      { groupId: 'group' },
      expect.any(AbortController)
    );
    await harness.resolve(0, [member('owner', 'owner')]);
    await harness.click('Candidate');

    const candidateRow = () => {
      const name = Array.from(harness.container.querySelectorAll('div')).find(
        (node) => node.children.length === 0 && node.textContent === 'Candidate'
      )!;
      return name.parentElement!.parentElement!;
    };
    await act(async () =>
      candidateRow().dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }))
    );
    const promote = candidateRow().querySelector('span')!;
    expect(promote.textContent).toBe('user:team.group.set_as_admin');
    await act(async () => promote.click());
    expect(candidateRow().querySelector('span')!.textContent).toContain(
      'user:team.group.role.admin'
    );
    await act(async () => candidateRow().querySelector<HTMLButtonElement>('span button')!.click());
    await render();
    expect(mocks.loadMembers).toHaveBeenCalledOnce();
    await harness.click('common:Save');
    expect(mocks.updateGroup).toHaveBeenCalledWith({
      groupId: 'group',
      memberList: [
        { name: 'owner', tmbId: 'owner', avatar: '', role: 'owner' },
        { name: 'Candidate', tmbId: 'candidate', avatar: '', role: 'member' }
      ]
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('allows adding members to an empty group', async () => {
    await render();
    await harness.resolve(0, []);
    await harness.click('Candidate');
    await harness.click('common:Save');
    expect(mocks.updateGroup).toHaveBeenCalledWith({
      groupId: 'group',
      memberList: [{ name: 'Candidate', tmbId: 'candidate', avatar: '', role: 'member' }]
    });
  });

  it('keeps saving unavailable on failure and allows a successful retry', async () => {
    await render();
    await harness.reject(0);
    expect(harness.button('common:Save')).toBeUndefined();
    expect(harness.container.querySelector('[data-loading=true]')).toBeNull();
    await harness.click('common:password_verification_retry');
    await harness.resolve(1, [member('owner', 'owner')]);
    await harness.click('common:Save');
    expect(mocks.updateGroup).toHaveBeenCalledOnce();
  });

  it('does not reuse the previous group members after a resource switch', async () => {
    await render();
    await harness.resolve(0, [member('old-owner', 'owner')]);
    await render('new-group');
    expect(harness.button('common:Save')).toBeUndefined();
    expect(harness.container.textContent).not.toContain('old-owner');
    await harness.resolve(1, [member('new-owner', 'owner')]);
    await harness.click('common:Save');
    expect(mocks.updateGroup).toHaveBeenCalledWith({
      groupId: 'new-group',
      memberList: [{ name: 'new-owner', tmbId: 'new-owner', avatar: '', role: 'owner' }]
    });
  });

  it('does not remove the group owner from the draft', async () => {
    await render();
    await harness.resolve(0, [member('owner', 'owner')]);
    await harness.click('remove');
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'user:team.group.toast.can_not_delete_owner',
      status: 'error'
    });
    await harness.click('common:Save');
    expect(mocks.updateGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        memberList: [expect.objectContaining({ tmbId: 'owner', role: 'owner' })]
      })
    );
  });
});
