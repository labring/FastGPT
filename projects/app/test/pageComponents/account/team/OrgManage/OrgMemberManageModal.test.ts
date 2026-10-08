import React, { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { memberManagerMocks as mocks, setupMemberManagerTest } from '../memberManagerTestUtils';
import OrgMemberManageModal from '@/pageComponents/account/team/OrgManage/OrgMemberManageModal';
import type { OrgListItemType } from '@fastgpt/global/support/user/team/org/type';
import type { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';

const member = (tmbId: string) => ({ tmbId, memberName: tmbId, avatar: '' }) as TeamMemberItemType;

describe('OrgMemberManageModal', () => {
  const harness = setupMemberManagerTest();
  const onClose = vi.fn();
  const refetchOrgs = vi.fn();
  const render = (id = 'org') =>
    harness.render(
      React.createElement(OrgMemberManageModal, {
        currentOrg: { _id: id } as OrgListItemType,
        onClose,
        refetchOrgs
      })
    );

  it('initializes the complete list once and saves local additions and removals', async () => {
    await render();
    expect(harness.button('common:Save')).toBeUndefined();
    expect(mocks.loadMembers).toHaveBeenCalledWith(
      { orgId: 'org', withOrgs: false, withPermission: false },
      expect.any(AbortController)
    );
    await harness.resolve(0, [member('existing')]);
    await harness.click('remove');
    await harness.click('Candidate');
    await render();
    expect(mocks.loadMembers).toHaveBeenCalledOnce();
    await harness.click('common:Save');
    expect(mocks.updateOrg).toHaveBeenCalledWith({
      orgId: 'org',
      members: [{ tmbId: 'candidate' }]
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(refetchOrgs).toHaveBeenCalledOnce();
  });

  it('allows an empty organization to be saved after successful loading', async () => {
    await render();
    await harness.resolve(0, []);
    await harness.click('common:Save');
    expect(mocks.updateOrg).toHaveBeenCalledWith({ orgId: 'org', members: [] });
  });

  it('shows failure with a retry and never allows saving incomplete data', async () => {
    await render();
    await harness.reject(0);
    expect(harness.button('common:Save')).toBeUndefined();
    expect(harness.container.querySelector('[data-loading=true]')).toBeNull();
    expect(mocks.updateOrg).not.toHaveBeenCalled();
    await harness.click('common:password_verification_retry');
    await harness.resolve(1, [member('existing')]);
    await harness.click('common:Save');
    expect(mocks.updateOrg).toHaveBeenCalledWith({
      orgId: 'org',
      members: [{ tmbId: 'existing' }]
    });
  });

  it('resets the old draft on a resource change and ignores late results', async () => {
    await render();
    await render('new-org');
    expect(harness.pending[0].controller.signal.aborted).toBe(true);
    await harness.resolve(0, [member('old')]);
    expect(harness.button('common:Save')).toBeUndefined();
    await harness.resolve(1, [member('new')]);
    await harness.click('common:Save');
    expect(mocks.updateOrg).toHaveBeenCalledWith({ orgId: 'new-org', members: [{ tmbId: 'new' }] });
  });

  it('aborts loading when the modal closes', async () => {
    await render();
    await harness.click('close-modal');
    expect(onClose).toHaveBeenCalledOnce();
    await harness.render(null);
    expect(harness.pending[0].controller.signal.aborted).toBe(true);
    await act(async () => harness.pending[0].reject(new Error('closed')));
    expect(mocks.updateOrg).not.toHaveBeenCalled();
  });
});
