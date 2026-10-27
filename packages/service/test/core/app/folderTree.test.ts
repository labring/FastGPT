import { describe, expect, it } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { MongoApp } from '../../../core/app/schema';
import { getAppFolderTree, validateParentFolderType } from '../../../core/app/folderTree';
import { getFakeUsers } from '@test/datas/users';

describe('getAppFolderTree', () => {
  it('classifies app and tool types into separate trees', () => {
    expect(getAppFolderTree(AppTypeEnum.folder)).toBe('app');
    expect(getAppFolderTree(AppTypeEnum.simple)).toBe('app');
    expect(getAppFolderTree(AppTypeEnum.chatAgent)).toBe('app');
    expect(getAppFolderTree(AppTypeEnum.workflow)).toBe('app');

    expect(getAppFolderTree(AppTypeEnum.toolFolder)).toBe('tool');
    expect(getAppFolderTree(AppTypeEnum.workflowTool)).toBe('tool');
    expect(getAppFolderTree(AppTypeEnum.mcpToolSet)).toBe('tool');
    expect(getAppFolderTree(AppTypeEnum.httpToolSet)).toBe('tool');
  });

  it('leaves deprecated and unclassified types unconstrained', () => {
    expect(getAppFolderTree(AppTypeEnum.httpPlugin)).toBeNull();
    expect(getAppFolderTree(AppTypeEnum.tool)).toBeNull();
    expect(getAppFolderTree(AppTypeEnum.hidden)).toBeNull();
  });
});

describe('validateParentFolderType', () => {
  it('accepts the root and rejects missing parents', async () => {
    const { owner } = await getFakeUsers(1);
    const folder = await MongoApp.create({
      name: 'folder',
      type: AppTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });

    await expect(
      validateParentFolderType({ parentId: null, childType: AppTypeEnum.simple })
    ).resolves.toBeUndefined();
    await expect(
      validateParentFolderType({ parentId: undefined, childType: AppTypeEnum.workflowTool })
    ).resolves.toBeUndefined();

    // 共享创建入口可能复用历史 parentId，缺失父级必须拒绝。
    await expect(
      validateParentFolderType({
        parentId: '000000000000000000000000',
        childType: AppTypeEnum.simple
      })
    ).rejects.toBe(CommonErrEnum.invalidParams);

    // 废弃类型不参与校验。
    await expect(
      validateParentFolderType({
        parentId: String(folder._id),
        childType: AppTypeEnum.httpPlugin
      })
    ).resolves.toBeUndefined();
  });

  it('enforces one folder type per tree', async () => {
    const { owner } = await getFakeUsers(1);
    const appFolder = await MongoApp.create({
      name: 'app-folder',
      type: AppTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const toolFolder = await MongoApp.create({
      name: 'tool-folder',
      type: AppTypeEnum.toolFolder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const leafApp = await MongoApp.create({
      name: 'leaf-app',
      type: AppTypeEnum.workflow,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });

    await expect(
      validateParentFolderType({ parentId: String(appFolder._id), childType: AppTypeEnum.workflow })
    ).resolves.toBeUndefined();
    await expect(
      validateParentFolderType({
        parentId: String(toolFolder._id),
        childType: AppTypeEnum.mcpToolSet
      })
    ).resolves.toBeUndefined();

    // 跨树创建
    await expect(
      validateParentFolderType({
        parentId: String(appFolder._id),
        childType: AppTypeEnum.workflowTool
      })
    ).rejects.toBe(AppErrEnum.parentFolderTypeMismatch);
    await expect(
      validateParentFolderType({ parentId: String(toolFolder._id), childType: AppTypeEnum.simple })
    ).rejects.toBe(AppErrEnum.parentFolderTypeMismatch);

    // 文件夹互相移动
    await expect(
      validateParentFolderType({ parentId: String(toolFolder._id), childType: AppTypeEnum.folder })
    ).rejects.toBe(AppErrEnum.parentFolderTypeMismatch);
    await expect(
      validateParentFolderType({
        parentId: String(appFolder._id),
        childType: AppTypeEnum.toolFolder
      })
    ).rejects.toBe(AppErrEnum.parentFolderTypeMismatch);

    // 父级不是文件夹
    await expect(
      validateParentFolderType({ parentId: String(leafApp._id), childType: AppTypeEnum.simple })
    ).rejects.toBe(AppErrEnum.parentFolderTypeMismatch);
  });
});
