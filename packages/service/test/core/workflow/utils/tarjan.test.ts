import { describe, it, expect } from 'vitest';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  findSCCs,
  isNodeInCycle,
  classifyEdgesByDFS,
  getEdgeType
} from '@fastgpt/service/core/workflow/utils/tarjan';
import type { EdgeIndex } from '@fastgpt/service/core/workflow/utils/tarjan';

// --- 辅助函数 ---

function makeNode(nodeId: string): RuntimeNodeItemType {
  return { nodeId } as RuntimeNodeItemType;
}

function makeEdge(source: string, target: string, sourceHandle?: string): RuntimeEdgeItemType {
  return {
    source,
    sourceHandle: sourceHandle ?? `${source}-output`,
    target,
    targetHandle: `${target}-input`,
    status: 'active'
  };
}

function buildEdgeIndex(edges: RuntimeEdgeItemType[]): EdgeIndex {
  const bySource = new Map<string, RuntimeEdgeItemType[]>();
  const byTarget = new Map<string, RuntimeEdgeItemType[]>();

  for (const edge of edges) {
    if (!bySource.has(edge.source)) bySource.set(edge.source, []);
    bySource.get(edge.source)!.push(edge);

    if (!byTarget.has(edge.target)) byTarget.set(edge.target, []);
    byTarget.get(edge.target)!.push(edge);
  }

  return { bySource, byTarget };
}

// ===========================
// findSCCs
// ===========================

describe('findSCCs', () => {
  it('单个节点无边 → 自身为独立 SCC，大小为 1', () => {
    const nodes = [makeNode('A')];
    const edgeIndex = buildEdgeIndex([]);
    const { nodeToSCC, sccSizes } = findSCCs(nodes, edgeIndex);

    expect(nodeToSCC.has('A')).toBe(true);
    const sccId = nodeToSCC.get('A')!;
    expect(sccSizes.get(sccId)).toBe(1);
  });

  it('两节点无边 → 两个独立 SCC', () => {
    const nodes = [makeNode('A'), makeNode('B')];
    const edgeIndex = buildEdgeIndex([]);
    const { nodeToSCC, sccSizes } = findSCCs(nodes, edgeIndex);

    expect(nodeToSCC.get('A')).not.toBe(nodeToSCC.get('B'));
    expect(sccSizes.get(nodeToSCC.get('A')!)).toBe(1);
    expect(sccSizes.get(nodeToSCC.get('B')!)).toBe(1);
  });

  it('线性链 A→B→C → 三个独立 SCC，无循环', () => {
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')];
    const edgeIndex = buildEdgeIndex(edges);
    const { nodeToSCC, sccSizes } = findSCCs(nodes, edgeIndex);

    // 各节点属于不同 SCC
    expect(nodeToSCC.get('A')).not.toBe(nodeToSCC.get('B'));
    expect(nodeToSCC.get('B')).not.toBe(nodeToSCC.get('C'));

    sccSizes.forEach((size) => {
      expect(size).toBe(1);
    });
  });

  it('简单二节点循环 A→B→A → 同一个 SCC，大小为 2', () => {
    const nodes = [makeNode('A'), makeNode('B')];
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'A')];
    const edgeIndex = buildEdgeIndex(edges);
    const { nodeToSCC, sccSizes } = findSCCs(nodes, edgeIndex);

    expect(nodeToSCC.get('A')).toBe(nodeToSCC.get('B'));
    const sccId = nodeToSCC.get('A')!;
    expect(sccSizes.get(sccId)).toBe(2);
  });

  it('三节点循环 A→B→C→A → 同一个 SCC，大小为 3', () => {
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C'), makeEdge('C', 'A')];
    const edgeIndex = buildEdgeIndex(edges);
    const { nodeToSCC, sccSizes } = findSCCs(nodes, edgeIndex);

    expect(nodeToSCC.get('A')).toBe(nodeToSCC.get('B'));
    expect(nodeToSCC.get('B')).toBe(nodeToSCC.get('C'));
    const sccId = nodeToSCC.get('A')!;
    expect(sccSizes.get(sccId)).toBe(3);
  });

  it('自环节点 A→A → 自身 SCC，大小为 1（Tarjan 标准行为：自环不影响 SCC 大小）', () => {
    const nodes = [makeNode('A')];
    const edges = [makeEdge('A', 'A')];
    const edgeIndex = buildEdgeIndex(edges);
    const { nodeToSCC, sccSizes } = findSCCs(nodes, edgeIndex);

    expect(nodeToSCC.has('A')).toBe(true);
    const sccId = nodeToSCC.get('A')!;
    // 自环时 lowLink == discoveryTime，SCC 只含自身，大小为 1
    expect(sccSizes.get(sccId)).toBe(1);
  });

  it('混合图：一个循环 + 一个独立节点', () => {
    const nodes = [makeNode('A'), makeNode('B'), makeNode('D')];
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'A')]; // D 孤立
    const edgeIndex = buildEdgeIndex(edges);
    const { nodeToSCC, sccSizes } = findSCCs(nodes, edgeIndex);

    // A、B 在同一 SCC
    expect(nodeToSCC.get('A')).toBe(nodeToSCC.get('B'));
    expect(sccSizes.get(nodeToSCC.get('A')!)).toBe(2);

    // D 独立
    expect(nodeToSCC.get('D')).not.toBe(nodeToSCC.get('A'));
    expect(sccSizes.get(nodeToSCC.get('D')!)).toBe(1);
  });

  it('空节点列表 → 空结果', () => {
    const { nodeToSCC, sccSizes } = findSCCs([], buildEdgeIndex([]));
    expect(nodeToSCC.size).toBe(0);
    expect(sccSizes.size).toBe(0);
  });
});

