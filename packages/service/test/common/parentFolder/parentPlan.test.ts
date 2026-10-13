import { describe, expect, it, vi } from 'vitest';
import {
  assertParentPlanAcyclic,
  type ParentPlanNode
} from '@fastgpt/service/common/parentFolder/parentPlan';

const loader = (nodes: ParentPlanNode[]) =>
  vi.fn(async (ids: string[]) => nodes.filter((node) => ids.includes(node.id)));

describe('assertParentPlanAcyclic', () => {
  it('空计划不查询，重复且相同的变更允许', async () => {
    const loadParents = loader([]);
    await assertParentPlanAcyclic({ changes: [], loadParents });
    await assertParentPlanAcyclic({
      changes: [
        { id: 'a', parentId: null },
        { id: 'a', parentId: null }
      ],
      loadParents
    });
    expect(loadParents).not.toHaveBeenCalled();
  });
  it('同一节点的冲突计划直接拒绝', async () => {
    await expect(
      assertParentPlanAcyclic({
        changes: [
          { id: 'a', parentId: null },
          { id: 'a', parentId: 'b' }
        ],
        loadParents: loader([])
      })
    ).rejects.toThrow('Conflicting parent plan');
  });
  it.each([
    { changes: [{ id: 'a', parentId: 'a' }], existing: [] },
    { changes: [{ id: 'a', parentId: 'b' }], existing: [{ id: 'b', parentId: 'a' }] },
    {
      changes: [
        { id: 'a', parentId: 'b' },
        { id: 'b', parentId: 'a' }
      ],
      existing: []
    },
    {
      changes: [{ id: 'a', parentId: 'b' }],
      existing: [
        { id: 'b', parentId: 'c' },
        { id: 'c', parentId: 'b' }
      ]
    }
  ])('拒绝自身、后代、同批及存量祖先环：%j', async ({ changes, existing }) => {
    await expect(
      assertParentPlanAcyclic({ changes, loadParents: loader(existing) })
    ).rejects.toThrow('Circular parent plan');
  });
  it('同批移出后代后再移动祖先，按最终图允许', async () => {
    await expect(
      assertParentPlanAcyclic({
        changes: [
          { id: 'a', parentId: 'b' },
          { id: 'b', parentId: null },
          { id: 'c', parentId: 'a' }
        ],
        loadParents: loader([
          { id: 'b', parentId: 'a' },
          { id: 'c', parentId: 'b' }
        ])
      })
    ).resolves.toBeUndefined();
  });
  it('缺失祖先不是根，不检查无关损坏子树', async () => {
    const loadParents = loader([{ id: 'unrelated', parentId: 'unrelated' }]);
    await expect(
      assertParentPlanAcyclic({ changes: [{ id: 'a', parentId: 'missing' }], loadParents })
    ).rejects.toThrow('Missing parent in plan: missing');
    await expect(
      assertParentPlanAcyclic({ changes: [{ id: 'a', parentId: null }], loadParents })
    ).resolves.toBeUndefined();
    expect(loadParents).toHaveBeenCalledExactlyOnceWith(['missing']);
  });
  it('共同祖先仅加载一次，超过 1000 个父级分批读取', async () => {
    const parents = Array.from({ length: 2003 }, (_, i) => ({ id: `p${i}`, parentId: 'root' }));
    const loadParents = loader([...parents, { id: 'root', parentId: null }]);
    await assertParentPlanAcyclic({
      changes: parents.map((parent, i) => ({ id: `child${i}`, parentId: parent.id })),
      loadParents
    });
    expect(loadParents.mock.calls.map(([ids]) => ids.length)).toEqual([1000, 1000, 3, 1]);
    expect(
      loadParents.mock.calls.flatMap(([ids]) => ids).filter((id) => id === 'root')
    ).toHaveLength(1);
  });
  it('一万层新节点采用迭代校验，读取异常原样上抛', async () => {
    const changes = Array.from({ length: 10000 }, (_, i) => ({
      id: String(i),
      parentId: i === 0 ? null : String(i - 1)
    }));
    const loadParents = loader([]);
    await expect(assertParentPlanAcyclic({ changes, loadParents })).resolves.toBeUndefined();
    expect(loadParents).not.toHaveBeenCalled();
    const error = new Error('reader failed');
    await expect(
      assertParentPlanAcyclic({
        changes: [{ id: 'a', parentId: 'b' }],
        loadParents: async () => {
          throw error;
        }
      })
    ).rejects.toBe(error);
  });
});
