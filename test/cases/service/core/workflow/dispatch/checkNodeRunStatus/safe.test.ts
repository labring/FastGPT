import { describe, it, expect } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowQueue } from '@fastgpt/service/core/workflow/dispatch/index';
import { createNode, createEdge, setEdgeStatus } from '../../utils';

describe('死循环避免 > 场景DA-1: 两节点互等死锁（基础互锁）', () => {
  /**
   * 工作流结构：
   *
   * start → A ⇄ B
   *
   * A 有两组：[start→A], [B→A(回边)]
   * B 有一组：[A→B]
   *
   * 核心验证：所有边均处于 waiting 时，节点绝不应运行，
   * 确保不会因互相等待而形成死循环。
   */
  const nodes = [
    createNode('start', FlowNodeTypeEnum.workflowStart),
    createNode('A', FlowNodeTypeEnum.chatNode),
    createNode('B', FlowNodeTypeEnum.chatNode)
  ];

  const edges = [
    createEdge('start', 'A'),
    createEdge('A', 'B'),
    createEdge('B', 'A') // 回边，构成循环
  ];

  const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
  const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
    runtimeNodes: nodes,
    edgeIndex
  });

  it('DA-1.1: 分组正确 - A 应有 2 组（前向组 + 回边组）', () => {
    const groups = edgeGroupsMap.get('A') || [];
    expect(groups.length).toBe(2);
  });

  it('DA-1.2: 全部 waiting - A 应等待，不触发死循环', () => {
    setEdgeStatus(edges, 'start', 'A', 'waiting');
    setEdgeStatus(edges, 'B', 'A', 'waiting');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('wait');
  });

  it('DA-1.3: 全部 waiting - B 应等待，不触发死循环', () => {
    setEdgeStatus(edges, 'A', 'B', 'waiting');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'B')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('wait');
  });

  it('DA-1.4: 仅前向边 active - A 首次触发应运行', () => {
    setEdgeStatus(edges, 'start', 'A', 'active');
    setEdgeStatus(edges, 'B', 'A', 'waiting');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('DA-1.5: 仅回边 active - A 循环触发应运行', () => {
    setEdgeStatus(edges, 'start', 'A', 'skipped');
    setEdgeStatus(edges, 'B', 'A', 'active');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('DA-1.6: 两组边都 skipped - A 应跳过（循环已完全退出）', () => {
    setEdgeStatus(edges, 'start', 'A', 'skipped');
    setEdgeStatus(edges, 'B', 'A', 'skipped');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('skip');
  });
});

describe('场景DA-2: 回边激活时 waiting 的前向组不阻塞执行', () => {
  /**
   * 工作流结构：
   *
   * start → A ──┐
   * X ─────→ A  │  （start→A 与 X→A 同属前向组）
   *             ↓
   *             B → A  （B→A 是回边，独立分组）
   *
   * Groups for A: [start→A, X→A], [B→A]
   *
   * 核心验证：当回边组 active 而前向组有 waiting 时，A 应能运行。
   * 这是避免"回边激活被前向 waiting 阻塞"导致死循环的关键。
   */
  const nodes = [
    createNode('start', FlowNodeTypeEnum.workflowStart),
    createNode('X', FlowNodeTypeEnum.chatNode),
    createNode('A', FlowNodeTypeEnum.chatNode),
    createNode('B', FlowNodeTypeEnum.chatNode)
  ];

  // start 和 X 都连到 A（同一前向分组），B→A 是回边
  const edges = [
    createEdge('start', 'A'),
    createEdge('X', 'A'),
    createEdge('A', 'B'),
    createEdge('B', 'A') // 回边
  ];

  const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
  const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
    runtimeNodes: nodes,
    edgeIndex
  });

  it('DA-2.1: 回边 active，前向组有 waiting - A 应运行（回边组独立判断）', () => {
    setEdgeStatus(edges, 'start', 'A', 'skipped');
    setEdgeStatus(edges, 'X', 'A', 'waiting'); // 前向组有 waiting
    setEdgeStatus(edges, 'B', 'A', 'active'); // 回边组 active

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('DA-2.2: 前向组全部 active，回边 waiting - A 应运行（前向组满足）', () => {
    setEdgeStatus(edges, 'start', 'A', 'active');
    setEdgeStatus(edges, 'X', 'A', 'active');
    setEdgeStatus(edges, 'B', 'A', 'waiting');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('DA-2.3: 前向组一条 active 一条 waiting，回边也 waiting - A 应等待', () => {
    setEdgeStatus(edges, 'start', 'A', 'active');
    setEdgeStatus(edges, 'X', 'A', 'waiting'); // 前向组未完全就绪
    setEdgeStatus(edges, 'B', 'A', 'waiting'); // 回边组也 waiting

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('wait');
  });
});

describe('场景DA-3: 三节点环形互等（全等待不触发）', () => {
  /**
   * 工作流结构：
   *
   * start → A → B → C → A（回边）
   *
   * Groups for A: [start→A], [C→A]
   * Groups for B: [A→B]
   * Groups for C: [B→C]
   *
   * 核心验证：三节点均在等待彼此时，没有任何节点应该运行，
   * 杜绝"环形等待触发"形成死循环。
   */
  const nodes = [
    createNode('start', FlowNodeTypeEnum.workflowStart),
    createNode('A', FlowNodeTypeEnum.chatNode),
    createNode('B', FlowNodeTypeEnum.chatNode),
    createNode('C', FlowNodeTypeEnum.chatNode)
  ];

  const edges = [
    createEdge('start', 'A'),
    createEdge('A', 'B'),
    createEdge('B', 'C'),
    createEdge('C', 'A') // 回边
  ];

  const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
  const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
    runtimeNodes: nodes,
    edgeIndex
  });

  it('DA-3.1: 所有边 waiting - A、B、C 均不运行', () => {
    setEdgeStatus(edges, 'start', 'A', 'waiting');
    setEdgeStatus(edges, 'A', 'B', 'waiting');
    setEdgeStatus(edges, 'B', 'C', 'waiting');
    setEdgeStatus(edges, 'C', 'A', 'waiting');

    const statusA = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });
    const statusB = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'B')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });
    const statusC = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'C')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(statusA).toBe('wait');
    expect(statusB).toBe('wait');
    expect(statusC).toBe('wait');
  });

  it('DA-3.2: 循环运行中状态重置后（start→A skipped，C→A waiting）- A 应等待而非重复运行', () => {
    // 模拟 A 已运行一次后，其入边被重置为 waiting
    setEdgeStatus(edges, 'start', 'A', 'skipped');
    setEdgeStatus(edges, 'C', 'A', 'waiting'); // C 尚未完成，A 不应再次运行

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('wait');
  });

  it('DA-3.3: 循环全部退出（所有边 skipped）- A 应跳过', () => {
    setEdgeStatus(edges, 'start', 'A', 'skipped');
    setEdgeStatus(edges, 'C', 'A', 'skipped');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('skip');
  });
});