// ===========================
// isNodeInCycle
// ===========================

describe('isNodeInCycle', () => {
  it('SCC 大小 > 1 → 节点在循环中', () => {
    const nodeToSCC = new Map([
      ['A', 0],
      ['B', 0]
    ]);
    const sccSizes = new Map([[0, 2]]);
    expect(isNodeInCycle('A', nodeToSCC, sccSizes)).toBe(true);
    expect(isNodeInCycle('B', nodeToSCC, sccSizes)).toBe(true);
  });

  it('SCC 大小 == 1 → 节点不在循环中', () => {
    const nodeToSCC = new Map([['A', 0]]);
    const sccSizes = new Map([[0, 1]]);
    expect(isNodeInCycle('A', nodeToSCC, sccSizes)).toBe(false);
  });

  it('节点不在 nodeToSCC 中 → 返回 false', () => {
    const nodeToSCC = new Map<string, number>();
    const sccSizes = new Map<number, number>();
    expect(isNodeInCycle('X', nodeToSCC, sccSizes)).toBe(false);
  });

  it('sccSizes 中无对应 SCC ID → 视为大小 0，返回 false', () => {
    const nodeToSCC = new Map([['A', 99]]);
    const sccSizes = new Map<number, number>(); // 无 sccId=99
    expect(isNodeInCycle('A', nodeToSCC, sccSizes)).toBe(false);
  });
});

// ===========================
// classifyEdgesByDFS
// ===========================

