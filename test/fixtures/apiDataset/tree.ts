export type RemoteNode = {
  readonly key: string;
  readonly parent: string | null;
  type: 'folder' | 'file' | 'ignored';
  name: string;
  content: string;
};

/** 创建与平台 ID、HTTP 协议无关的远端节点；正文和名称可由测试修改。 */
export const createRemoteNode = (
  key: string,
  {
    parent,
    type = 'file',
    name = key,
    content = `Original body for ${key}.`
  }: Omit<RemoteNode, 'key' | 'name' | 'content' | 'type'> &
    Partial<Pick<RemoteNode, 'name' | 'content' | 'type'>>
): RemoteNode => ({ key, parent, type, name, content });

/**
 * 为远端快照建立节点和直接子级索引，供纯树测试和 Provider 协议模拟复用。
 * 拓扑变更后重新创建快照；复制数组避免追加节点绕过索引，名称/正文修改仍使用同一节点引用。
 * 此处不调用生产树转换或 diff，避免测试数据与断言共享业务算法。
 */
export const createRemoteTree = (input: readonly RemoteNode[]) => {
  const nodes = [...input];
  const byKey = new Map<string, RemoteNode>();
  const children = new Map<string | null, RemoteNode[]>();
  for (const node of nodes) {
    if (byKey.has(node.key)) throw new Error(`Duplicate remote node: ${node.key}`);
    byKey.set(node.key, node);
    const siblings = children.get(node.parent) ?? [];
    siblings.push(node);
    children.set(node.parent, siblings);
  }
  return { nodes: nodes as readonly RemoteNode[], byKey, children };
};

/**
 * 按每层目录数生成任意深度的规则树，叶目录下生成固定数量正文。
 * 空目录层配置表示根下平铺文件；某层数量为 0 时该分支停止，不创建悬空文件。
 */
export const generateRemoteTree = ({
  folderCounts,
  filesPerLeaf,
  rootKey = 'root'
}: {
  folderCounts: readonly number[];
  filesPerLeaf: number;
  rootKey?: string;
}): RemoteNode[] => {
  for (const count of [...folderCounts, filesPerLeaf]) {
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error('Remote tree counts must be non-negative safe integers');
  }
  const nodes = [createRemoteNode(rootKey, { parent: null, type: 'folder' })];
  let parents = [rootKey];
  for (const count of folderCounts) {
    const next: string[] = [];
    for (const parent of parents) {
      for (let index = 0; index < count; index++) {
        const key = `${parent}/folder-${index}`;
        nodes.push(createRemoteNode(key, { parent, type: 'folder' }));
        next.push(key);
      }
    }
    parents = next;
  }
  for (const parent of parents) {
    for (let index = 0; index < filesPerLeaf; index++)
      nodes.push(createRemoteNode(`${parent}/file-${index}`, { parent }));
  }
  return nodes;
};
