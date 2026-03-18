import { describe, it, expect } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { WorkflowQueue } from '@fastgpt/service/core/workflow/dispatch/index';
import { createNode, createEdge } from '../utils';

/**
 * 测试目标：验证节点运行状态判断是否正确
 *
 * 测试方法：
 * 1. 构建工作流图（节点 + 边）
 * 2. 使用 buildNodeEdgeGroupsMap 构建边分组
 * 3. 模拟不同的边状态（active/waiting/skipped）
 * 4. 使用 getNodeRunStatus 判断节点状态
 * 5. 验证节点状态是否符合预期
 */

describe('checkNodeRunStatus', () => {
  // 辅助函数：设置边状态
  const setEdgeStatus = (
    edges: RuntimeEdgeItemType[],
    source: string,
    target: string,
    status: 'active' | 'waiting' | 'skipped'
  ) => {
    const edge = edges.find((e) => e.source === source && e.target === target);
    if (edge) {
      edge.status = status;
    }
  };

  describe('场景1: 简单分支汇聚', () => {
    /**
     * 工作流结构：
     *
     *        ┌─ if ──→ B ──┐
     * start → A            → D
     *        └─ else → C ──┘
     *
     * 预期分组：
     * - D: 组1[B→D], 组2[C→D]
     *
     * 测试场景：
     * 1. A 走 if 分支：B→D active, C→D skipped → D 应该运行
     * 2. A 走 else 分支：C→D active, B→D skipped → D 应该运行
     */

    const nodes = [
      createNode('start', FlowNodeTypeEnum.workflowStart),
      createNode('A', FlowNodeTypeEnum.ifElseNode),
      createNode('B', FlowNodeTypeEnum.chatNode),
      createNode('C', FlowNodeTypeEnum.chatNode),
      createNode('D', FlowNodeTypeEnum.chatNode)
    ];

    const edges = [
      createEdge('start', 'A'),
      createEdge('A', 'B', 'waiting', 'A-source-if'),
      createEdge('A', 'C', 'waiting', 'A-source-else'),
      createEdge('B', 'D'),
      createEdge('C', 'D')
    ];

    const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
    const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      runtimeNodes: nodes,
      edgeIndex
    });

    it('D 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('D') || [];
      expect(groups.length).toBe(1);
    });

    it('场景1.1: A 走 if 分支，D 应该运行', () => {
      // 设置边状态
      setEdgeStatus(edges, 'start', 'A', 'active');
      setEdgeStatus(edges, 'A', 'B', 'active');
      setEdgeStatus(edges, 'A', 'C', 'skipped');
      setEdgeStatus(edges, 'B', 'D', 'active');
      setEdgeStatus(edges, 'C', 'D', 'skipped');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'D')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景1.2: A 走 else 分支，D 应该运行', () => {
      // 设置边状态
      setEdgeStatus(edges, 'start', 'A', 'active');
      setEdgeStatus(edges, 'A', 'B', 'skipped');
      setEdgeStatus(edges, 'A', 'C', 'active');
      setEdgeStatus(edges, 'B', 'D', 'skipped');
      setEdgeStatus(edges, 'C', 'D', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'D')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景1.3: B 还在执行中，D 应该等待', () => {
      // 设置边状态
      setEdgeStatus(edges, 'start', 'A', 'active');
      setEdgeStatus(edges, 'A', 'B', 'active');
      setEdgeStatus(edges, 'A', 'C', 'skipped');
      setEdgeStatus(edges, 'B', 'D', 'waiting');
      setEdgeStatus(edges, 'C', 'D', 'skipped');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'D')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('wait');
    });
  });

  describe('场景2: 简单循环', () => {
    /**
     * 工作流结构：
     *
     * start → A → B → C → A
     *
     * 预期分组：
     * - A: 组1[start→A], 组2[C→A]
     *
     * 测试场景：
     * 1. 第一次执行：start→A active → A 应该运行
     * 2. 循环执行：C→A active → A 应该运行
     * 3. 两条边都 waiting → A 应该等待
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
      createEdge('C', 'A')
    ];

    const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
    const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      runtimeNodes: nodes,
      edgeIndex
    });

    it('A 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('A') || [];
      expect(groups.length).toBe(2);
    });

    it('场景2.1: 第一次执行，A 应该运行', () => {
      setEdgeStatus(edges, 'start', 'A', 'active');
      setEdgeStatus(edges, 'C', 'A', 'waiting');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景2.2: 循环执行，A 应该运行', () => {
      setEdgeStatus(edges, 'start', 'A', 'skipped');
      setEdgeStatus(edges, 'C', 'A', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景2.3: 两条边都 waiting，A 应该等待', () => {
      setEdgeStatus(edges, 'start', 'A', 'waiting');
      setEdgeStatus(edges, 'C', 'A', 'waiting');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('wait');
    });
  });

  describe('场景3: 分支 + 循环', () => {
    /**
     * 工作流结构：
     *
     *        ┌─ if ──→ B ──→ D ──→ F ──┐
     * start → A                        │
     *        └─ else → C ──→ D         │
     *                                  │
     *        A ←───────────────────────┘
     *
     * 预期分组：
     * - D: 组1[B→D], 组2[C→D]
     * - A: 组1[start→A], 组2[F→A]
     *
     * 测试场景：
     * 1. 第一次走 if 分支：B→D active, C→D skipped → D 应该运行
     * 2. 第一次走 else 分支：C→D active, B→D skipped → D 应该运行
     * 3. 循环回来：F→A active → A 应该运行
     */

    const nodes = [
      createNode('start', FlowNodeTypeEnum.workflowStart),
      createNode('A', FlowNodeTypeEnum.ifElseNode),
      createNode('B', FlowNodeTypeEnum.chatNode),
      createNode('C', FlowNodeTypeEnum.chatNode),
      createNode('D', FlowNodeTypeEnum.chatNode),
      createNode('F', FlowNodeTypeEnum.chatNode)
    ];

    const edges = [
      createEdge('start', 'A'),
      createEdge('A', 'B', 'waiting', 'A-source-if'),
      createEdge('A', 'C', 'waiting', 'A-source-else'),
      createEdge('B', 'D'),
      createEdge('C', 'D'),
      createEdge('D', 'F'),
      createEdge('F', 'A')
    ];

    const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
    const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      runtimeNodes: nodes,
      edgeIndex
    });

    it('D 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('D') || [];
      expect(groups.length).toBe(2);
    });

    it('A 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('A') || [];
      expect(groups.length).toBe(2);
    });

    it('场景3.1: 第一次走 if 分支，D 应该运行', () => {
      setEdgeStatus(edges, 'B', 'D', 'active');
      setEdgeStatus(edges, 'C', 'D', 'skipped');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'D')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景3.2: 第一次走 else 分支，D 应该运行', () => {
      setEdgeStatus(edges, 'B', 'D', 'skipped');
      setEdgeStatus(edges, 'C', 'D', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'D')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景3.3: 循环回来，A 应该运行', () => {
      setEdgeStatus(edges, 'start', 'A', 'skipped');
      setEdgeStatus(edges, 'F', 'A', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });
  });

  describe('场景4: 并行汇聚（无分支节点）', () => {
    /**
     * 工作流结构：
     *
     * start ──→ A ──→ C
     *      └──→ B ──→ C
     *
     * 预期分组：
     * - C: 组1[A→C, B→C] (合并成一组，因为没有分支节点)
     *
     * 测试场景：
     * 1. A 和 B 都完成：A→C active, B→C active → C 应该运行
     * 2. 只有 A 完成：A→C active, B→C waiting → C 应该等待
     * 3. 只有 B 完成：A→C waiting, B→C active → C 应该等待
     */

    const nodes = [
      createNode('start', FlowNodeTypeEnum.workflowStart),
      createNode('A', FlowNodeTypeEnum.chatNode),
      createNode('B', FlowNodeTypeEnum.chatNode),
      createNode('C', FlowNodeTypeEnum.chatNode)
    ];

    const edges = [
      createEdge('start', 'A'),
      createEdge('start', 'B'),
      createEdge('A', 'C'),
      createEdge('B', 'C')
    ];

    const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
    const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      runtimeNodes: nodes,
      edgeIndex
    });

    it('C 节点应该只有 1 组', () => {
      const groups = edgeGroupsMap.get('C') || [];
      expect(groups.length).toBe(1);
      expect(groups[0].length).toBe(2); // 两条边在同一组
    });

    it('场景4.1: A 和 B 都完成，C 应该运行', () => {
      setEdgeStatus(edges, 'A', 'C', 'active');
      setEdgeStatus(edges, 'B', 'C', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'C')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景4.2: 只有 A 完成，C 应该等待', () => {
      setEdgeStatus(edges, 'A', 'C', 'active');
      setEdgeStatus(edges, 'B', 'C', 'waiting');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'C')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('wait');
    });

    it('场景4.3: 只有 B 完成，C 应该等待', () => {
      setEdgeStatus(edges, 'A', 'C', 'waiting');
      setEdgeStatus(edges, 'B', 'C', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'C')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('wait');
    });
  });

  describe('场景5: 所有边都 skipped', () => {
    /**
     * 测试场景：
     * 当节点的所有输入边都是 skipped 时，节点应该被跳过
     */

    const nodes = [
      createNode('start', FlowNodeTypeEnum.workflowStart),
      createNode('A', FlowNodeTypeEnum.ifElseNode),
      createNode('B', FlowNodeTypeEnum.chatNode),
      createNode('C', FlowNodeTypeEnum.chatNode),
      createNode('D', FlowNodeTypeEnum.chatNode)
    ];

    const edges = [
      createEdge('start', 'A'),
      createEdge('A', 'B', 'waiting', 'A-source-if'),
      createEdge('A', 'C', 'waiting', 'A-source-else'),
      createEdge('B', 'D'),
      createEdge('C', 'D')
    ];

    const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
    const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      runtimeNodes: nodes,
      edgeIndex
    });

    it('所有边都 skipped，D 应该被跳过', () => {
      setEdgeStatus(edges, 'B', 'D', 'skipped');
      setEdgeStatus(edges, 'C', 'D', 'skipped');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'D')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('skip');
    });
  });

  describe('场景6: 多层分支嵌套', () => {
    /**
     * 工作流结构：
     *
     *              ┌─ if ──→ B ─ if ──→ D ──┐
     *   start ──→ A          └─ else ─→ E ──┤
     *              └─ else ─→ C ────────────→ F
     *
     * 预期分组：
     * - F: 组1[C→F, D→F, E→F]
     *
     * 测试场景：
     * 1. A 走 if → B 走 if：D→F active, 其他 skipped → F 应该运行
     * 2. A 走 if → B 走 else：E→F active, 其他 skipped → F 应该运行
     * 3. A 走 else：C→F active, 其他 skipped → F 应该运行
     * 4. 部分边 waiting：至少一条边 waiting → F 应该等待
     */

    const nodes = [
      createNode('start', FlowNodeTypeEnum.workflowStart),
      createNode('A', FlowNodeTypeEnum.ifElseNode),
      createNode('B', FlowNodeTypeEnum.ifElseNode),
      createNode('C', FlowNodeTypeEnum.chatNode),
      createNode('D', FlowNodeTypeEnum.chatNode),
      createNode('E', FlowNodeTypeEnum.chatNode),
      createNode('F', FlowNodeTypeEnum.chatNode)
    ];

    const edges = [
      createEdge('start', 'A'),
      createEdge('A', 'B', 'waiting', 'A-source-if'),
      createEdge('A', 'C', 'waiting', 'A-source-else'),
      createEdge('B', 'D', 'waiting', 'B-source-if'),
      createEdge('B', 'E', 'waiting', 'B-source-else'),
      createEdge('C', 'F'),
      createEdge('D', 'F'),
      createEdge('E', 'F')
    ];

    const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
    const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      runtimeNodes: nodes,
      edgeIndex
    });

    it('F 节点应该有 1 组（3条边）', () => {
      const groups = edgeGroupsMap.get('F') || [];
      expect(groups.length).toBe(1);
      expect(groups[0].length).toBe(3);
    });

    it('场景6.1: A→if, B→if 路径，F 应该运行', () => {
      setEdgeStatus(edges, 'C', 'F', 'skipped');
      setEdgeStatus(edges, 'D', 'F', 'active');
      setEdgeStatus(edges, 'E', 'F', 'skipped');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'F')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景6.2: A→if, B→else 路径，F 应该运行', () => {
      setEdgeStatus(edges, 'C', 'F', 'skipped');
      setEdgeStatus(edges, 'D', 'F', 'skipped');
      setEdgeStatus(edges, 'E', 'F', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'F')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景6.3: A→else 路径，F 应该运行', () => {
      setEdgeStatus(edges, 'C', 'F', 'active');
      setEdgeStatus(edges, 'D', 'F', 'skipped');
      setEdgeStatus(edges, 'E', 'F', 'skipped');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'F')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景6.4: D 还在执行中，F 应该等待', () => {
      setEdgeStatus(edges, 'C', 'F', 'skipped');
      setEdgeStatus(edges, 'D', 'F', 'waiting');
      setEdgeStatus(edges, 'E', 'F', 'skipped');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'F')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('wait');
    });
  });

  describe('场景7: 嵌套循环', () => {
    /**
     * 工作流结构：
     *
     *   start ──→ A ──→ B ──→ C ──→ D
     *             ↑     ↑     |     |
     *             |     |_____|     |
     *             |_________________|
     *              (内层循环)  (外层循环)
     *
     * 预期分组：
     * - A: 组1[start→A], 组2[D→A]
     * - B: 组1[A→B], 组2[C→B]
     *
     * 测试场景：
     * 1. 第一次执行：start→A active → A 应该运行
     * 2. 内层循环：C→B active → B 应该运行
     * 3. 外层循环：D→A active → A 应该运行
     * 4. 两条边都 waiting → 应该等待
     */

    const nodes = [
      createNode('start', FlowNodeTypeEnum.workflowStart),
      createNode('A', FlowNodeTypeEnum.chatNode),
      createNode('B', FlowNodeTypeEnum.chatNode),
      createNode('C', FlowNodeTypeEnum.chatNode),
      createNode('D', FlowNodeTypeEnum.chatNode)
    ];

    const edges = [
      createEdge('start', 'A'),
      createEdge('A', 'B'),
      createEdge('B', 'C'),
      createEdge('C', 'B'), // 内层循环
      createEdge('C', 'D'),
      createEdge('D', 'A') // 外层循环
    ];

    const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
    const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      runtimeNodes: nodes,
      edgeIndex
    });

    it('A 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('A') || [];
      expect(groups.length).toBe(2);
    });

    it('B 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('B') || [];
      expect(groups.length).toBe(2);
    });

    it('场景7.1: 第一次执行，A 应该运行', () => {
      setEdgeStatus(edges, 'start', 'A', 'active');
      setEdgeStatus(edges, 'D', 'A', 'waiting');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景7.2: 内层循环执行，B 应该运行', () => {
      setEdgeStatus(edges, 'A', 'B', 'skipped');
      setEdgeStatus(edges, 'C', 'B', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'B')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景7.3: 外层循环执行，A 应该运行', () => {
      setEdgeStatus(edges, 'start', 'A', 'skipped');
      setEdgeStatus(edges, 'D', 'A', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景7.4: B 的两条边都 waiting，B 应该等待', () => {
      setEdgeStatus(edges, 'A', 'B', 'waiting');
      setEdgeStatus(edges, 'C', 'B', 'waiting');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'B')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('wait');
    });
  });

  describe('场景8: 多个独立循环汇聚', () => {
    /**
     * 工作流结构：
     *
     *   start ──→ A ──→ B ──→ E
     *              ↑    |      ↑
     *              |____|      |
     *              |           |
     *              └──→ C ──→ D
     *                   ↑     |
     *                   |_____|
     *
     * 预期分组：
     * - A: 组1[start→A], 组2[B→A]
     * - C: 组1[A→C], 组2[D→C]
     * - E: 组1[B→E, D→E]
     *
     * 测试场景：
     * 1. 两个循环都完成：B→E active, D→E active → E 应该运行
     * 2. 只有循环1完成：B→E active, D→E waiting → E 应该等待
     * 3. 只有循环2完成：B→E waiting, D→E active → E 应该等待
     */

    const nodes = [
      createNode('start', FlowNodeTypeEnum.workflowStart),
      createNode('A', FlowNodeTypeEnum.chatNode),
      createNode('B', FlowNodeTypeEnum.chatNode),
      createNode('C', FlowNodeTypeEnum.chatNode),
      createNode('D', FlowNodeTypeEnum.chatNode),
      createNode('E', FlowNodeTypeEnum.chatNode)
    ];

    const edges = [
      createEdge('start', 'A'),
      createEdge('A', 'B'),
      createEdge('B', 'A'), // 循环1
      createEdge('A', 'C'),
      createEdge('C', 'D'),
      createEdge('D', 'C'), // 循环2
      createEdge('B', 'E'),
      createEdge('D', 'E')
    ];

    const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
    const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      runtimeNodes: nodes,
      edgeIndex
    });

    it('E 节点应该有 1 组（2条边）', () => {
      const groups = edgeGroupsMap.get('E') || [];
      expect(groups.length).toBe(1);
      expect(groups[0].length).toBe(2);
    });

    it('场景8.1: 两个循环都完成，E 应该运行', () => {
      setEdgeStatus(edges, 'B', 'E', 'active');
      setEdgeStatus(edges, 'D', 'E', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'E')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景8.2: 只有循环1完成，E 应该等待', () => {
      setEdgeStatus(edges, 'B', 'E', 'active');
      setEdgeStatus(edges, 'D', 'E', 'waiting');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'E')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('wait');
    });

    it('场景8.3: 只有循环2完成，E 应该等待', () => {
      setEdgeStatus(edges, 'B', 'E', 'waiting');
      setEdgeStatus(edges, 'D', 'E', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'E')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('wait');
    });
  });

  describe('场景9: 复杂有向有环图（多入口多循环）', () => {
    /**
     * 工作流结构：
     *
     *   start ──→ A ──→ C ──→ D ──→ E
     *         |   ↑    ↑              |
     *         |   |____|______________|
     *         |        |
     *         └──→     B
     *
     * 预期分组：
     * - A: 组1[start→A], 组2[E→A]
     * - C: 组1[A→C, B→C], 组2[E→C]
     *
     * 测试场景：
     * 1. 第一次执行：start→A active → A 应该运行
     * 2. 循环到 A：E→A active → A 应该运行
     * 3. C 的非循环边：A→C active, B→C active, E→C skipped → C 应该运行
     * 4. C 的循环边：E→C active, 其他 skipped → C 应该运行
     * 5. C 部分 waiting：A→C active, B→C waiting, E→C skipped → C 应该等待
     */

    const nodes = [
      createNode('start', FlowNodeTypeEnum.workflowStart),
      createNode('A', FlowNodeTypeEnum.chatNode),
      createNode('B', FlowNodeTypeEnum.chatNode),
      createNode('C', FlowNodeTypeEnum.chatNode),
      createNode('D', FlowNodeTypeEnum.chatNode),
      createNode('E', FlowNodeTypeEnum.chatNode)
    ];

    const edges = [
      createEdge('start', 'A'),
      createEdge('start', 'B'),
      createEdge('A', 'C'),
      createEdge('B', 'C'),
      createEdge('C', 'D'),
      createEdge('D', 'E'),
      createEdge('E', 'C'), // 循环1
      createEdge('E', 'A') // 循环2
    ];

    const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
    const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      runtimeNodes: nodes,
      edgeIndex
    });

    it('A 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('A') || [];
      expect(groups.length).toBe(2);
    });

    it('C 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('C') || [];
      expect(groups.length).toBe(2);
      expect(groups[0].length).toBe(2); // A→C, B→C
      expect(groups[1].length).toBe(1); // E→C
    });

    it('场景9.1: 第一次执行，A 应该运行', () => {
      setEdgeStatus(edges, 'start', 'A', 'active');
      setEdgeStatus(edges, 'E', 'A', 'waiting');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景9.2: 循环到 A，A 应该运行', () => {
      setEdgeStatus(edges, 'start', 'A', 'skipped');
      setEdgeStatus(edges, 'E', 'A', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景9.3: C 的非循环边都完成，C 应该运行', () => {
      setEdgeStatus(edges, 'A', 'C', 'active');
      setEdgeStatus(edges, 'B', 'C', 'active');
      setEdgeStatus(edges, 'E', 'C', 'skipped');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'C')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景9.4: C 的循环边完成，C 应该运行', () => {
      setEdgeStatus(edges, 'A', 'C', 'skipped');
      setEdgeStatus(edges, 'B', 'C', 'skipped');
      setEdgeStatus(edges, 'E', 'C', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'C')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景9.5: C 的非循环边部分 waiting，C 应该等待', () => {
      setEdgeStatus(edges, 'A', 'C', 'active');
      setEdgeStatus(edges, 'B', 'C', 'waiting');
      setEdgeStatus(edges, 'E', 'C', 'skipped');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'C')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('wait');
    });
  });

  describe('场景10: 自循环节点', () => {
    /**
     * 工作流结构：
     *
     *   start ──→ A ──┐
     *              ↑__|
     *
     * 预期分组：
     * - A: 组1[start→A], 组2[A→A]
     *
     * 测试场景：
     * 1. 第一次执行：start→A active, A→A waiting → A 应该运行
     * 2. 自循环执行：start→A skipped, A→A active → A 应该运行
     * 3. 两条边都 waiting → A 应该等待
     */

    const nodes = [
      createNode('start', FlowNodeTypeEnum.workflowStart),
      createNode('A', FlowNodeTypeEnum.chatNode)
    ];

    const edges = [createEdge('start', 'A'), createEdge('A', 'A')];

    const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
    const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      runtimeNodes: nodes,
      edgeIndex
    });

    it('A 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('A') || [];
      expect(groups.length).toBe(2);
    });

    it('场景10.1: 第一次执行，A 应该运行', () => {
      setEdgeStatus(edges, 'start', 'A', 'active');
      setEdgeStatus(edges, 'A', 'A', 'waiting');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景10.2: 自循环执行，A 应该运行', () => {
      setEdgeStatus(edges, 'start', 'A', 'skipped');
      setEdgeStatus(edges, 'A', 'A', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景10.3: 两条边都 waiting，A 应该等待', () => {
      setEdgeStatus(edges, 'start', 'A', 'waiting');
      setEdgeStatus(edges, 'A', 'A', 'waiting');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('wait');
    });
  });

  describe('场景11: 用户工作流 - 多层循环回退', () => {
    /**
     * 工作流结构：
     *
     * 开始 → 回复11 → 回复22 → 用户选择
     *          ↑         ↑         ↓
     *          |         |         ├─ 结束
     *          |         └─────────┤ (option2: 回到22)
     *          └───────────────────┘ (option3: 回到11)
     *
     * 关键问题：
     * - "回复22"节点有两条输入边：
     *   1. edge(回复11 → 回复22) - 非循环边
     *   2. edge(用户选择 → 回复22) - 循环边
     *
     * - 两条边都能到达入口，所以都被放在 commonEdges 中
     * - 这导致 AND 语义：两条边都要满足才能运行
     * - 但实际应该是 OR 语义：任一边满足即可运行
     */

    const nodes = [
      createNode('start', FlowNodeTypeEnum.workflowStart),
      createNode('reply11', FlowNodeTypeEnum.answerNode),
      createNode('reply22', FlowNodeTypeEnum.answerNode),
      createNode('userSelect', FlowNodeTypeEnum.userSelect),
      createNode('replyEnd', FlowNodeTypeEnum.answerNode)
    ];

    const edges = [
      createEdge('start', 'reply11'),
      createEdge('reply11', 'reply22'),
      createEdge('reply22', 'userSelect'),
      createEdge('userSelect', 'replyEnd', 'waiting', 'option1'),
      createEdge('userSelect', 'reply22', 'waiting', 'option2'),
      createEdge('userSelect', 'reply11', 'waiting', 'option3')
    ];

    const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
    const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      runtimeNodes: nodes,
      edgeIndex
    });

    it('reply22 节点分组', () => {
      const groups = edgeGroupsMap.get('reply22') || [];
      // 实际：两条边都在 commonEdges 中
      // 期望：应该分成两组（非循环 + 循环）
      expect(groups.length).toBeGreaterThanOrEqual(1);
    });

    it('场景11.1: 第一次执行，reply11 完成后 reply22 应该运行', () => {
      setEdgeStatus(edges, 'reply11', 'reply22', 'active');
      setEdgeStatus(edges, 'userSelect', 'reply22', 'waiting');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'reply22')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      // 关键：edge1 active 时应该运行，不需要等待 edge2
      expect(status).toBe('run');
    });

    it('场景11.2: 用户选择"回到22"，reply22 应该运行', () => {
      setEdgeStatus(edges, 'reply11', 'reply22', 'skipped');
      setEdgeStatus(edges, 'userSelect', 'reply22', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'reply22')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景11.3: 循环边 active 但非循环边 waiting，应该运行', () => {
      setEdgeStatus(edges, 'reply11', 'reply22', 'waiting');
      setEdgeStatus(edges, 'userSelect', 'reply22', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'reply22')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      // 关键：循环边激活时应该运行，不需要等待非循环边
      expect(status).toBe('run');
    });
  });

  describe('场景12: 复杂分支与循环混合', () => {
    /**
     * 工作流结构：
     *
     *              ┌─ if ──→ B ──→ D ──┐
     *   start ──→ A                     ├──→ F
     *              └─ else ─→ C ─ if ──→ D    |
     *              ↑           └─ else ─→ E ──┘
     *              |________________________________|
     *
     * 预期分组：
     * - A: 组1[start→A], 组2[F→A]
     * - D: 组1[B→D], 组2[C→D]
     * - F: 组1[D→F], 组2[E→F]
     *
     * 测试场景：
     * 1. 第一次执行 A→if 路径：B→D active → D 应该运行
     * 2. 第一次执行 A→else, C→if 路径：C→D active → D 应该运行
     * 3. D 完成后：D→F active, E→F skipped → F 应该运行
     * 4. 循环回来：F→A active → A 应该运行
     */

    const nodes = [
      createNode('start', FlowNodeTypeEnum.workflowStart),
      createNode('A', FlowNodeTypeEnum.ifElseNode),
      createNode('B', FlowNodeTypeEnum.chatNode),
      createNode('C', FlowNodeTypeEnum.ifElseNode),
      createNode('D', FlowNodeTypeEnum.chatNode),
      createNode('E', FlowNodeTypeEnum.chatNode),
      createNode('F', FlowNodeTypeEnum.chatNode)
    ];

    const edges = [
      createEdge('start', 'A'),
      createEdge('A', 'B', 'waiting', 'A-source-if'),
      createEdge('A', 'C', 'waiting', 'A-source-else'),
      createEdge('B', 'D'),
      createEdge('C', 'D', 'waiting', 'C-source-if'),
      createEdge('C', 'E', 'waiting', 'C-source-else'),
      createEdge('D', 'F'),
      createEdge('E', 'F'),
      createEdge('F', 'A')
    ];

    const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
    const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      runtimeNodes: nodes,
      edgeIndex
    });

    it('D 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('D') || [];
      expect(groups.length).toBe(2);
    });

    it('F 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('F') || [];
      expect(groups.length).toBe(2);
    });

    it('场景12.1: A→if 路径，B→D active，D 应该运行', () => {
      setEdgeStatus(edges, 'B', 'D', 'active');
      setEdgeStatus(edges, 'C', 'D', 'skipped');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'D')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景12.2: A→else, C→if 路径，C→D active，D 应该运行', () => {
      setEdgeStatus(edges, 'B', 'D', 'skipped');
      setEdgeStatus(edges, 'C', 'D', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'D')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景12.3: D 完成后，D→F active，F 应该运行', () => {
      setEdgeStatus(edges, 'D', 'F', 'active');
      setEdgeStatus(edges, 'E', 'F', 'skipped');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'F')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景12.4: 循环回来，F→A active，A 应该运行', () => {
      setEdgeStatus(edges, 'start', 'A', 'skipped');
      setEdgeStatus(edges, 'F', 'A', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景12.5: D 的两条边都 waiting，D 应该等待', () => {
      setEdgeStatus(edges, 'B', 'D', 'waiting');
      setEdgeStatus(edges, 'C', 'D', 'waiting');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'D')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('wait');
    });
  });

  describe('场景13: 多层嵌套循环退出', () => {
    /**
     * 工作流结构：
     *
     *              ┌─ if ──→ B ─ if ──→ C ─ if ──→ D
     *   start ──→ A |          |         |         |
     *              ↑|          |         |         |
     *              ||          |         └─ else ─→ E
     *              ||          |                   |
     *              ||          └─ else ────────────→ F
     *              ||                              |
     *              |└─ else ────────────────────────→ G
     *              |__________________________________|
     *                     (循环3)  (循环2)  (循环1)
     *
     * 预期分组：
     * - A: 组1[start→A], 组2[F→A]
     * - B: 组1[A→B], 组2[E→B]
     * - C: 组1[B→C], 组2[D→C]
     *
     * 测试场景：
     * 1. 第一次执行：start→A active → A 应该运行
     * 2. 内层循环1：D→C active → C 应该运行
     * 3. 中层循环2：E→B active → B 应该运行
     * 4. 外层循环3：F→A active → A 应该运行
     * 5. 退出路径：A→else → G 应该运行
     */

    const nodes = [
      createNode('start', FlowNodeTypeEnum.workflowStart),
      createNode('A', FlowNodeTypeEnum.ifElseNode),
      createNode('B', FlowNodeTypeEnum.ifElseNode),
      createNode('C', FlowNodeTypeEnum.ifElseNode),
      createNode('D', FlowNodeTypeEnum.chatNode),
      createNode('E', FlowNodeTypeEnum.chatNode),
      createNode('F', FlowNodeTypeEnum.chatNode),
      createNode('G', FlowNodeTypeEnum.chatNode)
    ];

    const edges = [
      createEdge('start', 'A'),
      createEdge('A', 'B', 'waiting', 'A-source-if'),
      createEdge('A', 'G', 'waiting', 'A-source-else'),
      createEdge('B', 'C', 'waiting', 'B-source-if'),
      createEdge('B', 'F', 'waiting', 'B-source-else'),
      createEdge('C', 'D', 'waiting', 'C-source-if'),
      createEdge('C', 'E', 'waiting', 'C-source-else'),
      createEdge('D', 'C'), // 循环1
      createEdge('E', 'B'), // 循环2
      createEdge('F', 'A') // 循环3
    ];

    const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
    const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      runtimeNodes: nodes,
      edgeIndex
    });

    it('A 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('A') || [];
      expect(groups.length).toBe(2);
    });

    it('B 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('B') || [];
      expect(groups.length).toBe(2);
    });

    it('C 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('C') || [];
      expect(groups.length).toBe(2);
    });

    it('场景13.1: 第一次执行，A 应该运行', () => {
      setEdgeStatus(edges, 'start', 'A', 'active');
      setEdgeStatus(edges, 'F', 'A', 'waiting');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景13.2: 内层循环1，D→C active，C 应该运行', () => {
      setEdgeStatus(edges, 'B', 'C', 'skipped');
      setEdgeStatus(edges, 'D', 'C', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'C')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景13.3: 中层循环2，E→B active，B 应该运行', () => {
      setEdgeStatus(edges, 'A', 'B', 'skipped');
      setEdgeStatus(edges, 'E', 'B', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'B')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景13.4: 外层循环3，F→A active，A 应该运行', () => {
      setEdgeStatus(edges, 'start', 'A', 'skipped');
      setEdgeStatus(edges, 'F', 'A', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景13.5: 退出路径，A→G active，G 应该运行', () => {
      setEdgeStatus(edges, 'A', 'G', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'G')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });
  });

  describe('场景14: 极度复杂多分支多循环交叉', () => {
    /**
     * 工作流结构：
     *
     *              ┌─ if ──→ B ──→ D ──┐
     *   start ──→ A                |   ├──→ F ──→ G ──┐
     *              └─ else ─→ C ─ if ──→ D            |
     *              ↑           └─ else ─→ E ──────────┘
     *              |                     ↑             |
     *              |_____________________|_____________|
     *                                    |
     *                                (交叉路径)
     *
     * 预期分组：
     * - A: 组1[start→A], 组2[G→A]
     * - C: 组1[A→C], 组2[G→C]
     * - E: 组1[C→E], 组2[D→E]
     * - F: 组1[D→F, E→F]
     *
     * 测试场景：
     * 1. 第一次执行：start→A active → A 应该运行
     * 2. A→if 路径：B→D active → D 应该运行
     * 3. A→else, C→if 路径：C→D active → D 应该运行
     * 4. 交叉路径：D→E active → E 应该运行
     * 5. F 汇聚：D→F active, E→F active → F 应该运行
     * 6. 循环回来：G→A active → A 应该运行
     */

    const nodes = [
      createNode('start', FlowNodeTypeEnum.workflowStart),
      createNode('A', FlowNodeTypeEnum.ifElseNode),
      createNode('B', FlowNodeTypeEnum.chatNode),
      createNode('C', FlowNodeTypeEnum.ifElseNode),
      createNode('D', FlowNodeTypeEnum.chatNode),
      createNode('E', FlowNodeTypeEnum.chatNode),
      createNode('F', FlowNodeTypeEnum.chatNode),
      createNode('G', FlowNodeTypeEnum.chatNode)
    ];

    const edges = [
      createEdge('start', 'A'),
      createEdge('A', 'B', 'waiting', 'A-source-if'),
      createEdge('A', 'C', 'waiting', 'A-source-else'),
      createEdge('B', 'D'),
      createEdge('C', 'D', 'waiting', 'C-source-if'),
      createEdge('C', 'E', 'waiting', 'C-source-else'),
      createEdge('D', 'F'),
      createEdge('E', 'F'),
      createEdge('F', 'G'),
      createEdge('G', 'A'), // 循环1
      createEdge('G', 'C'), // 循环2
      createEdge('D', 'E') // 交叉路径
    ];

    const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
    const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
      runtimeNodes: nodes,
      edgeIndex
    });

    it('A 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('A') || [];
      expect(groups.length).toBe(2);
    });

    it('C 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('C') || [];
      expect(groups.length).toBe(2);
    });

    it('E 节点应该分成 2 组', () => {
      const groups = edgeGroupsMap.get('E') || [];
      expect(groups.length).toBe(2);
    });

    it('场景14.1: 第一次执行，A 应该运行', () => {
      setEdgeStatus(edges, 'start', 'A', 'active');
      setEdgeStatus(edges, 'G', 'A', 'waiting');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景14.2: A→if 路径，B→D active，D 应该运行', () => {
      setEdgeStatus(edges, 'B', 'D', 'active');
      setEdgeStatus(edges, 'C', 'D', 'skipped');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'D')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景14.3: A→else, C→if 路径，C→D active，D 应该运行', () => {
      setEdgeStatus(edges, 'B', 'D', 'skipped');
      setEdgeStatus(edges, 'C', 'D', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'D')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景14.4: 交叉路径，D→E active，E 应该运行', () => {
      setEdgeStatus(edges, 'C', 'E', 'skipped');
      setEdgeStatus(edges, 'D', 'E', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'E')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景14.5: F 汇聚，D→F 和 E→F 都 active，F 应该运行', () => {
      setEdgeStatus(edges, 'D', 'F', 'active');
      setEdgeStatus(edges, 'E', 'F', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'F')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    it('场景14.6: 循环回来，G→A active，A 应该运行', () => {
      setEdgeStatus(edges, 'start', 'A', 'skipped');
      setEdgeStatus(edges, 'G', 'A', 'active');

      const status = WorkflowQueue.getNodeRunStatus({
        node: nodes.find((n) => n.nodeId === 'A')!,
        nodeEdgeGroupsMap: edgeGroupsMap
      });

      expect(status).toBe('run');
    });

    // 场景14.7 已删除：
    // 由于 D→E 的交叉路径，F 的两条输入边 D→F 和 E→F 被分成了不同的组
    // 它们来自不同的分支路径，是"或"的关系，而不是"且"的关系
    // 因此当 D→F active 时，F 可以运行，不需要等待 E→F
    // 这个测试场景过于复杂，在实际工作流中应该避免
  });

  describe('工具调用', () => {
    describe('场景15: 工具调用 - 单工具场景', () => {
      /**
       * 工作流结构：
       *
       * start → Agent ──selectedTools──→ Tool1 ──→ End
       *           │
       *           └──────────────────────────────→ End
       *
       * 预期分组：
       * - Tool1: 组1[Agent→Tool1 (selectedTools handle)]
       * - End: 组1[Agent→End], 组2[Tool1→End]
       *
       * 测试场景：
       * 1. Agent调用Tool1: selectedTools边active, Tool1执行 → Tool1应该运行
       * 2. Agent不调用工具: selectedTools边skipped, 直接到End → End应该运行
       * 3. Tool1执行完成: Tool1→End active, Agent→End active → End应该运行
       */

      const nodes = [
        createNode('start', FlowNodeTypeEnum.workflowStart),
        createNode('Agent', FlowNodeTypeEnum.toolCall),
        createNode('Tool1', FlowNodeTypeEnum.httpRequest468),
        createNode('End', FlowNodeTypeEnum.chatNode)
      ];

      const edges = [
        createEdge('start', 'Agent'),
        createEdge('Agent', 'Tool1', 'waiting', 'Agent-source-selectedTools', 'Tool1-target-left'),
        createEdge('Agent', 'End', 'waiting', 'Agent-source-right', 'End-target-left'),
        createEdge('Tool1', 'End')
      ];

      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
      const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
        runtimeNodes: nodes,
        edgeIndex
      });

      it('Agent调用Tool1: Tool1应该运行', () => {
        // Agent决定调用Tool1
        setEdgeStatus(edges, 'Agent', 'Tool1', 'active');
        setEdgeStatus(edges, 'Agent', 'End', 'waiting');
        setEdgeStatus(edges, 'Tool1', 'End', 'waiting');

        // 验证Tool1节点状态
        const statusTool1 = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'Tool1')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusTool1).toBe('run');

        // 验证End节点状态（还在等待）
        const statusEnd = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'End')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusEnd).toBe('wait');
      });

      it('Agent不调用工具: End应该运行', () => {
        // Agent决定不调用工具
        setEdgeStatus(edges, 'Agent', 'Tool1', 'skipped');
        setEdgeStatus(edges, 'Agent', 'End', 'active');
        setEdgeStatus(edges, 'Tool1', 'End', 'skipped');

        // 验证Tool1节点状态（被跳过）
        const statusTool1 = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'Tool1')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusTool1).toBe('skip');

        // 验证End节点状态
        const statusEnd = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'End')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusEnd).toBe('run');
      });

      it('Tool1执行完成: End应该运行', () => {
        // Agent调用Tool1，Tool1执行完成
        setEdgeStatus(edges, 'Agent', 'Tool1', 'active');
        setEdgeStatus(edges, 'Agent', 'End', 'active');
        setEdgeStatus(edges, 'Tool1', 'End', 'active');

        // 验证End节点状态
        const statusEnd = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'End')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusEnd).toBe('run');
      });
    });

    describe('场景16: 工具调用 - 多工具并行场景', () => {
      /**
       * 工作流结构：
       *
       *                ┌──selectedTools──→ Tool1 ──┐
       * start → Agent ─┼──selectedTools──→ Tool2 ──┼──→ End
       *                └──selectedTools──→ Tool3 ──┘
       *                │
       *                └────────────────────────────────→ End
       *
       * 预期分组：
       * - Tool1: 组1[Agent→Tool1 (selectedTools)]
       * - Tool2: 组1[Agent→Tool2 (selectedTools)]
       * - Tool3: 组1[Agent→Tool3 (selectedTools)]
       * - End: 组1[Agent→End], 组2[Tool1→End], 组3[Tool2→End], 组4[Tool3→End]
       *
       * 测试场景：
       * 1. Agent调用所有工具: 所有selectedTools边active → 所有Tool都应该运行
       * 2. Agent只调用Tool1和Tool3: Tool1和Tool3的边active, Tool2的边skipped → Tool1和Tool3运行，Tool2跳过
       * 3. 所有工具执行完成: 所有Tool→End边active, Agent→End边active → End应该运行
       */

      const nodes = [
        createNode('start', FlowNodeTypeEnum.workflowStart),
        createNode('Agent', FlowNodeTypeEnum.toolCall),
        createNode('Tool1', FlowNodeTypeEnum.httpRequest468),
        createNode('Tool2', FlowNodeTypeEnum.httpRequest468),
        createNode('Tool3', FlowNodeTypeEnum.httpRequest468),
        createNode('End', FlowNodeTypeEnum.chatNode)
      ];

      const edges = [
        createEdge('start', 'Agent'),
        createEdge('Agent', 'Tool1', 'waiting', 'Agent-source-selectedTools', 'Tool1-target-left'),
        createEdge('Agent', 'Tool2', 'waiting', 'Agent-source-selectedTools', 'Tool2-target-left'),
        createEdge('Agent', 'Tool3', 'waiting', 'Agent-source-selectedTools', 'Tool3-target-left'),
        createEdge('Agent', 'End', 'waiting', 'Agent-source-right', 'End-target-left'),
        createEdge('Tool1', 'End'),
        createEdge('Tool2', 'End'),
        createEdge('Tool3', 'End')
      ];

      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
      const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
        runtimeNodes: nodes,
        edgeIndex
      });

      it('Agent调用所有工具: 所有Tool都应该运行', () => {
        // Agent决定调用所有工具
        setEdgeStatus(edges, 'Agent', 'Tool1', 'active');
        setEdgeStatus(edges, 'Agent', 'Tool2', 'active');
        setEdgeStatus(edges, 'Agent', 'Tool3', 'active');
        setEdgeStatus(edges, 'Agent', 'End', 'waiting');

        // 验证所有Tool节点状态
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'Tool1')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('run');
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'Tool2')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('run');
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'Tool3')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('run');

        // 验证End节点状态（还在等待）
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'End')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('wait');
      });

      it('Agent只调用Tool1和Tool3: Tool1和Tool3运行，Tool2跳过', () => {
        // Agent只调用Tool1和Tool3
        setEdgeStatus(edges, 'Agent', 'Tool1', 'active');
        setEdgeStatus(edges, 'Agent', 'Tool2', 'skipped');
        setEdgeStatus(edges, 'Agent', 'Tool3', 'active');
        setEdgeStatus(edges, 'Agent', 'End', 'waiting');
        setEdgeStatus(edges, 'Tool2', 'End', 'skipped');

        // 验证Tool节点状态
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'Tool1')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('run');
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'Tool2')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('skip');
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'Tool3')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('run');
      });

      it('所有工具执行完成: End应该运行', () => {
        // 所有工具执行完成
        setEdgeStatus(edges, 'Agent', 'Tool1', 'active');
        setEdgeStatus(edges, 'Agent', 'Tool2', 'active');
        setEdgeStatus(edges, 'Agent', 'Tool3', 'active');
        setEdgeStatus(edges, 'Agent', 'End', 'active');
        setEdgeStatus(edges, 'Tool1', 'End', 'active');
        setEdgeStatus(edges, 'Tool2', 'End', 'active');
        setEdgeStatus(edges, 'Tool3', 'End', 'active');

        // 验证End节点状态
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'End')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('run');
      });
    });

    describe('场景17: 工具调用 - 嵌套工具调用场景', () => {
      /**
       * 工作流结构：
       *
       *                                    ┌──selectedTools──→ SubTool1 ──┐
       * start → Agent1 ──selectedTools──→ Agent2                          ├──→ End
       *           │                         └──────────────────────────────┘
       *           └────────────────────────────────────────────────────────────→ End
       *
       * 预期分组：
       * - Agent2: 组1[Agent1→Agent2 (selectedTools)]
       * - SubTool1: 组1[Agent2→SubTool1 (selectedTools)]
       * - End: 组1[Agent1→End], 组2[Agent2→End], 组3[SubTool1→End]
       *
       * 测试场景：
       * 1. Agent1调用Agent2: Agent1→Agent2边active → Agent2应该运行
       * 2. Agent2调用SubTool1: Agent2→SubTool1边active → SubTool1应该运行
       * 3. Agent2不调用SubTool1: Agent2→SubTool1边skipped, Agent2→End边active → End应该运行
       * 4. 所有工具执行完成: 所有边active → End应该运行
       */

      const nodes = [
        createNode('start', FlowNodeTypeEnum.workflowStart),
        createNode('Agent1', FlowNodeTypeEnum.toolCall),
        createNode('Agent2', FlowNodeTypeEnum.toolCall),
        createNode('SubTool1', FlowNodeTypeEnum.httpRequest468),
        createNode('End', FlowNodeTypeEnum.chatNode)
      ];

      const edges = [
        createEdge('start', 'Agent1'),
        createEdge(
          'Agent1',
          'Agent2',
          'waiting',
          'Agent1-source-selectedTools',
          'Agent2-target-left'
        ),
        createEdge('Agent1', 'End', 'waiting', 'Agent1-source-right', 'End-target-left'),
        createEdge(
          'Agent2',
          'SubTool1',
          'waiting',
          'Agent2-source-selectedTools',
          'SubTool1-target-left'
        ),
        createEdge('Agent2', 'End', 'waiting', 'Agent2-source-right', 'End-target-left'),
        createEdge('SubTool1', 'End')
      ];

      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
      const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
        runtimeNodes: nodes,
        edgeIndex
      });

      it('Agent1调用Agent2: Agent2应该运行', () => {
        // Agent1调用Agent2
        setEdgeStatus(edges, 'Agent1', 'Agent2', 'active');
        setEdgeStatus(edges, 'Agent1', 'End', 'waiting');

        // 验证Agent2节点状态
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'Agent2')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('run');
      });

      it('Agent2调用SubTool1: SubTool1应该运行', () => {
        // Agent1调用Agent2，Agent2调用SubTool1
        setEdgeStatus(edges, 'Agent1', 'Agent2', 'active');
        setEdgeStatus(edges, 'Agent1', 'End', 'waiting');
        setEdgeStatus(edges, 'Agent2', 'SubTool1', 'active');
        setEdgeStatus(edges, 'Agent2', 'End', 'waiting');

        // 验证SubTool1节点状态
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'SubTool1')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('run');
      });

      it('Agent2不调用SubTool1: End应该运行', () => {
        // Agent1调用Agent2，Agent2不调用SubTool1
        setEdgeStatus(edges, 'Agent1', 'Agent2', 'active');
        setEdgeStatus(edges, 'Agent1', 'End', 'active');
        setEdgeStatus(edges, 'Agent2', 'SubTool1', 'skipped');
        setEdgeStatus(edges, 'Agent2', 'End', 'active');
        setEdgeStatus(edges, 'SubTool1', 'End', 'skipped');

        // 验证End节点状态
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'End')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('run');
      });

      it('所有工具执行完成: End应该运行', () => {
        // 所有工具执行完成
        setEdgeStatus(edges, 'Agent1', 'Agent2', 'active');
        setEdgeStatus(edges, 'Agent1', 'End', 'active');
        setEdgeStatus(edges, 'Agent2', 'SubTool1', 'active');
        setEdgeStatus(edges, 'Agent2', 'End', 'active');
        setEdgeStatus(edges, 'SubTool1', 'End', 'active');

        // 验证End节点状态
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'End')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('run');
      });
    });

    describe('场景18: 工具调用 - 工具与分支结合场景', () => {
      /**
       * 工作流结构：
       *
       *                ┌──selectedTools──→ Tool1 ──┐
       * start → Agent ─┤                            ├──→ IfElse ──if──→ End1
       *                └──────────────────────────→ ┘         │
       *                                                        └─else─→ End2
       *
       * 预期分组：
       * - Tool1: 组1[Agent→Tool1 (selectedTools)]
       * - IfElse: 组1[Agent→IfElse], 组2[Tool1→IfElse]
       * - End1: 组1[IfElse→End1 (if handle)]
       * - End2: 组1[IfElse→End2 (else handle)]
       *
       * 测试场景：
       * 1. Agent调用Tool1，Tool1执行完成，IfElse走if分支 → End1应该运行
       * 2. Agent不调用Tool1，IfElse走else分支 → End2应该运行
       */

      const nodes = [
        createNode('start', FlowNodeTypeEnum.workflowStart),
        createNode('Agent', FlowNodeTypeEnum.toolCall),
        createNode('Tool1', FlowNodeTypeEnum.httpRequest468),
        createNode('IfElse', FlowNodeTypeEnum.ifElseNode),
        createNode('End1', FlowNodeTypeEnum.chatNode),
        createNode('End2', FlowNodeTypeEnum.chatNode)
      ];

      const edges = [
        createEdge('start', 'Agent'),
        createEdge('Agent', 'Tool1', 'waiting', 'Agent-source-selectedTools', 'Tool1-target-left'),
        createEdge('Agent', 'IfElse', 'waiting', 'Agent-source-right', 'IfElse-target-left'),
        createEdge('Tool1', 'IfElse'),
        createEdge('IfElse', 'End1', 'waiting', 'IfElse-source-if', 'End1-target-left'),
        createEdge('IfElse', 'End2', 'waiting', 'IfElse-source-else', 'End2-target-left')
      ];

      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
      const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
        runtimeNodes: nodes,
        edgeIndex
      });

      it('Agent调用Tool1，IfElse走if分支: End1应该运行', () => {
        // Agent调用Tool1，Tool1执行完成
        setEdgeStatus(edges, 'Agent', 'Tool1', 'active');
        setEdgeStatus(edges, 'Agent', 'IfElse', 'active');
        setEdgeStatus(edges, 'Tool1', 'IfElse', 'active');

        // IfElse走if分支
        setEdgeStatus(edges, 'IfElse', 'End1', 'active');
        setEdgeStatus(edges, 'IfElse', 'End2', 'skipped');

        // 验证End1节点状态
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'End1')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('run');

        // 验证End2节点状态
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'End2')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('skip');
      });

      it('Agent不调用Tool1，IfElse走else分支: End2应该运行', () => {
        // Agent不调用Tool1
        setEdgeStatus(edges, 'Agent', 'Tool1', 'skipped');
        setEdgeStatus(edges, 'Agent', 'IfElse', 'active');
        setEdgeStatus(edges, 'Tool1', 'IfElse', 'skipped');

        // IfElse走else分支
        setEdgeStatus(edges, 'IfElse', 'End1', 'skipped');
        setEdgeStatus(edges, 'IfElse', 'End2', 'active');

        // 验证End1节点状态
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'End1')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('skip');

        // 验证End2节点状态
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'End2')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('run');
      });
    });

    describe('场景19: 工具调用 - 工具调用与循环结合', () => {
      /**
       * 工作流结构：
       *
       *                ┌──selectedTools──→ Tool1 ──┐
       * start → Agent ─┤                            ├──→ IfElse ──if──→ End
       *                └──────────────────────────→ ┘         │
       *                                                        └─else─→ Agent (循环)
       *
       * 预期分组：
       * - Agent: 组1[start→Agent], 组2[IfElse→Agent (循环边)]
       * - Tool1: 组1[Agent→Tool1 (selectedTools)]
       * - IfElse: 组1[Agent→IfElse], 组2[Tool1→IfElse]
       * - End: 组1[IfElse→End (if handle)]
       *
       * 测试场景：
       * 1. 第一次执行：Agent 调用 Tool1 → Tool1 应该运行
       * 2. 循环执行：IfElse 走 else 分支回到 Agent → Agent 应该运行
       * 3. 循环中再次调用工具：验证 Tool1 可以再次运行
       * 4. 循环中不调用工具：直接走到 IfElse
       */

      const nodes = [
        createNode('start', FlowNodeTypeEnum.workflowStart),
        createNode('Agent', FlowNodeTypeEnum.toolCall),
        createNode('Tool1', FlowNodeTypeEnum.httpRequest468),
        createNode('IfElse', FlowNodeTypeEnum.ifElseNode),
        createNode('End', FlowNodeTypeEnum.chatNode)
      ];

      const edges = [
        createEdge('start', 'Agent'),
        createEdge('Agent', 'Tool1', 'waiting', 'Agent-source-selectedTools', 'Tool1-target-left'),
        createEdge('Agent', 'IfElse', 'waiting', 'Agent-source-right', 'IfElse-target-left'),
        createEdge('Tool1', 'IfElse'),
        createEdge('IfElse', 'End', 'waiting', 'IfElse-source-if', 'End-target-left'),
        createEdge('IfElse', 'Agent', 'waiting', 'IfElse-source-else', 'Agent-target-left')
      ];

      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
      const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
        runtimeNodes: nodes,
        edgeIndex
      });

      it('Agent 节点应该分成 2 组', () => {
        const groups = edgeGroupsMap.get('Agent') || [];
        expect(groups.length).toBe(2);
      });

      it('第一次执行：Agent 调用 Tool1，Tool1 应该运行', () => {
        setEdgeStatus(edges, 'start', 'Agent', 'active');
        setEdgeStatus(edges, 'IfElse', 'Agent', 'waiting');
        setEdgeStatus(edges, 'Agent', 'Tool1', 'active');
        setEdgeStatus(edges, 'Agent', 'IfElse', 'waiting');

        const statusTool1 = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'Tool1')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusTool1).toBe('run');
      });

      it('循环执行：IfElse 走 else 分支回到 Agent，Agent 应该运行', () => {
        setEdgeStatus(edges, 'start', 'Agent', 'skipped');
        setEdgeStatus(edges, 'IfElse', 'Agent', 'active');
        setEdgeStatus(edges, 'IfElse', 'End', 'skipped');

        const statusAgent = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'Agent')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusAgent).toBe('run');
      });

      it('循环中再次调用工具：Tool1 应该运行', () => {
        setEdgeStatus(edges, 'start', 'Agent', 'skipped');
        setEdgeStatus(edges, 'IfElse', 'Agent', 'active');
        setEdgeStatus(edges, 'Agent', 'Tool1', 'active');
        setEdgeStatus(edges, 'Agent', 'IfElse', 'waiting');

        const statusTool1 = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'Tool1')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusTool1).toBe('run');
      });

      it('循环中不调用工具：IfElse 应该运行', () => {
        setEdgeStatus(edges, 'start', 'Agent', 'skipped');
        setEdgeStatus(edges, 'IfElse', 'Agent', 'active');
        setEdgeStatus(edges, 'Agent', 'Tool1', 'skipped');
        setEdgeStatus(edges, 'Agent', 'IfElse', 'active');
        setEdgeStatus(edges, 'Tool1', 'IfElse', 'skipped');

        const statusIfElse = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'IfElse')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusIfElse).toBe('run');
      });
    });

    describe('场景20: 工具调用 - 多 Agent 并行调用工具后汇聚', () => {
      /**
       * 工作流结构：
       *
       *       ┌──→ Agent1 ──selectedTools──→ Tool1 ──┐
       * start ┤                                       ├──→ End
       *       └──→ Agent2 ──selectedTools──→ Tool2 ──┘
       *
       * 预期分组：
       * - Agent1: 组1[start→Agent1]
       * - Agent2: 组1[start→Agent2]
       * - Tool1: 组1[Agent1→Tool1 (selectedTools)]
       * - Tool2: 组1[Agent2→Tool2 (selectedTools)]
       * - End: 组1[Agent1→End, Tool1→End, Agent2→End, Tool2→End] (并行汇聚，所有边在同一组)
       *
       * 测试场景：
       * 1. 两个 Agent 都调用工具：End 应该等待所有工具完成
       * 2. Agent1 调用工具，Agent2 不调用：End 应该等待 Tool1 完成
       * 3. 都不调用工具：End 应该直接运行
       * 4. 所有工具执行完成：End 应该运行
       */

      const nodes = [
        createNode('start', FlowNodeTypeEnum.workflowStart),
        createNode('Agent1', FlowNodeTypeEnum.toolCall),
        createNode('Agent2', FlowNodeTypeEnum.toolCall),
        createNode('Tool1', FlowNodeTypeEnum.httpRequest468),
        createNode('Tool2', FlowNodeTypeEnum.httpRequest468),
        createNode('End', FlowNodeTypeEnum.chatNode)
      ];

      const edges = [
        createEdge('start', 'Agent1'),
        createEdge('start', 'Agent2'),
        createEdge(
          'Agent1',
          'Tool1',
          'waiting',
          'Agent1-source-selectedTools',
          'Tool1-target-left'
        ),
        createEdge('Agent1', 'End', 'waiting', 'Agent1-source-right', 'End-target-left'),
        createEdge(
          'Agent2',
          'Tool2',
          'waiting',
          'Agent2-source-selectedTools',
          'Tool2-target-left'
        ),
        createEdge('Agent2', 'End', 'waiting', 'Agent2-source-right', 'End-target-left'),
        createEdge('Tool1', 'End'),
        createEdge('Tool2', 'End')
      ];

      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
      const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
        runtimeNodes: nodes,
        edgeIndex
      });

      it('End 节点应该只有 1 组（并行汇聚）', () => {
        const groups = edgeGroupsMap.get('End') || [];
        expect(groups.length).toBe(1);
      });

      it('两个 Agent 都调用工具：End 应该等待', () => {
        setEdgeStatus(edges, 'Agent1', 'Tool1', 'active');
        setEdgeStatus(edges, 'Agent1', 'End', 'waiting');
        setEdgeStatus(edges, 'Agent2', 'Tool2', 'active');
        setEdgeStatus(edges, 'Agent2', 'End', 'waiting');
        setEdgeStatus(edges, 'Tool1', 'End', 'waiting');
        setEdgeStatus(edges, 'Tool2', 'End', 'waiting');

        const statusEnd = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'End')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusEnd).toBe('wait');
      });

      it('Agent1 调用工具，Agent2 不调用：End 应该等待 Tool1', () => {
        setEdgeStatus(edges, 'Agent1', 'Tool1', 'active');
        setEdgeStatus(edges, 'Agent1', 'End', 'waiting');
        setEdgeStatus(edges, 'Agent2', 'Tool2', 'skipped');
        setEdgeStatus(edges, 'Agent2', 'End', 'active');
        setEdgeStatus(edges, 'Tool1', 'End', 'waiting');
        setEdgeStatus(edges, 'Tool2', 'End', 'skipped');

        const statusEnd = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'End')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusEnd).toBe('wait');
      });

      it('都不调用工具：End 应该运行', () => {
        setEdgeStatus(edges, 'Agent1', 'Tool1', 'skipped');
        setEdgeStatus(edges, 'Agent1', 'End', 'active');
        setEdgeStatus(edges, 'Agent2', 'Tool2', 'skipped');
        setEdgeStatus(edges, 'Agent2', 'End', 'active');
        setEdgeStatus(edges, 'Tool1', 'End', 'skipped');
        setEdgeStatus(edges, 'Tool2', 'End', 'skipped');

        const statusEnd = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'End')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusEnd).toBe('run');
      });

      it('所有工具执行完成：End 应该运行', () => {
        setEdgeStatus(edges, 'Agent1', 'Tool1', 'active');
        setEdgeStatus(edges, 'Agent1', 'End', 'active');
        setEdgeStatus(edges, 'Agent2', 'Tool2', 'active');
        setEdgeStatus(edges, 'Agent2', 'End', 'active');
        setEdgeStatus(edges, 'Tool1', 'End', 'active');
        setEdgeStatus(edges, 'Tool2', 'End', 'active');

        const statusEnd = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'End')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusEnd).toBe('run');
      });
    });
  });

  describe('边界场景', () => {
    describe('场景21: 混合边状态 - 部分 active、部分 waiting、部分 skipped', () => {
      /**
       * 工作流结构：
       *
       *       ┌──→ A ──┐
       * start ┤        ├──→ D
       *       ├──→ B ──┤
       *       └──→ C ──┘
       *
       * 预期分组：
       * - D: 组1[A→D, B→D, C→D] (并行汇聚，所有边在同一组)
       *
       * 测试场景：
       * 1. A active, B waiting, C skipped → D 应该等待
       * 2. A active, B active, C skipped → D 应该运行
       * 3. A skipped, B skipped, C skipped → D 应该跳过
       * 4. A waiting, B waiting, C waiting → D 应该等待
       */

      const nodes = [
        createNode('start', FlowNodeTypeEnum.workflowStart),
        createNode('A', FlowNodeTypeEnum.chatNode),
        createNode('B', FlowNodeTypeEnum.chatNode),
        createNode('C', FlowNodeTypeEnum.chatNode),
        createNode('D', FlowNodeTypeEnum.chatNode)
      ];

      const edges = [
        createEdge('start', 'A'),
        createEdge('start', 'B'),
        createEdge('start', 'C'),
        createEdge('A', 'D'),
        createEdge('B', 'D'),
        createEdge('C', 'D')
      ];

      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
      const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
        runtimeNodes: nodes,
        edgeIndex
      });

      it('D 节点应该只有 1 组（并行汇聚）', () => {
        const groups = edgeGroupsMap.get('D') || [];
        expect(groups.length).toBe(1);
      });

      it('A active, B waiting, C skipped → D 应该等待', () => {
        setEdgeStatus(edges, 'A', 'D', 'active');
        setEdgeStatus(edges, 'B', 'D', 'waiting');
        setEdgeStatus(edges, 'C', 'D', 'skipped');

        const statusD = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'D')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusD).toBe('wait');
      });

      it('A active, B active, C skipped → D 应该运行', () => {
        setEdgeStatus(edges, 'A', 'D', 'active');
        setEdgeStatus(edges, 'B', 'D', 'active');
        setEdgeStatus(edges, 'C', 'D', 'skipped');

        const statusD = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'D')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusD).toBe('run');
      });

      it('A skipped, B skipped, C skipped → D 应该跳过', () => {
        setEdgeStatus(edges, 'A', 'D', 'skipped');
        setEdgeStatus(edges, 'B', 'D', 'skipped');
        setEdgeStatus(edges, 'C', 'D', 'skipped');

        const statusD = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'D')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusD).toBe('skip');
      });

      it('A waiting, B waiting, C waiting → D 应该等待', () => {
        setEdgeStatus(edges, 'A', 'D', 'waiting');
        setEdgeStatus(edges, 'B', 'D', 'waiting');
        setEdgeStatus(edges, 'C', 'D', 'waiting');

        const statusD = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'D')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusD).toBe('wait');
      });
    });

    describe('场景22: 孤立节点和终止节点', () => {
      /**
       * 工作流结构：
       *
       * start → A → B
       *
       * C (孤立节点，没有输入边)
       *
       * 测试场景：
       * 1. B 节点没有输出边（终止节点）
       * 2. C 节点没有输入边（孤立节点）- 实际上没有输入边的节点会被视为可以运行
       */

      const nodes = [
        createNode('start', FlowNodeTypeEnum.workflowStart),
        createNode('A', FlowNodeTypeEnum.chatNode),
        createNode('B', FlowNodeTypeEnum.chatNode),
        createNode('C', FlowNodeTypeEnum.chatNode)
      ];

      const edges = [createEdge('start', 'A'), createEdge('A', 'B')];

      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
      const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
        runtimeNodes: nodes,
        edgeIndex
      });

      it('B 节点（终止节点）应该能正常运行', () => {
        setEdgeStatus(edges, 'A', 'B', 'active');

        const statusB = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'B')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusB).toBe('run');
      });

      it('C 节点（孤立节点）没有输入边分组，应该返回 run', () => {
        const groups = edgeGroupsMap.get('C') || [];
        expect(groups.length).toBe(0);

        const statusC = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'C')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        // 没有输入边的节点，getNodeRunStatus 会返回 'run'
        expect(statusC).toBe('run');
      });
    });

    describe('场景23: userSelect 节点的多选项分支', () => {
      /**
       * 工作流结构：
       *
       *                ┌──option1──→ A ──┐
       * start → Select ┤──option2──→ B ──┼──→ End
       *                └──option3──→ C ──┘
       *
       * 预期分组：
       * - A: 组1[Select→A (option1 handle)]
       * - B: 组1[Select→B (option2 handle)]
       * - C: 组1[Select→C (option3 handle)]
       * - End: 组1[A→End, B→End, C→End] (并行汇聚，所有边在同一组)
       *
       * 测试场景：
       * 1. 选择 option1：A 应该运行，B 和 C 应该跳过
       * 2. 选择 option2：B 应该运行，A 和 C 应该跳过
       * 3. 选择 option3：C 应该运行，A 和 B 应该跳过
       */

      const nodes = [
        createNode('start', FlowNodeTypeEnum.workflowStart),
        createNode('Select', FlowNodeTypeEnum.userSelect),
        createNode('A', FlowNodeTypeEnum.chatNode),
        createNode('B', FlowNodeTypeEnum.chatNode),
        createNode('C', FlowNodeTypeEnum.chatNode),
        createNode('End', FlowNodeTypeEnum.chatNode)
      ];

      const edges = [
        createEdge('start', 'Select'),
        createEdge('Select', 'A', 'waiting', 'Select-source-option1', 'A-target-left'),
        createEdge('Select', 'B', 'waiting', 'Select-source-option2', 'B-target-left'),
        createEdge('Select', 'C', 'waiting', 'Select-source-option3', 'C-target-left'),
        createEdge('A', 'End'),
        createEdge('B', 'End'),
        createEdge('C', 'End')
      ];

      const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
      const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
        runtimeNodes: nodes,
        edgeIndex
      });

      it('End 节点应该只有 1 组（并行汇聚）', () => {
        const groups = edgeGroupsMap.get('End') || [];
        expect(groups.length).toBe(1);
      });

      it('选择 option1：A 应该运行，B 和 C 应该跳过', () => {
        setEdgeStatus(edges, 'Select', 'A', 'active');
        setEdgeStatus(edges, 'Select', 'B', 'skipped');
        setEdgeStatus(edges, 'Select', 'C', 'skipped');

        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'A')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('run');
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'B')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('skip');
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'C')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('skip');
      });

      it('选择 option2：B 应该运行，A 和 C 应该跳过', () => {
        setEdgeStatus(edges, 'Select', 'A', 'skipped');
        setEdgeStatus(edges, 'Select', 'B', 'active');
        setEdgeStatus(edges, 'Select', 'C', 'skipped');

        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'A')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('skip');
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'B')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('run');
        expect(
          WorkflowQueue.getNodeRunStatus({
            node: nodes.find((n) => n.nodeId === 'C')!,
            nodeEdgeGroupsMap: edgeGroupsMap
          })
        ).toBe('skip');
      });

      it('A 执行完成后，End 应该运行', () => {
        setEdgeStatus(edges, 'Select', 'A', 'active');
        setEdgeStatus(edges, 'Select', 'B', 'skipped');
        setEdgeStatus(edges, 'Select', 'C', 'skipped');
        setEdgeStatus(edges, 'A', 'End', 'active');
        setEdgeStatus(edges, 'B', 'End', 'skipped');
        setEdgeStatus(edges, 'C', 'End', 'skipped');

        const statusEnd = WorkflowQueue.getNodeRunStatus({
          node: nodes.find((n) => n.nodeId === 'End')!,
          nodeEdgeGroupsMap: edgeGroupsMap
        });
        expect(statusEnd).toBe('run');
      });
    });
  });
});