describe('classifyEdgesByDFS', () => {
  it('线性链 A→B→C → 全部是树边', () => {
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edgeAB = makeEdge('A', 'B');
    const edgeBC = makeEdge('B', 'C');
    const edgeIndex = buildEdgeIndex([edgeAB, edgeBC]);
    const edgeTypes = classifyEdgesByDFS(nodes, edgeIndex);

    const keyAB = `${edgeAB.source}-${edgeAB.target}-${edgeAB.sourceHandle}`;
    const keyBC = `${edgeBC.source}-${edgeBC.target}-${edgeBC.sourceHandle}`;
    expect(edgeTypes.get(keyAB)).toBe('tree');
    expect(edgeTypes.get(keyBC)).toBe('tree');
  });

  it('有回边时 → 回边被标记为 back', () => {
    // A → B → C → B（回边）
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edgeAB = makeEdge('A', 'B');
    const edgeBC = makeEdge('B', 'C');
    const edgeCB = makeEdge('C', 'B'); // 回边
    const edgeIndex = buildEdgeIndex([edgeAB, edgeBC, edgeCB]);
    const edgeTypes = classifyEdgesByDFS(nodes, edgeIndex);

    const keyCB = `${edgeCB.source}-${edgeCB.target}-${edgeCB.sourceHandle}`;
    expect(edgeTypes.get(keyCB)).toBe('back');
  });

  it('从入口节点到已完成后代的非树边 → 前向边', () => {
    // A → B, A → C, B → C (A→C 是前向边)
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edgeAB = makeEdge('A', 'B', 'h1');
    const edgeBC = makeEdge('B', 'C', 'h1');
    const edgeAC = makeEdge('A', 'C', 'h2'); // 前向边
    const edgeIndex = buildEdgeIndex([edgeAB, edgeBC, edgeAC]);
    const edgeTypes = classifyEdgesByDFS(nodes, edgeIndex);

    const keyAC = `${edgeAC.source}-${edgeAC.target}-${edgeAC.sourceHandle}`;
    // A→C 应该是 forward 边（A 发现时间早于 C）
    expect(edgeTypes.get(keyAC)).toBe('forward');
  });

  it('跨边 → 两棵子树之间的边', () => {
    // 两条独立链，再加一条跨接边
    // A → B  (树边)
    // C → D  (树边)
    // B → D  (先访问 C→D 路径，D 已 finished，B→D 是 cross)
    const nodes = [makeNode('A'), makeNode('C'), makeNode('B'), makeNode('D')];
    const edgeAB = makeEdge('A', 'B');
    const edgeCD = makeEdge('C', 'D');
    const edgeBD = makeEdge('B', 'D'); // cross 边（DFS 从 A 出发先走 A→B→D，然后 C→D 是 cross）
    // 注：具体是 forward 还是 cross 取决于 DFS 顺序，这里关键是没有 back
    const edgeIndex = buildEdgeIndex([edgeAB, edgeCD, edgeBD]);
    const edgeTypes = classifyEdgesByDFS(nodes, edgeIndex);

    // 确认没有 back 边（无循环）
    for (const type of edgeTypes.values()) {
      expect(type).not.toBe('back');
    }
  });

  it('孤立节点（无入边无出边） → 不产生任何边类型', () => {
    const nodes = [makeNode('A'), makeNode('B')]; // 无边
    const edgeIndex = buildEdgeIndex([]);
    const edgeTypes = classifyEdgesByDFS(nodes, edgeIndex);
    expect(edgeTypes.size).toBe(0);
  });

  it('多个入口节点 → 各自的链均被 DFS 访问', () => {
    // A → B, C → D (两条独立链)
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')];
    const edgeAB = makeEdge('A', 'B');
    const edgeCD = makeEdge('C', 'D');
    const edgeIndex = buildEdgeIndex([edgeAB, edgeCD]);
    const edgeTypes = classifyEdgesByDFS(nodes, edgeIndex);

    const keyAB = `${edgeAB.source}-${edgeAB.target}-${edgeAB.sourceHandle}`;
    const keyCD = `${edgeCD.source}-${edgeCD.target}-${edgeCD.sourceHandle}`;
    expect(edgeTypes.get(keyAB)).toBe('tree');
    expect(edgeTypes.get(keyCD)).toBe('tree');
  });

  it('sourceHandle 为 undefined → 使用 "default" 作为 key', () => {
    const nodes = [makeNode('A'), makeNode('B')];
    const edge: RuntimeEdgeItemType = {
      source: 'A',
      sourceHandle: undefined as any, // 模拟 undefined
      target: 'B',
      targetHandle: 'B-input',
      status: 'active'
    };
    const edgeIndex = buildEdgeIndex([edge]);
    const edgeTypes = classifyEdgesByDFS(nodes, edgeIndex);

    const keyWithDefault = 'A-B-default';
    expect(edgeTypes.get(keyWithDefault)).toBe('tree');
  });
});

