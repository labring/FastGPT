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
  /** 目录记录落库时的 syncChildren 标记；自动补建的祖先目录为 false，正常节点为 true */
  syncChildren?: boolean;
  /** 为镜像远端目录树自动补建的祖先占位节点：即使远端是带子文档的 file，也只建派生目录而不导入其正文 */
  isAutoAncestor?: boolean;
  /** 即使远端已无子文档，也保留该文档的派生目录（用于维持 docA#dir.syncChildren=false 的暂停状态） */
  preserveDir?: boolean;
};

export type ApiFileTreeSeed = Pick<APIFileItemType, 'id' | 'name' | 'type' | 'hasChild'> & {
  /** 展开子级时传给 listFiles 的 parentId；显式 undefined 表示 provider 根，字段缺省才回退为 id */
  listId?: string;
  /** 已知的远端父级 ID（由服务端自顶向下校验后填入）；缺省为 null */
  serverParentId?: string | null;
  /** 目录同步范围标记，默认 true；自动补建的祖先传 false */
  syncChildren?: boolean;
  /** 是否递归展开该节点的子级；自动补建祖先传 false，默认 true */
  expandChildren?: boolean;
  /** 标记该种子是否为自动补建祖先占位节点 */
  isAutoAncestor?: boolean;
};

/**
 * 一条待落库记录：目录（承载子级）或正文文件。
 * folder 节点只产出目录记录；file 节点产出正文记录，带子文档时再额外产出一条目录记录。
 */