describe('场景DA-4: 分支节点在循环中 - 错误分支不触发循环', () => {
  /**
   * 工作流结构：
   *
   *          ┌── if ──→ loopBody ──┐
   * start → ifElse                │（loopBody→ifElse 是回边）
   *          └── else ──→ exit     │
   *               ↑               │
   *               └───────────────┘
   *
   * Groups for ifElse: [start→ifElse], [loopBody→ifElse(回边)]
   *
   * 核心验证：走 else 分支退出后，loopBody→ifElse 被 skipped，
   * 两组均 skipped → ifElse 应 skip，不再重新触发循环。
   */
  const nodes = [
    createNode('start', FlowNodeTypeEnum.workflowStart),
    createNode('ifElse', FlowNodeTypeEnum.ifElseNode),
    createNode('loopBody', FlowNodeTypeEnum.chatNode),
    createNode('exit', FlowNodeTypeEnum.chatNode)
  ];

  const edges = [
    createEdge('start', 'ifElse'),
    createEdge('ifElse', 'loopBody', 'waiting', 'ifElse-source-if'),
    createEdge('ifElse', 'exit', 'waiting', 'ifElse-source-else'),
    createEdge('loopBody', 'ifElse') // 回边
  ];

  const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
  const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
    runtimeNodes: nodes,
    edgeIndex
  });

  it('DA-4.1: 初始进入 - start→ifElse active，ifElse 应运行', () => {
    setEdgeStatus(edges, 'start', 'ifElse', 'active');
    setEdgeStatus(edges, 'loopBody', 'ifElse', 'waiting');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'ifElse')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('DA-4.2: 循环回来 - loopBody→ifElse active，start→ifElse skipped，ifElse 应运行', () => {
    setEdgeStatus(edges, 'start', 'ifElse', 'skipped');
    setEdgeStatus(edges, 'loopBody', 'ifElse', 'active');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'ifElse')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('DA-4.3: 走 else 分支退出后 - 两组均 skipped，ifElse 应跳过（不再触发循环）', () => {
    setEdgeStatus(edges, 'start', 'ifElse', 'skipped');
    setEdgeStatus(edges, 'loopBody', 'ifElse', 'skipped'); // loopBody 未执行，被 skipped

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'ifElse')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('skip');
  });

  it('DA-4.4: 两组均 waiting - ifElse 应等待，不假触发', () => {
    setEdgeStatus(edges, 'start', 'ifElse', 'waiting');
    setEdgeStatus(edges, 'loopBody', 'ifElse', 'waiting');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'ifElse')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('wait');
  });
});

