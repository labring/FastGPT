import type { APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import type { getApiDatasetRequest } from './index';

export type ApiFileTreeNode = {
  /** server 节点 id，即 `listFiles` 返回的 `item.id`；与正文记录的 `apiFileId` 同一 id 空间 */
  serverId: string;
  /** server 端直接父级 id；本次选中的最外层节点为 null。落库到 `apiFileParentId` */
  serverParentId: string | null;
  /**
   * 承载本节点子级的**目录**记录 id。
   * folder 自身即目录（= serverId）；带子文档的 file（语雀等允许挂子节点）需要额外一条同名目录，
   * 因为一个 server 节点只能有一条正文记录，目录不能复用文件的 `apiFileId`。
   */
  dirId: string;
  type: 'file' | 'folder';
  name: string;
  /** 层号，最外层为 0。folder 分层批写依赖此字段 */
  depth: number;
  hasChild: boolean;
};

export type ApiFileTreeSeed = Pick<APIFileItemType, 'id' | 'name' | 'type' | 'hasChild'> & {
  /** 展开子级时传给 listFiles 的 parentId；显式 undefined 表示 provider 根，字段缺省才回退为 id */
  listId?: string;
};

/**
 * 一条待落库记录：目录（承载子级）或正文文件。
 * folder 节点只产出目录记录；file 节点产出正文记录，带子文档时再额外产出一条目录记录。
 */
export type ApiFileRecord = {
  /** 落库的 `apiFileId`；目录记录用派生目录 id，正文记录用 serverId */
  apiFileId: string;
  /** 落库的 `apiFileParentId`，始终是 server 侧的父节点 id */
  apiFileParentId: string | null;
  /** 本地父**目录**记录的 apiFileId；null 表示落在请求父级 / 知识库根 */
  parentDirId: string | null;
  type: 'file' | 'folder';
  name: string;
  depth: number;
};

type ApiDatasetRequest = Awaited<ReturnType<typeof getApiDatasetRequest>>;

/** 带子文档的 file 的派生目录 id 后缀，只用于区分同一 server 节点的目录记录与正文记录 */
const API_FILE_DIR_ID_SUFFIX = '#dir';

/** 目录记录 id：folder 自身即目录；file 需另建同名目录承载子级 */
export const toApiFileDirId = (serverId: string, type: ApiFileTreeNode['type']) =>
  type === 'folder' ? serverId : `${serverId}${API_FILE_DIR_ID_SUFFIX}`;

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
  const nodeById = new Map<string, ApiFileTreeNode>();
  // server 树理应无环，visited 只用于抵御 provider 返回重复/自引用节点时死循环
  const visited = new Set<string>();

  const walk = async (
    seed: ApiFileTreeSeed,
    serverParentId: string | null,
    depth: number
  ): Promise<void> => {
    if (visited.has(seed.id)) {
      const existing = nodeById.get(seed.id);
      const createsCycle = (() => {
        const checked = new Set<string>();
        let ancestorId = serverParentId;
        while (ancestorId) {
          if (ancestorId === seed.id || checked.has(ancestorId)) return true;
          checked.add(ancestorId);
          ancestorId = nodeById.get(ancestorId)?.serverParentId ?? null;
        }
        return false;
      })();
      // 子目录先选、祖先后选时，第二次遇到的非根路径信息更完整，应覆盖首次的根级占位。
      if (existing && serverParentId !== null && depth > existing.depth && !createsCycle) {
        const depthDiff = depth - existing.depth;
        existing.serverParentId = serverParentId;
        existing.depth = depth;

        // 已先遍历完的后代也要整体下移，最终再按 depth 恢复父先子后顺序。
        for (const node of nodes) {
          if (node === existing) continue;
          let parentId = node.serverParentId;
          while (parentId) {
            if (parentId === existing.serverId) {
              node.depth += depthDiff;
              break;
            }
            parentId = nodeById.get(parentId)?.serverParentId ?? null;
          }
        }
      }
      return;
    }
    visited.add(seed.id);

    const node: ApiFileTreeNode = {
      serverId: seed.id,
      serverParentId,
      dirId: toApiFileDirId(seed.id, seed.type),
      type: seed.type,
      name: seed.name,
      depth,
      hasChild: Boolean(seed.hasChild)
    };
    nodes.push(node);
    nodeById.set(seed.id, node);

    if (!seed.hasChild) return;

    const children: APIFileItemType[] = await request.listFiles({
      parentId: Object.prototype.hasOwnProperty.call(seed, 'listId') ? seed.listId : seed.id
    });
    for (const child of children) {
      await walk(child, seed.id, depth + 1);
    }
  };

  for (const seed of seeds) {
    await walk(seed, null, 0);
  }

  return nodes.sort((a, b) => a.depth - b.depth);
};

/**
 * 把树节点摊平成待落库记录，父先子后。
 *
 * 统一形态：**每个节点的子级都挂在一条目录记录下，节点自身正文（若有）作为文件记录写进该目录**。
 * 于是 `hasChild` 的 file 会产出两条记录（同名目录 + 正文文件），folder 只产出目录记录。
 * 目录记录的父级也必是目录记录，所以「先按层写全部目录、再写全部文件」即可满足依赖。
 */
export const buildApiFileRecords = (nodes: ApiFileTreeNode[]): ApiFileRecord[] => {
  // provider id 是不受本地控制的字符串。`a` 的派生目录是 `a#dir`，若远端恰好还存在 id 为
  // `a#dir` 的节点，两者会共用 apiFileId，后续 Map 会静默覆盖其中一个。保留现有派生格式以兼容
  // 已落库数据，但在写入前拒绝这类无法无损表达的树，避免错挂或重复创建。
  const serverIds = new Set(nodes.map((node) => node.serverId));
  const conflictingDirNode = nodes.find(
    (node) => node.type === 'file' && node.hasChild && serverIds.has(node.dirId)
  );
  if (conflictingDirNode) {
    throw new Error(
      `Api file directory id conflicts with provider id: ${conflictingDirNode.dirId}`
    );
  }

  const dirIdByServerId = new Map(nodes.map((node) => [node.serverId, node.dirId]));
  /** serverParentId 必定指向本次遍历过的节点，查不到只可能是空树种子 */
  const parentDirIdOf = (node: ApiFileTreeNode): string | null =>
    node.serverParentId === null ? null : (dirIdByServerId.get(node.serverParentId) ?? null);

  const records: ApiFileRecord[] = [];

  for (const node of nodes) {
    const parentDirId = parentDirIdOf(node);

    if (node.type === 'folder' || node.hasChild) {
      records.push({
        apiFileId: node.dirId,
        apiFileParentId: node.serverParentId,
        parentDirId,
        type: 'folder',
        name: node.name,
        depth: node.depth
      });
    }

    if (node.type === 'file') {
      records.push({
        apiFileId: node.serverId,
        apiFileParentId: node.serverParentId,
        // 带子文档时正文挂在自己的同名目录下，否则与兄弟同级
        parentDirId: node.hasChild ? node.dirId : parentDirId,
        type: 'file',
        name: node.name,
        depth: node.depth
      });
    }
  }

  return records;
};
