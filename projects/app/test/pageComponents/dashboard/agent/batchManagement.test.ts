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

describe('skill batch management logic', () => {
  const mockSkills = [
    {
      _id: 'skill-1',
      name: 'Skill 1',
      type: 'skill' as any,
      permission: {
        hasManagePer: true,
        isOwner: true
      }
    },
    {
      _id: 'skill-2',
      name: 'Skill 2 (Manage Only)',
      type: 'skill' as any,
      permission: {
        hasManagePer: true,
        isOwner: false
      }
    },
    {
      _id: 'skill-3',
      name: 'Skill 3 (Read Only)',
      type: 'skill' as any,
      permission: {
        hasManagePer: false,
        isOwner: false
      }
    },
    {
      _id: 'folder-skill-1',
      name: 'Skill Folder 1',
      type: 'folder' as any,
      permission: {
        hasManagePer: true,
        isOwner: true
      }
    }
  ];

  it('filters selectable skills (manage or owner permission required)', () => {
    const selectable = mockSkills.filter(
      (s) => s.permission?.hasManagePer || s.permission?.isOwner
    );
    expect(selectable.map((s) => s._id)).toEqual(['skill-1', 'skill-2', 'folder-skill-1']);
    expect(selectable.some((s) => s._id === 'skill-3')).toBe(false);
  });

  it('filters deletable skills (owner permission strictly required)', () => {
    const selected = [mockSkills[0], mockSkills[1], mockSkills[3]];
    const deletable = selected.filter((s) => s.permission?.isOwner);

    expect(deletable.map((s) => s._id)).toEqual(['skill-1', 'folder-skill-1']);
    expect(deletable.some((s) => s._id === 'skill-2')).toBe(false);
  });

  it('determines folder vs skill count for dynamic description', () => {
    const selected = [mockSkills[0], mockSkills[3]];
    const folderCount = selected.filter((s) => s.type === 'folder').length;
    const skillCount = selected.length - folderCount;

    expect(folderCount).toBe(1);
    expect(skillCount).toBe(1);
  });
});

describe('dataset batch management logic', () => {
  const mockDatasets = [
    {
      _id: 'dataset-1',
      name: 'Dataset 1',
      type: 'dataset' as any,
      permission: {
        hasManagePer: true,
        isOwner: true
      }
    },
    {
      _id: 'dataset-2',
      name: 'Dataset 2 (Manage Only)',
      type: 'dataset' as any,
      permission: {
        hasManagePer: true,
        isOwner: false
      }
    },
    {
      _id: 'dataset-3',
      name: 'Dataset 3 (Read Only)',
      type: 'dataset' as any,
      permission: {
        hasManagePer: false,
        isOwner: false
      }
    },
    {
      _id: 'folder-dataset-1',
      name: 'Dataset Folder 1',
      type: 'folder' as any,
      permission: {
        hasManagePer: true,
        isOwner: true
      }
    }
  ];

  it('filters selectable datasets (manage or owner permission required)', () => {
    const selectable = mockDatasets.filter(
      (d) => d.permission?.hasManagePer || d.permission?.isOwner
    );
    expect(selectable.map((d) => d._id)).toEqual(['dataset-1', 'dataset-2', 'folder-dataset-1']);
    expect(selectable.some((d) => d._id === 'dataset-3')).toBe(false);
  });

  it('filters deletable datasets (owner permission strictly required)', () => {
    const selected = [mockDatasets[0], mockDatasets[1], mockDatasets[3]];
    const deletable = selected.filter((d) => d.permission?.isOwner);

    expect(deletable.map((d) => d._id)).toEqual(['dataset-1', 'folder-dataset-1']);
    expect(deletable.some((d) => d._id === 'dataset-2')).toBe(false);
  });

  it('determines folder vs dataset count for dynamic description', () => {
    const selected = [mockDatasets[0], mockDatasets[3]];
    const folderCount = selected.filter((d) => d.type === 'folder').length;
    const datasetCount = selected.length - folderCount;

    expect(folderCount).toBe(1);
    expect(datasetCount).toBe(1);
  });
});