export type ApiFileRecord = {
  /** 真实远端节点 ID，派生目录不得使用自身 apiFileId 查询 provider。 */
  sourceId: string;
  /** 落库的 `apiFileId`；目录记录用派生目录 id，正文记录用 serverId */
  apiFileId: string;
  /** 落库的 `apiFileParentId`，始终是 server 侧的父节点 id */
  apiFileParentId: string | null;
  /** 本地父**目录**记录的 apiFileId；null 表示落在请求父级 / 知识库根 */
  parentDirId: string | null;
  type: 'file' | 'folder';
  name: string;
  depth: number;
  /** 目录级同步范围标记；自动补建祖先为 false，显式或自动展开目录为 true */
  syncChildren?: boolean;
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
 * 支持通过 `filterChildren` 按同步范围（如 `syncChildren === false`）裁剪无需展开的新增子节点，
 * 同时继续递归已导入子树。
 */
export const buildApiFileTree = async ({
  request,
  seeds,
  filterChildren,
  verifyFolderChildren = false
}: {
  request: ApiDatasetRequest;
  seeds: ApiFileTreeSeed[];
  /** 可选：对某父节点 listFiles 返回的直属子节点进行过滤（如 syncChildren=false 仅保留本地已存在子项）。 */
  filterChildren?: (parent: ApiFileTreeNode, children: APIFileItemType[]) => APIFileItemType[];
  /**
   * 可选：对 type=folder 且 hasChild=false 的节点仍调用 listFiles 核实子项。
   * 用于兜底详情或列表把有子项的目录误标为 hasChild=false 的第三方服务，避免漏同步或误删子项。
   */
  verifyFolderChildren?: boolean;
}): Promise<ApiFileTreeNode[]> => {
  const nodes: ApiFileTreeNode[] = [];
  const nodeById = new Map<string, ApiFileTreeNode>();
  // server 树理应无环，visited 只用于抵御 provider 返回重复/自引用节点时死循环；
  // expanded 记录已经完整展开过子级的节点，允许先作为自动祖先占位、后被显式节点升级展开。
  const visited = new Set<string>();
  const expanded = new Set<string>();

  const shiftDescendantsDepth = (ancestor: ApiFileTreeNode, depthDiff: number) => {
    for (const node of nodes) {
      if (node === ancestor) continue;
      let parentId = node.serverParentId;
      while (parentId) {
        if (parentId === ancestor.serverId) {
          node.depth += depthDiff;
          break;
        }
        parentId = nodeById.get(parentId)?.serverParentId ?? null;
      }
    }
  };

  const walk = async (
    seed: ApiFileTreeSeed,
    serverParentId: string | null,
    depth: number
  ): Promise<void> => {
    const wantExpand = seed.expandChildren !== false;
    const shouldExpand =
      wantExpand && (Boolean(seed.hasChild) || (verifyFolderChildren && seed.type === 'folder'));
    const isAutoAncestor = Boolean(seed.isAutoAncestor);

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
        shiftDescendantsDepth(existing, depthDiff);
      }
      // 自动补建祖先占位如果随后被显式节点或上游同步目录命中，需要升级为正式节点并补展开子级。
      if (existing && !isAutoAncestor && existing.isAutoAncestor) {
        existing.isAutoAncestor = false;
        existing.syncChildren = seed.syncChildren ?? true;
      }
      if (existing && shouldExpand && !expanded.has(seed.id)) {
        expanded.add(seed.id);
        const rawChildren: APIFileItemType[] = await request.listFiles({
          parentId: Object.prototype.hasOwnProperty.call(seed, 'listId') ? seed.listId : seed.id
        });
        if (rawChildren.length > 0) {
          existing.hasChild = true;
        }
        const children = filterChildren ? filterChildren(existing, rawChildren) : rawChildren;
        for (const child of children) {
          await walk(child, seed.id, existing.depth + 1);
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
      hasChild: Boolean(seed.hasChild),
      ...(seed.syncChildren !== undefined ? { syncChildren: seed.syncChildren } : {}),
      ...(isAutoAncestor ? { isAutoAncestor: true } : {})
    };
    nodes.push(node);
    nodeById.set(seed.id, node);

    if (!shouldExpand) return;

    expanded.add(seed.id);
    const rawChildren: APIFileItemType[] = await request.listFiles({
      parentId: Object.prototype.hasOwnProperty.call(seed, 'listId') ? seed.listId : seed.id
    });
    if (rawChildren.length > 0) {
      node.hasChild = true;
    }
    const children = filterChildren ? filterChildren(node, rawChildren) : rawChildren;
    for (const child of children) {
      await walk(child, seed.id, node.depth + 1);
    }
  };

  for (const seed of seeds) {
    const seedParentId = seed.serverParentId ?? null;
    const parentNode = seedParentId ? nodeById.get(seedParentId) : undefined;
    const seedDepth = parentNode ? parentNode.depth + 1 : 0;
    await walk(seed, seedParentId, seedDepth);
  }

  return nodes.sort((a, b) => a.depth - b.depth);
};

/**
 * 把树节点摊平成待落库记录，父先子后。
 *
 * 统一形态：**每个节点的子级都挂在一条目录记录下，节点自身正文（若有）作为文件记录写进该目录**。
 * 于是 `hasChild` 的 file 会产出两条记录（同名目录 + 正文文件），folder 只产出目录记录。
 * 若节点是仅用于镜像目录树的自动补建祖先（`isAutoAncestor: true`），即使远端是带子文档的 file，
 * 也只产出 `syncChildren: false` 的目录记录，不额外导入其正文文件。
 */
export const buildApiFileRecords = (nodes: ApiFileTreeNode[]): ApiFileRecord[] => {
  // provider id 是不受本地控制的字符串。`a` 的派生目录是 `a#dir`，若远端恰好还存在 id 为
  // `a#dir` 的节点，两者会共用 apiFileId，后续 Map 会静默覆盖其中一个。保留现有派生格式以兼容
  // 已落库数据，但在写入前拒绝这类无法无损表达的树，避免错挂或重复创建。
  const serverIds = new Set(nodes.map((node) => node.serverId));
  const conflictingDirNode = nodes.find(
    (node) =>
      node.type === 'file' &&
      (node.hasChild || node.isAutoAncestor || node.preserveDir) &&
      serverIds.has(node.dirId)
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

    if (node.type === 'folder' || node.hasChild || node.isAutoAncestor || node.preserveDir) {
      records.push({
        sourceId: node.serverId,
        apiFileId: node.dirId,
        apiFileParentId: node.serverParentId,
        parentDirId,
        type: 'folder',
        name: node.name,
        depth: node.depth,
        ...(node.syncChildren !== undefined ? { syncChildren: node.syncChildren } : {})
      });
    }

    if (node.type === 'file' && !node.isAutoAncestor) {
      records.push({
        sourceId: node.serverId,
        apiFileId: node.serverId,
        apiFileParentId: node.serverParentId,
        // 带子文档（或保留派生目录以维持暂停状态）时正文挂在自己的同名目录下，否则与兄弟同级
        parentDirId: node.hasChild || node.preserveDir ? node.dirId : parentDirId,
        type: 'file',
        name: node.name,
        depth: node.depth
      });
    }
  }

  return records;
};