// ===========================
// getEdgeType
// ===========================

describe('getEdgeType', () => {
  it('返回边对应的类型', () => {
    const edge = makeEdge('A', 'B', 'h1');
    const edgeKey = `A-B-h1`;
    const edgeTypes = new Map([[edgeKey, 'tree' as const]]);
    expect(getEdgeType(edge, edgeTypes)).toBe('tree');
  });

  it('边不在 map 中 → 返回 undefined', () => {
    const edge = makeEdge('X', 'Y', 'hX');
    const edgeTypes = new Map<string, 'tree' | 'back' | 'forward' | 'cross'>();
    expect(getEdgeType(edge, edgeTypes)).toBeUndefined();
  });

  it('sourceHandle 为 undefined → key 使用 "default"', () => {
    const edge: RuntimeEdgeItemType = {
      source: 'A',
      sourceHandle: undefined as any,
      target: 'B',
      targetHandle: 'B-input',
      status: 'active'
    };
    const edgeKey = 'A-B-default';
    const edgeTypes = new Map([[edgeKey, 'back' as const]]);
    expect(getEdgeType(edge, edgeTypes)).toBe('back');
  });

  it('各种边类型均可正确返回', () => {
    const edgeTypes = new Map<string, 'tree' | 'back' | 'forward' | 'cross'>([
      ['A-B-h1', 'tree'],
      ['B-A-h2', 'back'],
      ['A-C-h3', 'forward'],
      ['D-C-h4', 'cross']
    ]);

    expect(getEdgeType(makeEdge('A', 'B', 'h1'), edgeTypes)).toBe('tree');
    expect(getEdgeType(makeEdge('B', 'A', 'h2'), edgeTypes)).toBe('back');
    expect(getEdgeType(makeEdge('A', 'C', 'h3'), edgeTypes)).toBe('forward');
    expect(getEdgeType(makeEdge('D', 'C', 'h4'), edgeTypes)).toBe('cross');
  });
});

// ===========================
// 安全边界检测
// ===========================

