import { AppTypeEnum, AppTypeList, ToolTypeList } from '@fastgpt/global/core/app/constants';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { MongoApp } from './schema';

/**
 * App 目录树。普通应用与工具各自维护一棵独立的文件夹树，互不作为对方的父级。
 */
const AppFolderTreeEnum = {
  app: 'app',
  tool: 'tool'
} as const;
type AppFolderTreeType = (typeof AppFolderTreeEnum)[keyof typeof AppFolderTreeEnum];

/**
 * 返回资源所属的目录树。
 *
 * 普通应用与文件夹同属 app 树，工具与工具文件夹同属 tool 树。
 * 已废弃或未分类的类型（`httpPlugin`、`tool`、`hidden`）返回 null：它们的历史归属无法确定，
 * 不参与校验，避免一次性拦截掉仍在运行的存量数据。
 */
export const getAppFolderTree = (
  type: AppTypeEnum | string | null | undefined
): AppFolderTreeType | null => {
  if (type === AppTypeEnum.folder || AppTypeList.includes(type as AppTypeEnum))
    return AppFolderTreeEnum.app;
  if (type === AppTypeEnum.toolFolder || ToolTypeList.includes(type as AppTypeEnum))
    return AppFolderTreeEnum.tool;
  return null;
};

/** 指定目录树唯一合法的父文件夹类型：app 树只能用 `folder`，tool 树只能用 `toolFolder`。 */
const getFolderTypeOfTree = (tree: AppFolderTreeType) =>
  tree === AppFolderTreeEnum.app ? AppTypeEnum.folder : AppTypeEnum.toolFolder;

/**
 * 校验父文件夹类型与子资源类型是否属于同一棵目录树。
 *
 * 规则只有一条：子资源所属目录树的文件夹类型，必须等于父文件夹的类型。
 * 因此跨树引用（普通应用挂到工具文件夹、工具挂到普通文件夹、两种文件夹互相移动）会被统一拒绝。
 *
 * 边界约定：
 * - 未传 parentId 表示目标为根目录，根目录同时容纳两棵树，直接通过；
 * - 父级不存在时不在此处报错，交由调用方的鉴权逻辑处理，避免改变既有错误引导；
 * - 子资源类型无法归类时跳过校验，不改变存量行为。
 *
 * @throws {AppErrEnum.parentFolderTypeMismatch} 父文件夹与子资源不在同一棵目录树
 */
export const validateParentFolderType = async ({
  parentId,
  childType
}: {
  parentId: ParentIdType;
  childType: AppTypeEnum | string;
}): Promise<void> => {
  if (!parentId) return;

  const childTree = getAppFolderTree(childType);
  if (!childTree) return;

  const parentApp = await MongoApp.findById(parentId, 'type').lean();
  if (!parentApp) return;

  if (parentApp.type !== getFolderTypeOfTree(childTree)) {
    return Promise.reject(AppErrEnum.parentFolderTypeMismatch);
  }
};
