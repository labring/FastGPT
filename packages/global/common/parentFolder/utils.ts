import { type ParentIdType } from './type';

export const parseParentIdInMongo = (parentId: ParentIdType) => {
  if (parentId === undefined) return {};

  if (parentId === null || parentId === '')
    return {
      parentId: null
    };

  const pattern = /^[0-9a-fA-F]{24}$/;
  if (pattern.test(parentId))
    return {
      parentId
    };
  return {};
};

/**
 * 获取当前文件夹及其所有子孙文件夹的 ID 列表
 * @param findChildren 根据 parentIds 查询子文档的函数
 * @param parentId 当前文件夹 ID
 * @returns 包含 parentId 及其所有子孙文件夹 ID 的数组
 */
export const getAllDescendantIds = async (
  findChildren: (parentIds: string[]) => Promise<{ _id: any }[]>,
  parentId: string
): Promise<string[]> => {
  const visited = new Set<string>([parentId]);
  const allIds = [parentId];
  let queue = [parentId];

  while (queue.length > 0) {
    const children = await findChildren(queue);
    queue = [];
    for (const c of children) {
      const id = String(c._id);
      if (!visited.has(id)) {
        visited.add(id);
        queue.push(id);
        allIds.push(id);
      }
    }
  }

  return allIds;
};
