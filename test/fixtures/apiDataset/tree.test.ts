import { describe, expect, it } from 'vitest';
import { createRemoteNode, createRemoteTree, generateRemoteTree } from './tree';

describe('createRemoteNode', () => {
  it('提供默认正文，也支持独立指定标题、正文和被平台过滤的类型', () => {
    expect(createRemoteNode('doc', { parent: null })).toEqual({
      key: 'doc',
      parent: null,
      type: 'file',
      name: 'doc',
      content: 'Original body for doc.'
    });
    expect(
      createRemoteNode('image', { parent: 'root', type: 'ignored', name: 'Image', content: '' })
    ).toMatchObject({ name: 'Image', content: '', type: 'ignored' });
  });
});

describe('createRemoteTree', () => {
  it('复制输入数组、按直接父级索引，正文修改保持可见，空树无索引', () => {
    const parent = createRemoteNode('root', { parent: null, type: 'folder' });
    const body = createRemoteNode('doc', { parent: 'root' });
    const input = [parent, body];
    const tree = createRemoteTree(input);
    input.push(createRemoteNode('other', { parent: null }));
    expect(tree.nodes).toEqual([parent, body]);
    expect(tree.byKey.get('doc')).toBe(body);
    expect(tree.children.get(null)).toEqual([parent]);
    expect(tree.children.get('root')).toEqual([body]);
    body.content = 'Updated body';
    expect(tree.byKey.get('doc')?.content).toBe('Updated body');
    expect(createRemoteTree([])).toEqual({ nodes: [], byKey: new Map(), children: new Map() });
  });
  it('拒绝重复身份，防止索引静默覆盖远端节点', () => {
    expect(() =>
      createRemoteTree([
        createRemoteNode('doc', { parent: null }),
        createRemoteNode('doc', { parent: 'root' })
      ])
    ).toThrow('Duplicate remote node: doc');
  });
});

describe('generateRemoteTree', () => {
  it.each([
    { folderCounts: [], filesPerLeaf: 3, folders: 1, files: 3 },
    { folderCounts: [0, 2], filesPerLeaf: 3, folders: 1, files: 0 },
    { folderCounts: [2, 0], filesPerLeaf: 3, folders: 3, files: 0 },
    { folderCounts: [2, 3], filesPerLeaf: 4, folders: 9, files: 24 },
    { folderCounts: [1, 1, 1, 1], filesPerLeaf: 0, folders: 5, files: 0 }
  ])('生成 $folders 目录、$files 正文，节点唯一且父级先出现', ({ folders, files, ...shape }) => {
    const nodes = generateRemoteTree({ ...shape, rootKey: 'custom-root' });
    expect(nodes[0]).toMatchObject({ key: 'custom-root', parent: null });
    expect(nodes.filter((node) => node.type === 'folder')).toHaveLength(folders);
    expect(nodes.filter((node) => node.type === 'file')).toHaveLength(files);
    const known = new Set<string>();
    for (const node of nodes) {
      expect(known.has(node.key)).toBe(false);
      if (node.parent !== null) expect(known.has(node.parent)).toBe(true);
      known.add(node.key);
    }
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('拒绝无效数量 %s', (count) => {
    for (const shape of [
      { folderCounts: [count], filesPerLeaf: 1 },
      { folderCounts: [], filesPerLeaf: count }
    ])
      expect(() => generateRemoteTree(shape)).toThrow('non-negative safe integers');
  });
});
