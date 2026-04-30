import { describe, it, expect } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowQueue } from '@fastgpt/service/core/workflow/dispatch/index';
import { createNode, createEdge, setEdgeStatus } from '../../utils';

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
