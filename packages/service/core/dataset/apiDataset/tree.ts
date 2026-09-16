import type { APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import type { getApiDatasetRequest } from './index';

export type ApiFileTreeNode = {
  /** server 节点 id，即 `listFiles` 返回的 `item.id`；与落库的 `apiFileId` 同一 id 空间 */
  serverId: string;
  /** server 端直接父级 id；本次选中的最外层节点为 null */
  serverParentId: string | null;
  type: 'file' | 'folder';
  name: string;
  /** 层号，最外层为 0。folder 分层批写依赖此字段 */
  depth: number;
  hasChild: boolean;
};

export type ApiFileTreeSeed = Pick<APIFileItemType, 'id' | 'name' | 'type' | 'hasChild'> & {
  /** 展开子级时传给 listFiles 的 parentId，缺省为 id。知识库根哨兵需覆盖为 basePath / rootNodeId */
  listId?: string;
};

type ApiDatasetRequest = Awaited<ReturnType<typeof getApiDatasetRequest>>;

/**
 * 递归拉取 server 树，返回父先子后排序的扁平节点列表。
 * folder 与 file 一并返回：创建路径需要 folder 的层级来搭骨架。
 */
export const buildApiFileTree = async ({
  request,
  seeds
}: {
  request: ApiDatasetRequest;
  seeds: ApiFileTreeSeed[];
}): Promise<ApiFileTreeNode[]> => {
  const nodes: ApiFileTreeNode[] = [];
  // server 树理应无环，visited 只用于抵御 provider 返回重复/自引用节点时死循环
  const visited = new Set<string>();

  const walk = async (
    seed: ApiFileTreeSeed,
    serverParentId: string | null,
    depth: number
  ): Promise<void> => {
    if (visited.has(seed.id)) return;
    visited.add(seed.id);

    nodes.push({
      serverId: seed.id,
      serverParentId,
      type: seed.type,
      name: seed.name,
      depth,
      hasChild: Boolean(seed.hasChild)
    });

    if (!seed.hasChild) return;

    const children: APIFileItemType[] = await request.listFiles({
      parentId: seed.listId ?? seed.id
    });
    for (const child of children) {
      await walk(child, seed.id, depth + 1);
    }
  };

  for (const seed of seeds) {
    await walk(seed, null, 0);
  }

  return nodes;
};