describe('场景DA-5: 多个独立回边（来自不同分支）- 各组独立判断不互相阻塞', () => {
  /**
   * 工作流结构：
   *
   *               ┌── if ───→ B ──┐
   * start → A → ifElse            │（回边，各自独立分组）
   *               └── else ──→ C ──┘
   *
   * B→A 经由 if 分支，C→A 经由 else 分支，
   * 各自向上追溯到 ifElse 的不同 sourceHandle，形成独立分组。
   *
   * Groups for A: [start→A], [B→A（if 分支回边）], [C→A（else 分支回边）]
   *
   * 核心验证：来自不同分支的回边各自形成独立分组，任一分组 active 即可运行，
   * 互不阻塞，杜绝"等待所有回边"造成的死锁。
   */
  const nodes = [
    createNode('start', FlowNodeTypeEnum.workflowStart),
    createNode('A', FlowNodeTypeEnum.chatNode),
    createNode('ifElse', FlowNodeTypeEnum.ifElseNode),
    createNode('B', FlowNodeTypeEnum.chatNode),
    createNode('C', FlowNodeTypeEnum.chatNode)
  ];

  // A→ifElse→B→A（if 分支回路）和 A→ifElse→C→A（else 分支回路）
  const edges = [
    createEdge('start', 'A'),
    createEdge('A', 'ifElse'),
    createEdge('ifElse', 'B', 'waiting', 'ifElse-source-if'),
    createEdge('ifElse', 'C', 'waiting', 'ifElse-source-else'),
    createEdge('B', 'A'), // if 分支回边
    createEdge('C', 'A') // else 分支回边
  ];

  const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
  const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
    runtimeNodes: nodes,
    edgeIndex
  });

  it('DA-5.1: A 应有 3 组（前向组 + if 回边组 + else 回边组）', () => {
    const groups = edgeGroupsMap.get('A') || [];
    expect(groups.length).toBe(3);
  });

  it('DA-5.2: 所有入边 waiting - A 应等待', () => {
    setEdgeStatus(edges, 'start', 'A', 'waiting');
    setEdgeStatus(edges, 'B', 'A', 'waiting');
    setEdgeStatus(edges, 'C', 'A', 'waiting');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('wait');
  });

  it('DA-5.3: 仅 if 分支回边 active - A 应运行（if 回边组独立触发）', () => {
    setEdgeStatus(edges, 'start', 'A', 'skipped');
    setEdgeStatus(edges, 'B', 'A', 'active'); // if 回边 active
    setEdgeStatus(edges, 'C', 'A', 'waiting'); // else 回边 waiting，不阻塞

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('DA-5.4: 仅 else 分支回边 active - A 应运行（else 回边组独立触发）', () => {
    setEdgeStatus(edges, 'start', 'A', 'skipped');
    setEdgeStatus(edges, 'B', 'A', 'waiting'); // if 回边 waiting，不阻塞
    setEdgeStatus(edges, 'C', 'A', 'active'); // else 回边 active

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('DA-5.5: 所有回边 skipped，前向边也 skipped - A 应跳过', () => {
    setEdgeStatus(edges, 'start', 'A', 'skipped');
    setEdgeStatus(edges, 'B', 'A', 'skipped');
    setEdgeStatus(edges, 'C', 'A', 'skipped');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('skip');
  });
});

describe('场景DA-6: 自循环节点不假触发', () => {
  /**
   * 工作流结构：
   *
   * start → A → A（自循环回边）
   *
   * Groups for A: [start→A], [A→A(自循环回边)]
   *
   * 核心验证：自循环节点在各种边状态组合下不产生假触发。
   */
  const nodes = [
    createNode('start', FlowNodeTypeEnum.workflowStart),
    createNode('A', FlowNodeTypeEnum.chatNode)
  ];

  const edges = [
    createEdge('start', 'A'),
    createEdge('A', 'A') // 自循���
  ];

  const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
  const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
    runtimeNodes: nodes,
    edgeIndex
  });

  it('DA-6.1: 两条入边均 waiting - A 应等待，不假触发', () => {
    setEdgeStatus(edges, 'start', 'A', 'waiting');
    setEdgeStatus(edges, 'A', 'A', 'waiting');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('wait');
  });

  it('DA-6.2: start→A active，A→A waiting - A 首次应运行', () => {
    setEdgeStatus(edges, 'start', 'A', 'active');
    setEdgeStatus(edges, 'A', 'A', 'waiting');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('DA-6.3: A→A active（自循环激活），start→A skipped - A 应运行', () => {
    setEdgeStatus(edges, 'start', 'A', 'skipped');
    setEdgeStatus(edges, 'A', 'A', 'active');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('DA-6.4: 两条边均 skipped - A 应跳过（自循环已结束）', () => {
    setEdgeStatus(edges, 'start', 'A', 'skipped');
    setEdgeStatus(edges, 'A', 'A', 'skipped');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('skip');
  });
});

describe('场景DA-7: 循环入边重置后不重复触发', () => {
  /**
   * 工作流结构：
   *
   * start → A → B → C → A（回边）
   *
   * 模拟场景：A 运行后，其所有入边被重置为 waiting（运行时的实际行为）。
   * 此时 A 不应被再次加入队列。
   *
   * 核心验证：在实际运行时，节点完成后入边重置为 waiting，
   * 此时状态为 wait，不应立即再次运行。
   */
  const nodes = [
    createNode('start', FlowNodeTypeEnum.workflowStart),
    createNode('A', FlowNodeTypeEnum.chatNode),
    createNode('B', FlowNodeTypeEnum.chatNode),
    createNode('C', FlowNodeTypeEnum.chatNode)
  ];

  const edges = [
    createEdge('start', 'A'),
    createEdge('A', 'B'),
    createEdge('B', 'C'),
    createEdge('C', 'A') // 回边
  ];

  const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
  const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
    runtimeNodes: nodes,
    edgeIndex
  });

  it('DA-7.1: A 运行后入边重置（start→A=skipped, C→A=waiting）- A 应等待', () => {
    // 模拟 A 刚运行完，其入边被重置为 waiting，C→A 尚未激活
    setEdgeStatus(edges, 'start', 'A', 'skipped');
    setEdgeStatus(edges, 'C', 'A', 'waiting');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('wait');
  });

  it('DA-7.2: B 运行后入边重置（A→B=waiting）- B 应等待，不重复运行', () => {
    setEdgeStatus(edges, 'A', 'B', 'waiting');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'B')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('wait');
  });

  it('DA-7.3: C→A active（循环驱动）- A 应能再次运行', () => {
    setEdgeStatus(edges, 'start', 'A', 'skipped');
    setEdgeStatus(edges, 'C', 'A', 'active'); // 循环驱动 A 再次运行

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'A')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });
});
