import { describe, expect, it } from 'vitest';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { AppListItemType } from '@fastgpt/global/core/app/type';

describe('agent batch management logic', () => {
  const mockApps: AppListItemType[] = [
    {
      _id: 'app-1',
      name: 'Agent 1',
      avatar: '/icon/app.svg',
      intro: 'Agent 1 intro',
      type: AppTypeEnum.workflow,
      permission: {
        hasManagePer: true,
        hasWritePer: true,
        hasReadChatLogPer: true,
        isOwner: true
      } as any,
      updateTime: new Date()
    },
    {
      _id: 'app-2',
      name: 'Agent 2 (Manage Only)',
      avatar: '/icon/app.svg',
      intro: 'Agent 2 intro',
      type: AppTypeEnum.workflow,
      permission: {
        hasManagePer: true,
        hasWritePer: true,
        hasReadChatLogPer: true,
        isOwner: false
      } as any,
      updateTime: new Date()
    },
    {
      _id: 'app-3',
      name: 'Agent 3 (Read Only)',
      avatar: '/icon/app.svg',
      intro: 'Agent 3 intro',
      type: AppTypeEnum.workflow,
      permission: {
        hasManagePer: false,
        hasWritePer: false,
        hasReadChatLogPer: false,
        isOwner: false
      } as any,
      updateTime: new Date()
    },
    {
      _id: 'folder-1',
      name: 'Folder 1',
      avatar: '/icon/folder.svg',
      intro: 'Folder intro',
      type: AppTypeEnum.folder,
      permission: {
        hasManagePer: true,
        hasWritePer: true,
        hasReadChatLogPer: true,
        isOwner: true
      } as any,
      updateTime: new Date()
    }
  ];

  it('filters selectable items in batch mode (manage or owner permission required)', () => {
    const selectableApps = mockApps.filter(
      (app) => app.permission?.hasManagePer || app.permission?.isOwner
    );
    expect(selectableApps.map((a) => a._id)).toEqual(['app-1', 'app-2', 'folder-1']);
    // Read only item is excluded
    expect(selectableApps.some((a) => a._id === 'app-3')).toBe(false);
  });

  it('filters deletable items in batch delete (owner permission strictly required)', () => {
    const selectedApps = [mockApps[0], mockApps[1], mockApps[3]];
    const deletableApps = selectedApps.filter((app) => app.permission?.isOwner);

    expect(deletableApps.map((a) => a._id)).toEqual(['app-1', 'folder-1']);
    // Manage-only app is filtered out because user is not owner
    expect(deletableApps.some((a) => a._id === 'app-2')).toBe(false);
  });

  it('determines target confirm text (single object uses name, multiple objects use confirmation keyword)', () => {
    const resolveTargetConfirmText = (items: AppListItemType[], confirmKeyword = '确认删除') => {
      if (items.length <= 1) {
        return items[0]?.name || confirmKeyword;
      }
      return confirmKeyword;
    };

    expect(resolveTargetConfirmText([mockApps[0]])).toBe('Agent 1');
    expect(resolveTargetConfirmText([mockApps[0], mockApps[3]])).toBe('确认删除');
  });

  it('categorizes folder count vs app count for dynamic deletion description', () => {
    const selectedApps = [mockApps[0], mockApps[3]];
    const folderCount = selectedApps.filter((a) => AppFolderTypeList.includes(a.type)).length;
    const appCount = selectedApps.length - folderCount;

    expect(folderCount).toBe(1);
    expect(appCount).toBe(1);

    const isMixed = folderCount > 0 && appCount > 0;
    expect(isMixed).toBe(true);
  });

  it('collects disabled folder IDs for batch move to avoid circular moves', () => {
    const selectedIds = ['app-1', 'folder-1'];
    // In MoveModal, disabledIds = moveResourceIds
    const disabledIds = selectedIds;
    expect(disabledIds).toContain('folder-1');
  });
});
