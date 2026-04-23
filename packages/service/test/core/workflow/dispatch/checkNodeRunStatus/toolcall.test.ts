import { describe, it, expect } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowQueue } from '@fastgpt/service/core/workflow/dispatch/index';
import { createNode, createEdge, setEdgeStatus } from '../../utils';

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
    createEdge('Agent1', 'Agent2', 'waiting', 'Agent1-source-selectedTools', 'Agent2-target-left'),
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
    createEdge('Agent1', 'Tool1', 'waiting', 'Agent1-source-selectedTools', 'Tool1-target-left'),
    createEdge('Agent1', 'End', 'waiting', 'Agent1-source-right', 'End-target-left'),
    createEdge('Agent2', 'Tool2', 'waiting', 'Agent2-source-selectedTools', 'Tool2-target-left'),
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