describe('安全边界检测', () => {
  describe('findSCCs - 边界输入', () => {
    it('边引用了不在节点列表中的 target → 不崩溃，已声明节点均有 SCC', () => {
      // 节点列表只有 A，但边 A→Ghost 的 target "Ghost" 不在列表里
      const nodes = [makeNode('A')];
      const edges = [makeEdge('A', 'Ghost')];
      const edgeIndex = buildEdgeIndex(edges);

      // 不应抛出异常
      expect(() => findSCCs(nodes, edgeIndex)).not.toThrow();

      const { nodeToSCC } = findSCCs(nodes, edgeIndex);
      // 已声明的节点 A 必须有 SCC 分配
      expect(nodeToSCC.has('A')).toBe(true);
    });

    it('边引用了不在节点列表中的 source（edgeIndex.bySource 含幽灵节点）→ 不崩溃', () => {
      // 节点列表只有 B，但 bySource 里有从 "Ghost" 出发的边
      const nodes = [makeNode('B')];
      const ghostEdge = makeEdge('Ghost', 'B');
      const edgeIndex = buildEdgeIndex([ghostEdge]);

      expect(() => findSCCs(nodes, edgeIndex)).not.toThrow();

      const { nodeToSCC } = findSCCs(nodes, edgeIndex);
      expect(nodeToSCC.has('B')).toBe(true);
    });

    it('重复节点 ID → 后续重复节点因 discoveryTime 已存在而被跳过，不崩溃', () => {
      const nodes = [makeNode('A'), makeNode('A')]; // 重复
      const edgeIndex = buildEdgeIndex([]);

      expect(() => findSCCs(nodes, edgeIndex)).not.toThrow();

      const { nodeToSCC } = findSCCs(nodes, edgeIndex);
      expect(nodeToSCC.has('A')).toBe(true);
    });

    it('边 source/target 为空字符串 → 不崩溃，空字符串节点被当作普通节点 ID', () => {
      const nodes = [makeNode('A'), makeNode('')];
      const edge = makeEdge('A', '');
      const edgeIndex = buildEdgeIndex([edge]);

      expect(() => findSCCs(nodes, edgeIndex)).not.toThrow();
    });

    it('较深的线性链（500 节点）→ 不应栈溢出', () => {
      const SIZE = 500;
      const nodes = Array.from({ length: SIZE }, (_, i) => makeNode(`N${i}`));
      const edges = Array.from({ length: SIZE - 1 }, (_, i) => makeEdge(`N${i}`, `N${i + 1}`));
      const edgeIndex = buildEdgeIndex(edges);

      expect(() => findSCCs(nodes, edgeIndex)).not.toThrow();

      const { nodeToSCC, sccSizes } = findSCCs(nodes, edgeIndex);
      expect(nodeToSCC.size).toBe(SIZE);
      // 全部独立 SCC，每个大小为 1
      sccSizes.forEach((size) => expect(size).toBe(1));
    });
  });

  describe('classifyEdgesByDFS - 边界输入', () => {
    it('边引用了不在节点列表中的 target → 不崩溃', () => {
      const nodes = [makeNode('A')];
      const edges = [makeEdge('A', 'Ghost')];
      const edgeIndex = buildEdgeIndex(edges);

      expect(() => classifyEdgesByDFS(nodes, edgeIndex)).not.toThrow();
    });

    it('边 source/target 为空字符串 → 不崩溃', () => {
      const nodes = [makeNode(''), makeNode('A')];
      const edge = makeEdge('', 'A');
      const edgeIndex = buildEdgeIndex([edge]);

      expect(() => classifyEdgesByDFS(nodes, edgeIndex)).not.toThrow();
    });

    it('较深的线性链（500 节点）→ 不应栈溢出', () => {
      const SIZE = 500;
      const nodes = Array.from({ length: SIZE }, (_, i) => makeNode(`N${i}`));
      const edges = Array.from({ length: SIZE - 1 }, (_, i) => makeEdge(`N${i}`, `N${i + 1}`));
      const edgeIndex = buildEdgeIndex(edges);

      expect(() => classifyEdgesByDFS(nodes, edgeIndex)).not.toThrow();

      const edgeTypes = classifyEdgesByDFS(nodes, edgeIndex);
      // 线性链全是树边
      edgeTypes.forEach((type) => expect(type).toBe('tree'));
    });

    it('重复节点 ID → 不崩溃', () => {
      const nodes = [makeNode('A'), makeNode('A'), makeNode('B')];
      const edges = [makeEdge('A', 'B')];
      const edgeIndex = buildEdgeIndex(edges);

      expect(() => classifyEdgesByDFS(nodes, edgeIndex)).not.toThrow();
    });
  });

  describe('isNodeInCycle - 边界输入', () => {
    it('nodeId 为空字符串 → 正常查找，不崩溃', () => {
      const nodeToSCC = new Map([['', 0]]);
      const sccSizes = new Map([[0, 2]]);
      expect(() => isNodeInCycle('', nodeToSCC, sccSizes)).not.toThrow();
      expect(isNodeInCycle('', nodeToSCC, sccSizes)).toBe(true);
    });

    it('空的 map → 返回 false，不崩溃', () => {
      expect(isNodeInCycle('anything', new Map(), new Map())).toBe(false);
    });
  });
});
