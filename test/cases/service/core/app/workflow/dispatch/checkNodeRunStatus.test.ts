/**
 * checkNodeRunStatus 测试用例
 *
 * 测试目标函数: checkNodeRunStatus - 工作流节点运行状态检查
 *
 * 测试覆盖范围:
 * 1. 基础场景 (7个测试)
 *    - 简单串行流程
 *    - 并行流程
 *    - 简单分支
 *    - 简单循环
 *    - 带循环退出的流程
 *    - 条件分支+循环组合
 *    - 多条件分支+多循环
 *
 * 2. 复杂场景 (7个测试)
 *    - 多层分支嵌套(菱形嵌套)
 *    - 嵌套循环(循环内循环)
 *    - 多个独立循环汇聚
 *    - 复杂有向有环图(多入口多循环)
 *    - 复杂分支与循环混合
 *    - 多层嵌套循环退出(三层循环条件退出)
 *    - 极度复杂多分支多循环交叉(双分支+双循环+交叉路径)
 *
 * 3. 边界情况 (4个测试)
 *    - 入口节点无输入边
 *    - 自循环节点
 *    - 所有输入边都被跳过
 *    - 递归边组部分激活
 *
 * 测试要点:
 * - 边状态: waiting(等待), active(激活), skipped(跳过)
 * - 节点状态: run(运行), wait(等待), skip(跳过)
 * - 循环检测: commonEdges(普通边) vs recursiveEdgeGroups(递归边组)
 * - 多路径汇聚: 需要所有输入路径满足条件才能运行
 */

import { describe, it, expect } from 'vitest';
import { checkNodeRunStatus } from '@fastgpt/global/core/workflow/runtime/utils';
import type {
  RuntimeNodeItemType,
  RuntimeEdgeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

// 辅助函数：创建测试节点
const createNode = (
  nodeId: string,
  flowNodeType: FlowNodeTypeEnum = FlowNodeTypeEnum.pluginInput
): RuntimeNodeItemType => ({
  nodeId,
  name: `Node ${nodeId}`,
  avatar: '',
  flowNodeType,
  showStatus: true,
  isEntry: false,
  inputs: [],
  outputs: []
});

// 辅助函数：创建测试边
const createEdge = (
  source: string,
  target: string,
  status: 'waiting' | 'active' | 'skipped' = 'waiting'
): RuntimeEdgeItemType => ({
  source,
  target,
  status,
  sourceHandle: 'source',
  targetHandle: 'target'
});

describe('checkNodeRunStatus - 基础场景测试', () => {
  it('场景1: 简单串行流程 (A → B → C)', () => {
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const nodeA = createNode('A');
    const nodeB = createNode('B');
    const nodeC = createNode('C');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['A', nodeA],
      ['B', nodeB],
      ['C', nodeC]
    ]);

    // 测试初始状态：start已激活
    const edges1: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'waiting'),
      createEdge('B', 'C', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeA, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeB, runtimeEdges: edges1 })).toBe('wait');
    expect(checkNodeRunStatus({ nodesMap, node: nodeC, runtimeEdges: edges1 })).toBe('wait');

    // 测试A完成后
    const edges2: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('B', 'C', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeB, runtimeEdges: edges2 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeC, runtimeEdges: edges2 })).toBe('wait');
  });

  it('场景2: 并行流程 (A → B, A → C, B → D, C → D)', () => {
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const nodeA = createNode('A');
    const nodeB = createNode('B');
    const nodeC = createNode('C');
    const nodeD = createNode('D');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['A', nodeA],
      ['B', nodeB],
      ['C', nodeC],
      ['D', nodeD]
    ]);

    // A完成后，B和C都应该可以运行
    const edges1: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('A', 'C', 'active'),
      createEdge('B', 'D', 'waiting'),
      createEdge('C', 'D', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeB, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeC, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeD, runtimeEdges: edges1 })).toBe('wait');

    // B完成但C未完成，D仍需等待
    const edges2: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('A', 'C', 'active'),
      createEdge('B', 'D', 'active'),
      createEdge('C', 'D', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeD, runtimeEdges: edges2 })).toBe('wait');

    // B和C都完成，D可以运行
    const edges3: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('A', 'C', 'active'),
      createEdge('B', 'D', 'active'),
      createEdge('C', 'D', 'active')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeD, runtimeEdges: edges3 })).toBe('run');
  });

  it('场景3: 简单分支 (A → B → D, A → C → D)', () => {
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const nodeA = createNode('A');
    const nodeB = createNode('B');
    const nodeC = createNode('C');
    const nodeD = createNode('D');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['A', nodeA],
      ['B', nodeB],
      ['C', nodeC],
      ['D', nodeD]
    ]);

    // 上分支激活
    const edges1: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('A', 'C', 'skipped'),
      createEdge('B', 'D', 'active'),
      createEdge('C', 'D', 'skipped')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeB, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeC, runtimeEdges: edges1 })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: nodeD, runtimeEdges: edges1 })).toBe('run');
  });

  it('场景4: 简单循环 (A → B → C → A)', () => {
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const nodeA = createNode('A');
    const nodeB = createNode('B');
    const nodeC = createNode('C');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['A', nodeA],
      ['B', nodeB],
      ['C', nodeC]
    ]);

    // 第一次循环：初始状态，循环边是waiting
    // 注意：循环边C→A会被当作commonEdge,因为可以通过start→A到达
    // 当有waiting边时,节点会等待
    const edges1: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'waiting'),
      createEdge('B', 'C', 'waiting'),
      createEdge('C', 'A', 'waiting')
    ];

    // A有一条active边和一条waiting边,需要等待
    expect(checkNodeRunStatus({ nodesMap, node: nodeA, runtimeEdges: edges1 })).toBe('wait');
    expect(checkNodeRunStatus({ nodesMap, node: nodeB, runtimeEdges: edges1 })).toBe('wait');

    // 第一次循环：需要将循环边设为skipped,这样A才能运行
    const edges1_2: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'waiting'),
      createEdge('B', 'C', 'waiting'),
      createEdge('C', 'A', 'skipped') // 循环边跳过,才能让A运行
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeA, runtimeEdges: edges1_2 })).toBe('run');

    // A完成后,B可以运行
    const edges1_3: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('B', 'C', 'waiting'),
      createEdge('C', 'A', 'skipped')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeB, runtimeEdges: edges1_3 })).toBe('run');

    // 第二次循环开始：所有边都active
    const edges2: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('B', 'C', 'active'),
      createEdge('C', 'A', 'active')
    ];

    // A有两条active边,可以运行
    expect(checkNodeRunStatus({ nodesMap, node: nodeA, runtimeEdges: edges2 })).toBe('run');
  });

  it('场景5: 带循环退出的流程 (A → B → C → A, B → D)', () => {
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const nodeA = createNode('A');
    const nodeB = createNode('B');
    const nodeC = createNode('C');
    const nodeD = createNode('D');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['A', nodeA],
      ['B', nodeB],
      ['C', nodeC],
      ['D', nodeD]
    ]);

    // 循环中
    const edges1: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('B', 'C', 'active'),
      createEdge('B', 'D', 'skipped'),
      createEdge('C', 'A', 'active')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeA, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeD, runtimeEdges: edges1 })).toBe('skip');

    // 循环退出
    const edges2: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('B', 'C', 'skipped'),
      createEdge('B', 'D', 'active'),
      createEdge('C', 'A', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeC, runtimeEdges: edges2 })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: nodeD, runtimeEdges: edges2 })).toBe('run');
  });

  it('场景6: 条件分支+循环组合 (开始 → Node1 → Branch1/Node2 → 并行 → Node3 → Node1)', () => {
    // 开始 → Node1 → Branch1 (If条件) → 条件1
    //              ↘ Node2 (Else分支) → 并行
    // Branch1 → 并行 (汇聚)
    // 并行 → Node3 → Node1 (循环回去)
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const node1 = createNode('node1');
    const branch1 = createNode('branch1');
    const condition1 = createNode('condition1');
    const node2 = createNode('node2');
    const parallel = createNode('parallel');
    const node3 = createNode('node3');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['node1', node1],
      ['branch1', branch1],
      ['condition1', condition1],
      ['node2', node2],
      ['parallel', parallel],
      ['node3', node3]
    ]);

    // 场景1: 第一次执行,走If分支
    const edges1: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'branch1', 'active'), // If分支
      createEdge('node1', 'node2', 'skipped'), // Else分支
      createEdge('branch1', 'condition1', 'active'),
      createEdge('branch1', 'parallel', 'active'),
      createEdge('node2', 'parallel', 'skipped'),
      createEdge('parallel', 'node3', 'waiting'),
      createEdge('node3', 'node1', 'waiting') // 循环边
    ];

    expect(checkNodeRunStatus({ nodesMap, node: node1, runtimeEdges: edges1 })).toBe('wait');
    expect(checkNodeRunStatus({ nodesMap, node: branch1, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node2, runtimeEdges: edges1 })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: condition1, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: parallel, runtimeEdges: edges1 })).toBe('run');

    // 场景2: 走Else分支
    const edges2: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'branch1', 'skipped'), // If分支
      createEdge('node1', 'node2', 'active'), // Else分支
      createEdge('branch1', 'condition1', 'skipped'),
      createEdge('branch1', 'parallel', 'skipped'),
      createEdge('node2', 'parallel', 'active'),
      createEdge('parallel', 'node3', 'waiting'),
      createEdge('node3', 'node1', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: branch1, runtimeEdges: edges2 })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: node2, runtimeEdges: edges2 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: parallel, runtimeEdges: edges2 })).toBe('run');

    // 场景3: 循环回去,第二次执行(走If分支)
    const edges3: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'branch1', 'active'),
      createEdge('node1', 'node2', 'skipped'),
      createEdge('branch1', 'condition1', 'active'),
      createEdge('branch1', 'parallel', 'active'),
      createEdge('node2', 'parallel', 'skipped'),
      createEdge('parallel', 'node3', 'active'),
      createEdge('node3', 'node1', 'active') // 循环边激活
    ];

    // Node1有来自start和node3的边,都是active
    expect(checkNodeRunStatus({ nodesMap, node: node1, runtimeEdges: edges3 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node3, runtimeEdges: edges3 })).toBe('run');

    // 场景4: 循环退出(循环边跳过)
    const edges4: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'branch1', 'active'),
      createEdge('node1', 'node2', 'skipped'),
      createEdge('branch1', 'condition1', 'active'),
      createEdge('branch1', 'parallel', 'active'),
      createEdge('node2', 'parallel', 'skipped'),
      createEdge('parallel', 'node3', 'active'),
      createEdge('node3', 'node1', 'skipped') // 循环退出
    ];

    expect(checkNodeRunStatus({ nodesMap, node: node1, runtimeEdges: edges4 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node3, runtimeEdges: edges4 })).toBe('run');
  });

  it('场景7: 多条件分支+多循环 (开始 → Node1 → Branch1/Branch2/Node2 → 并行1/并行2 → Node3/Node4 → Node1)', () => {
    // 开始 → Node1 → Branch1 (If条件1) → 条件1 → 并行1
    //              → Branch2 (If条件2) → 条件2 → 并行2
    //              → Node2 (Else) → 并行1 和 并行2
    // 并行1 → Node3 → Node1 (循环1)
    // 并行2 → Node4 → Node1 (循环2)
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const node1 = createNode('node1');
    const branch1 = createNode('branch1');
    const branch2 = createNode('branch2');
    const condition1 = createNode('condition1');
    const condition2 = createNode('condition2');
    const node2 = createNode('node2');
    const parallel1 = createNode('parallel1');
    const parallel2 = createNode('parallel2');
    const node3 = createNode('node3');
    const node4 = createNode('node4');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['node1', node1],
      ['branch1', branch1],
      ['branch2', branch2],
      ['condition1', condition1],
      ['condition2', condition2],
      ['node2', node2],
      ['parallel1', parallel1],
      ['parallel2', parallel2],
      ['node3', node3],
      ['node4', node4]
    ]);

    // 场景1: 第一次执行,走Branch1分支
    const edges1: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'branch1', 'active'), // If条件1
      createEdge('node1', 'branch2', 'skipped'), // If条件2
      createEdge('node1', 'node2', 'skipped'), // Else
      createEdge('branch1', 'condition1', 'active'),
      createEdge('branch1', 'parallel1', 'active'),
      createEdge('branch2', 'condition2', 'skipped'),
      createEdge('branch2', 'parallel2', 'skipped'),
      createEdge('node2', 'parallel1', 'skipped'),
      createEdge('node2', 'parallel2', 'skipped'),
      createEdge('parallel1', 'node3', 'waiting'),
      createEdge('parallel2', 'node4', 'waiting'),
      createEdge('node3', 'node1', 'waiting'), // 循环1
      createEdge('node4', 'node1', 'waiting') // 循环2
    ];

    expect(checkNodeRunStatus({ nodesMap, node: node1, runtimeEdges: edges1 })).toBe('wait');
    expect(checkNodeRunStatus({ nodesMap, node: branch1, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: branch2, runtimeEdges: edges1 })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: node2, runtimeEdges: edges1 })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: condition1, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: parallel1, runtimeEdges: edges1 })).toBe('run');

    // 场景2: 走Branch2分支
    const edges2: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'branch1', 'skipped'),
      createEdge('node1', 'branch2', 'active'), // If条件2
      createEdge('node1', 'node2', 'skipped'),
      createEdge('branch1', 'condition1', 'skipped'),
      createEdge('branch1', 'parallel1', 'skipped'),
      createEdge('branch2', 'condition2', 'active'),
      createEdge('branch2', 'parallel2', 'active'),
      createEdge('node2', 'parallel1', 'skipped'),
      createEdge('node2', 'parallel2', 'skipped'),
      createEdge('parallel1', 'node3', 'waiting'),
      createEdge('parallel2', 'node4', 'waiting'),
      createEdge('node3', 'node1', 'waiting'),
      createEdge('node4', 'node1', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: branch1, runtimeEdges: edges2 })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: branch2, runtimeEdges: edges2 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: condition2, runtimeEdges: edges2 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: parallel2, runtimeEdges: edges2 })).toBe('run');

    // 场景3: 走Else分支,Node2连接到两个并行节点
    const edges3: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'branch1', 'skipped'),
      createEdge('node1', 'branch2', 'skipped'),
      createEdge('node1', 'node2', 'active'), // Else
      createEdge('branch1', 'condition1', 'skipped'),
      createEdge('branch1', 'parallel1', 'skipped'),
      createEdge('branch2', 'condition2', 'skipped'),
      createEdge('branch2', 'parallel2', 'skipped'),
      createEdge('node2', 'parallel1', 'active'),
      createEdge('node2', 'parallel2', 'active'),
      createEdge('parallel1', 'node3', 'waiting'),
      createEdge('parallel2', 'node4', 'waiting'),
      createEdge('node3', 'node1', 'waiting'),
      createEdge('node4', 'node1', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: node2, runtimeEdges: edges3 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: parallel1, runtimeEdges: edges3 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: parallel2, runtimeEdges: edges3 })).toBe('run');

    // 场景4: 循环1激活,循环2等待
    const edges4: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'branch1', 'active'),
      createEdge('node1', 'branch2', 'skipped'),
      createEdge('node1', 'node2', 'skipped'),
      createEdge('branch1', 'condition1', 'active'),
      createEdge('branch1', 'parallel1', 'active'),
      createEdge('branch2', 'condition2', 'skipped'),
      createEdge('branch2', 'parallel2', 'skipped'),
      createEdge('node2', 'parallel1', 'skipped'),
      createEdge('node2', 'parallel2', 'skipped'),
      createEdge('parallel1', 'node3', 'active'),
      createEdge('parallel2', 'node4', 'waiting'),
      createEdge('node3', 'node1', 'active'), // 循环1激活
      createEdge('node4', 'node1', 'waiting') // 循环2等待
    ];

    // Node1有start(active)和node3(active)两条active边,但还有node4(waiting)
    expect(checkNodeRunStatus({ nodesMap, node: node1, runtimeEdges: edges4 })).toBe('wait');
    expect(checkNodeRunStatus({ nodesMap, node: node3, runtimeEdges: edges4 })).toBe('run');

    // 场景5: 两个循环都激活
    const edges5: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'branch1', 'skipped'),
      createEdge('node1', 'branch2', 'skipped'),
      createEdge('node1', 'node2', 'active'),
      createEdge('branch1', 'condition1', 'skipped'),
      createEdge('branch1', 'parallel1', 'skipped'),
      createEdge('branch2', 'condition2', 'skipped'),
      createEdge('branch2', 'parallel2', 'skipped'),
      createEdge('node2', 'parallel1', 'active'),
      createEdge('node2', 'parallel2', 'active'),
      createEdge('parallel1', 'node3', 'active'),
      createEdge('parallel2', 'node4', 'active'),
      createEdge('node3', 'node1', 'active'), // 循环1激活
      createEdge('node4', 'node1', 'active') // 循环2激活
    ];

    // Node1有start, node3, node4三条active边
    expect(checkNodeRunStatus({ nodesMap, node: node1, runtimeEdges: edges5 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node3, runtimeEdges: edges5 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node4, runtimeEdges: edges5 })).toBe('run');

    // 场景6: 循环退出,一个循环active一个skipped
    const edges6: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'branch1', 'active'),
      createEdge('node1', 'branch2', 'skipped'),
      createEdge('node1', 'node2', 'skipped'),
      createEdge('branch1', 'condition1', 'active'),
      createEdge('branch1', 'parallel1', 'active'),
      createEdge('branch2', 'condition2', 'skipped'),
      createEdge('branch2', 'parallel2', 'skipped'),
      createEdge('node2', 'parallel1', 'skipped'),
      createEdge('node2', 'parallel2', 'skipped'),
      createEdge('parallel1', 'node3', 'active'),
      createEdge('parallel2', 'node4', 'skipped'),
      createEdge('node3', 'node1', 'active'), // 循环1激活
      createEdge('node4', 'node1', 'skipped') // 循环2跳过
    ];

    // Node1有start(active), node3(active), node4(skipped)
    expect(checkNodeRunStatus({ nodesMap, node: node1, runtimeEdges: edges6 })).toBe('run');
  });
});

describe('checkNodeRunStatus - 复杂场景测试', () => {
  it('复杂1: 多层分支嵌套 (菱形嵌套)', () => {
    // Start → A → B1 → C1 → E
    //            ↘ B2 → C2 ↗
    //       A → D1 → F1 → E
    //            ↘ D2 → F2 ↗
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const nodeA = createNode('A');
    const nodeB1 = createNode('B1');
    const nodeB2 = createNode('B2');
    const nodeC1 = createNode('C1');
    const nodeC2 = createNode('C2');
    const nodeD1 = createNode('D1');
    const nodeD2 = createNode('D2');
    const nodeF1 = createNode('F1');
    const nodeF2 = createNode('F2');
    const nodeE = createNode('E');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['A', nodeA],
      ['B1', nodeB1],
      ['B2', nodeB2],
      ['C1', nodeC1],
      ['C2', nodeC2],
      ['D1', nodeD1],
      ['D2', nodeD2],
      ['F1', nodeF1],
      ['F2', nodeF2],
      ['E', nodeE]
    ]);

    // 上分支的上路径激活
    const edges: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B1', 'active'),
      createEdge('A', 'B2', 'skipped'),
      createEdge('B1', 'C1', 'active'),
      createEdge('B2', 'C2', 'skipped'),
      createEdge('C1', 'E', 'active'),
      createEdge('C2', 'E', 'skipped'),
      createEdge('A', 'D1', 'skipped'),
      createEdge('A', 'D2', 'skipped'),
      createEdge('D1', 'F1', 'skipped'),
      createEdge('D2', 'F2', 'skipped'),
      createEdge('F1', 'E', 'skipped'),
      createEdge('F2', 'E', 'skipped')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeB1, runtimeEdges: edges })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeB2, runtimeEdges: edges })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: nodeC1, runtimeEdges: edges })).toBe('run');
    // E节点有一条active边，其他全是skipped，应该可以运行
    expect(checkNodeRunStatus({ nodesMap, node: nodeE, runtimeEdges: edges })).toBe('run');
  });

  it('复杂2: 嵌套循环 (A → B → C → B, C → D → E → D)', () => {
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const nodeA = createNode('A');
    const nodeB = createNode('B');
    const nodeC = createNode('C');
    const nodeD = createNode('D');
    const nodeE = createNode('E');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['A', nodeA],
      ['B', nodeB],
      ['C', nodeC],
      ['D', nodeD],
      ['E', nodeE]
    ]);

    // 外层循环第一次，内层循环第二次
    const edges: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('B', 'C', 'active'),
      createEdge('C', 'B', 'active'), // 外层循环边
      createEdge('C', 'D', 'active'),
      createEdge('D', 'E', 'active'),
      createEdge('E', 'D', 'active') // 内层循环边
    ];

    // B节点：有来自start的普通边和来自C的递归边
    expect(checkNodeRunStatus({ nodesMap, node: nodeB, runtimeEdges: edges })).toBe('run');

    // D节点：有来自C的递归边组
    expect(checkNodeRunStatus({ nodesMap, node: nodeD, runtimeEdges: edges })).toBe('run');
  });

  it('复杂3: 多个独立循环汇聚 (A → B → A, C → D → C, A → E, D → E)', () => {
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const nodeA = createNode('A');
    const nodeB = createNode('B');
    const nodeC = createNode('C');
    const nodeD = createNode('D');
    const nodeE = createNode('E');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['A', nodeA],
      ['B', nodeB],
      ['C', nodeC],
      ['D', nodeD],
      ['E', nodeE]
    ]);

    // 两个循环都在运行，但都未退出到E
    const edges1: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('B', 'A', 'active'),
      createEdge('A', 'E', 'waiting'),
      createEdge('start', 'C', 'active'),
      createEdge('C', 'D', 'active'),
      createEdge('D', 'C', 'active'),
      createEdge('D', 'E', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeA, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeC, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeE, runtimeEdges: edges1 })).toBe('wait');

    // 第一个循环退出，第二个循环继续
    const edges2: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('B', 'A', 'skipped'),
      createEdge('A', 'E', 'active'),
      createEdge('start', 'C', 'active'),
      createEdge('C', 'D', 'active'),
      createEdge('D', 'C', 'active'),
      createEdge('D', 'E', 'skipped') // 这条路径还未完成，应该是skipped而不是waiting
    ];

    // E有一条active边和一条skipped边，应该可以运行
    expect(checkNodeRunStatus({ nodesMap, node: nodeE, runtimeEdges: edges2 })).toBe('run');

    // 两个循环都退出
    const edges3: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('B', 'A', 'skipped'),
      createEdge('A', 'E', 'active'),
      createEdge('start', 'C', 'active'),
      createEdge('C', 'D', 'active'),
      createEdge('D', 'C', 'skipped'),
      createEdge('D', 'E', 'active')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeE, runtimeEdges: edges3 })).toBe('run');
  });

  it('复杂4: 复杂有向有环图 (多入口多循环)', () => {
    // Start1 → A → B → C → A
    // Start2 → D → C
    // C → E → F → E
    // E → G
    const nodeStart1 = createNode('start1', FlowNodeTypeEnum.workflowStart);
    const nodeStart2 = createNode('start2', FlowNodeTypeEnum.workflowStart);
    const nodeA = createNode('A');
    const nodeB = createNode('B');
    const nodeC = createNode('C');
    const nodeD = createNode('D');
    const nodeE = createNode('E');
    const nodeF = createNode('F');
    const nodeG = createNode('G');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start1', nodeStart1],
      ['start2', nodeStart2],
      ['A', nodeA],
      ['B', nodeB],
      ['C', nodeC],
      ['D', nodeD],
      ['E', nodeE],
      ['F', nodeF],
      ['G', nodeG]
    ]);

    // 第一个循环在运行，第二条路径也激活
    const edges1: RuntimeEdgeItemType[] = [
      createEdge('start1', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('B', 'C', 'active'),
      createEdge('C', 'A', 'active'), // 第一个循环
      createEdge('start2', 'D', 'active'),
      createEdge('D', 'C', 'active'),
      createEdge('C', 'E', 'waiting'),
      createEdge('E', 'F', 'waiting'),
      createEdge('F', 'E', 'waiting'), // 第二个循环
      createEdge('E', 'G', 'waiting')
    ];

    // A有普通边(start1→A)和递归边(C→B→A)
    expect(checkNodeRunStatus({ nodesMap, node: nodeA, runtimeEdges: edges1 })).toBe('run');

    // C有来自两个路径的输入
    expect(checkNodeRunStatus({ nodesMap, node: nodeC, runtimeEdges: edges1 })).toBe('run');

    // 两个循环都退出，进入第二个循环
    const edges2: RuntimeEdgeItemType[] = [
      createEdge('start1', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('B', 'C', 'active'),
      createEdge('C', 'A', 'skipped'),
      createEdge('start2', 'D', 'active'),
      createEdge('D', 'C', 'active'),
      createEdge('C', 'E', 'active'),
      createEdge('E', 'F', 'active'),
      createEdge('F', 'E', 'active'), // 第二个循环
      createEdge('E', 'G', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeE, runtimeEdges: edges2 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeG, runtimeEdges: edges2 })).toBe('wait');

    // 第二个循环也退出
    const edges3: RuntimeEdgeItemType[] = [
      createEdge('start1', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('B', 'C', 'active'),
      createEdge('C', 'A', 'skipped'),
      createEdge('start2', 'D', 'active'),
      createEdge('D', 'C', 'active'),
      createEdge('C', 'E', 'active'),
      createEdge('E', 'F', 'active'),
      createEdge('F', 'E', 'skipped'),
      createEdge('E', 'G', 'active')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeG, runtimeEdges: edges3 })).toBe('run');
  });

  it('复杂5: 复杂分支与循环混合 (条件分支+循环+汇聚)', () => {
    // Start → A → B (条件分支)
    //         A → C (条件分支)
    // B → D → E → D (循环)
    // C → F → G → F (循环)
    // E → H
    // G → H
    // H → I
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const nodeA = createNode('A');
    const nodeB = createNode('B');
    const nodeC = createNode('C');
    const nodeD = createNode('D');
    const nodeE = createNode('E');
    const nodeF = createNode('F');
    const nodeG = createNode('G');
    const nodeH = createNode('H');
    const nodeI = createNode('I');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['A', nodeA],
      ['B', nodeB],
      ['C', nodeC],
      ['D', nodeD],
      ['E', nodeE],
      ['F', nodeF],
      ['G', nodeG],
      ['H', nodeH],
      ['I', nodeI]
    ]);

    // 走B分支，D-E循环中
    const edges1: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('A', 'C', 'skipped'),
      createEdge('B', 'D', 'active'),
      createEdge('D', 'E', 'active'),
      createEdge('E', 'D', 'active'), // 循环
      createEdge('E', 'H', 'waiting'),
      createEdge('C', 'F', 'skipped'),
      createEdge('F', 'G', 'waiting'),
      createEdge('G', 'F', 'waiting'), // 循环
      createEdge('G', 'H', 'skipped'),
      createEdge('H', 'I', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeB, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeC, runtimeEdges: edges1 })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: nodeD, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeH, runtimeEdges: edges1 })).toBe('wait');

    // B分支循环退出
    const edges2: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('A', 'C', 'skipped'),
      createEdge('B', 'D', 'active'),
      createEdge('D', 'E', 'active'),
      createEdge('E', 'D', 'skipped'),
      createEdge('E', 'H', 'active'),
      createEdge('C', 'F', 'skipped'),
      createEdge('F', 'G', 'waiting'),
      createEdge('G', 'F', 'waiting'),
      createEdge('G', 'H', 'skipped'),
      createEdge('H', 'I', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeH, runtimeEdges: edges2 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeI, runtimeEdges: edges2 })).toBe('wait');

    // H完成，I可以运行
    const edges3: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('A', 'C', 'skipped'),
      createEdge('B', 'D', 'active'),
      createEdge('D', 'E', 'active'),
      createEdge('E', 'D', 'skipped'),
      createEdge('E', 'H', 'active'),
      createEdge('C', 'F', 'skipped'),
      createEdge('F', 'G', 'waiting'),
      createEdge('G', 'F', 'waiting'),
      createEdge('G', 'H', 'skipped'),
      createEdge('H', 'I', 'active')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeI, runtimeEdges: edges3 })).toBe('run');

    // 走C分支场景
    const edges4: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'skipped'),
      createEdge('A', 'C', 'active'),
      createEdge('B', 'D', 'skipped'),
      createEdge('D', 'E', 'waiting'),
      createEdge('E', 'D', 'waiting'),
      createEdge('E', 'H', 'waiting'),
      createEdge('C', 'F', 'active'),
      createEdge('F', 'G', 'active'),
      createEdge('G', 'F', 'active'), // 循环中
      createEdge('G', 'H', 'waiting'),
      createEdge('H', 'I', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeB, runtimeEdges: edges4 })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: nodeC, runtimeEdges: edges4 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeF, runtimeEdges: edges4 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeH, runtimeEdges: edges4 })).toBe('wait');
  });

  it('复杂6: 多层嵌套循环退出 (开始 → Node1 → Node2 → Node3 → 结束, 带三层条件退出)', () => {
    // 开始 → Node1 → Node2 → Node3 → 结束
    // 三个循环退出条件:
    // - 条件3: Node3 → 结束 (退出到结束)
    // - 条件1: Node3 → Node2 (退出到Node2)
    // - 条件2: Node3 → Node1 (退出到Node1)
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const node1 = createNode('node1');
    const node2 = createNode('node2');
    const node3 = createNode('node3');
    const nodeEnd = createNode('end');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['node1', node1],
      ['node2', node2],
      ['node3', node3],
      ['end', nodeEnd]
    ]);

    // 场景1: 第一次执行，循环边都是skipped，只有到end的边waiting
    const edges1: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'node2', 'active'),
      createEdge('node2', 'node3', 'active'),
      createEdge('node3', 'end', 'waiting'), // 条件3
      createEdge('node3', 'node2', 'skipped'), // 条件1 (第一次未选择)
      createEdge('node3', 'node1', 'skipped') // 条件2 (第一次未选择)
    ];

    expect(checkNodeRunStatus({ nodesMap, node: node1, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node2, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node3, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeEnd, runtimeEdges: edges1 })).toBe('wait');

    // 场景2: 选择条件1，循环到Node2
    const edges2: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'node2', 'active'),
      createEdge('node2', 'node3', 'active'),
      createEdge('node3', 'end', 'skipped'), // 条件3未选择
      createEdge('node3', 'node2', 'active'), // 条件1选择
      createEdge('node3', 'node1', 'skipped') // 条件2未选择
    ];

    expect(checkNodeRunStatus({ nodesMap, node: node2, runtimeEdges: edges2 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node3, runtimeEdges: edges2 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeEnd, runtimeEdges: edges2 })).toBe('skip');

    // 场景3: 选择条件2，循环到Node1
    const edges3: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'node2', 'active'),
      createEdge('node2', 'node3', 'active'),
      createEdge('node3', 'end', 'skipped'), // 条件3未选择
      createEdge('node3', 'node2', 'skipped'), // 条件1未选择
      createEdge('node3', 'node1', 'active') // 条件2选择
    ];

    // Node1有来自start和node3的两条active边
    expect(checkNodeRunStatus({ nodesMap, node: node1, runtimeEdges: edges3 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node2, runtimeEdges: edges3 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node3, runtimeEdges: edges3 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeEnd, runtimeEdges: edges3 })).toBe('skip');

    // 场景4: 选择条件3，退出到结束
    const edges4: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'node2', 'active'),
      createEdge('node2', 'node3', 'active'),
      createEdge('node3', 'end', 'active'), // 条件3选择
      createEdge('node3', 'node2', 'skipped'), // 条件1未选择
      createEdge('node3', 'node1', 'skipped') // 条件2未选择
    ];

    expect(checkNodeRunStatus({ nodesMap, node: node3, runtimeEdges: edges4 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeEnd, runtimeEdges: edges4 })).toBe('run');
  });

  it('复杂7: 极度复杂多分支多循环交叉 (开始 → Node1 → branch1/branch2 → 多层循环交叉)', () => {
    // 主流程: 开始 → Node1 → (branch1→结束 / branch2→Node2) → Node3
    // 下层循环: Node3 → Node5 → Node6
    // 复杂循环路径:
    // - Node6 → Node2 (branch2)
    // - Node6 → Node3 (branch1)
    // - Node5 → Node1 (branch2)
    // - Node3 → Node1 (branch1)
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const node1 = createNode('node1');
    const node2 = createNode('node2');
    const node3 = createNode('node3');
    const node5 = createNode('node5');
    const node6 = createNode('node6');
    const nodeEnd = createNode('end');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['node1', node1],
      ['node2', node2],
      ['node3', node3],
      ['node5', node5],
      ['node6', node6],
      ['end', nodeEnd]
    ]);

    // 场景1: 第一次执行，选择branch1路径到结束，循环边都skipped
    const edges1: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'end', 'active'), // branch1 → 结束
      createEdge('node1', 'node2', 'skipped'), // branch2
      createEdge('node2', 'node3', 'skipped'),
      createEdge('node3', 'node5', 'skipped'),
      createEdge('node3', 'node1', 'skipped'), // 循环边 (branch1)
      createEdge('node5', 'node6', 'skipped'),
      createEdge('node5', 'node1', 'skipped'), // 循环边 (branch2)
      createEdge('node6', 'node2', 'skipped'), // 循环边 (branch2)
      createEdge('node6', 'node3', 'skipped') // 循环边 (branch1)
    ];

    expect(checkNodeRunStatus({ nodesMap, node: node1, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: nodeEnd, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node2, runtimeEdges: edges1 })).toBe('skip');

    // 场景2: 选择branch2路径，进入循环网络，第一次未选择循环
    const edges2: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'end', 'skipped'), // branch1
      createEdge('node1', 'node2', 'active'), // branch2 → Node2
      createEdge('node2', 'node3', 'active'),
      createEdge('node3', 'node5', 'active'),
      createEdge('node3', 'node1', 'skipped'), // 循环边 (branch1) 第一次未选择
      createEdge('node5', 'node6', 'active'),
      createEdge('node5', 'node1', 'skipped'), // 循环边 (branch2) 第一次未选择
      createEdge('node6', 'node2', 'skipped'), // 循环边 (branch2) 第一次未选择
      createEdge('node6', 'node3', 'skipped') // 循环边 (branch1) 第一次未选择
    ];

    expect(checkNodeRunStatus({ nodesMap, node: node1, runtimeEdges: edges2 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node2, runtimeEdges: edges2 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node3, runtimeEdges: edges2 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node5, runtimeEdges: edges2 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node6, runtimeEdges: edges2 })).toBe('run');

    // 场景3: Node6选择branch1循环回Node3
    const edges3: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'end', 'skipped'), // branch1
      createEdge('node1', 'node2', 'active'), // branch2
      createEdge('node2', 'node3', 'active'),
      createEdge('node3', 'node5', 'active'),
      createEdge('node3', 'node1', 'waiting'), // 循环边 (branch1)
      createEdge('node5', 'node6', 'active'),
      createEdge('node5', 'node1', 'skipped'), // 循环边 (branch2) 未选择
      createEdge('node6', 'node2', 'skipped'), // 循环边 (branch2) 未选择
      createEdge('node6', 'node3', 'active') // 循环边 (branch1) 选择
    ];

    // Node3有来自node2和node6的两条active边
    expect(checkNodeRunStatus({ nodesMap, node: node3, runtimeEdges: edges3 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node5, runtimeEdges: edges3 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node6, runtimeEdges: edges3 })).toBe('run');

    // 场景4: Node6选择branch2循环回Node2
    const edges4: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'end', 'skipped'), // branch1
      createEdge('node1', 'node2', 'active'), // branch2
      createEdge('node2', 'node3', 'active'),
      createEdge('node3', 'node5', 'active'),
      createEdge('node3', 'node1', 'waiting'), // 循环边 (branch1)
      createEdge('node5', 'node6', 'active'),
      createEdge('node5', 'node1', 'skipped'), // 循环边 (branch2) 未选择
      createEdge('node6', 'node2', 'active'), // 循环边 (branch2) 选择
      createEdge('node6', 'node3', 'skipped') // 循环边 (branch1) 未选择
    ];

    // Node2有来自node1和node6的两条active边
    expect(checkNodeRunStatus({ nodesMap, node: node2, runtimeEdges: edges4 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node3, runtimeEdges: edges4 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node6, runtimeEdges: edges4 })).toBe('run');

    // 场景5: Node5选择branch2循环回Node1
    const edges5: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'end', 'skipped'), // branch1
      createEdge('node1', 'node2', 'active'), // branch2
      createEdge('node2', 'node3', 'active'),
      createEdge('node3', 'node5', 'active'),
      createEdge('node3', 'node1', 'skipped'), // 循环边 (branch1) 未选择
      createEdge('node5', 'node6', 'skipped'), // 不走node6
      createEdge('node5', 'node1', 'active'), // 循环边 (branch2) 选择
      createEdge('node6', 'node2', 'waiting'),
      createEdge('node6', 'node3', 'waiting')
    ];

    // Node1有来自start和node5的两条active边
    expect(checkNodeRunStatus({ nodesMap, node: node1, runtimeEdges: edges5 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node5, runtimeEdges: edges5 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node6, runtimeEdges: edges5 })).toBe('skip');

    // 场景6: Node3选择branch1循环回Node1
    const edges6: RuntimeEdgeItemType[] = [
      createEdge('start', 'node1', 'active'),
      createEdge('node1', 'end', 'skipped'), // branch1
      createEdge('node1', 'node2', 'active'), // branch2
      createEdge('node2', 'node3', 'active'),
      createEdge('node3', 'node5', 'skipped'), // 不走node5
      createEdge('node3', 'node1', 'active'), // 循环边 (branch1) 选择
      createEdge('node5', 'node6', 'skipped'), // node5被跳过,下游也跳过
      createEdge('node5', 'node1', 'skipped'), // node5被跳过
      createEdge('node6', 'node2', 'skipped'), // node6不会运行
      createEdge('node6', 'node3', 'skipped') // node6不会运行
    ];

    // Node1有来自start和node3的两条active边
    expect(checkNodeRunStatus({ nodesMap, node: node1, runtimeEdges: edges6 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node3, runtimeEdges: edges6 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: node5, runtimeEdges: edges6 })).toBe('skip');
  });
});

describe('checkNodeRunStatus - 边界情况测试', () => {
  it('边界1: 入口节点无输入边', () => {
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const nodesMap = new Map<string, RuntimeNodeItemType>([['start', nodeStart]]);
    const edges: RuntimeEdgeItemType[] = [];

    expect(checkNodeRunStatus({ nodesMap, node: nodeStart, runtimeEdges: edges })).toBe('run');
  });

  it('边界2: 自循环节点 (A → A)', () => {
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const nodeA = createNode('A');
    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['A', nodeA]
    ]);

    const edges: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'A', 'active')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeA, runtimeEdges: edges })).toBe('run');
  });

  it('边界3: 所有输入边都被跳过', () => {
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const nodeA = createNode('A');
    const nodeB = createNode('B');
    const nodeC = createNode('C');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['A', nodeA],
      ['B', nodeB],
      ['C', nodeC]
    ]);

    const edges: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'skipped'),
      createEdge('A', 'C', 'skipped'),
      createEdge('B', 'C', 'skipped')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: nodeC, runtimeEdges: edges })).toBe('skip');
  });

  it('边界4: 递归边组部分激活', () => {
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const nodeA = createNode('A');
    const nodeB = createNode('B');
    const nodeC = createNode('C');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['A', nodeA],
      ['B', nodeB],
      ['C', nodeC]
    ]);

    // C有两条来自循环的边，但只有一条active
    const edges: RuntimeEdgeItemType[] = [
      createEdge('start', 'A', 'active'),
      createEdge('A', 'B', 'active'),
      createEdge('B', 'C', 'active'),
      createEdge('C', 'A', 'active'),
      createEdge('C', 'B', 'waiting') // 另一条递归边还在waiting
    ];

    // 只要有一组递归边满足条件即可运行
    expect(checkNodeRunStatus({ nodesMap, node: nodeA, runtimeEdges: edges })).toBe('run');
  });
});

describe('checkNodeRunStatus - 工具调用场景测试', () => {
  it('工具调用1: Tool节点作为入口节点 (无workflowStart时)', () => {
    // 场景：当工作流中没有 workflowStart/pluginInput 节点时，tool 节点可以作为入口节点
    // Tool → Process → End
    const toolNode = createNode('tool1', FlowNodeTypeEnum.tool);
    const processNode = createNode('process');
    const endNode = createNode('end');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['tool1', toolNode],
      ['process', processNode],
      ['end', endNode]
    ]);

    // 场景1: Tool节点作为入口，无输入边
    const edges1: RuntimeEdgeItemType[] = [
      createEdge('tool1', 'process', 'waiting'),
      createEdge('process', 'end', 'waiting')
    ];

    // Tool节点作为入口节点应该可以运行
    expect(checkNodeRunStatus({ nodesMap, node: toolNode, runtimeEdges: edges1 })).toBe('run');
    // 注意：由于tool节点没有输入边（是入口），process节点也会没有可追溯到start的边
    // 因此process节点在这个场景下也会返回'run'（因为commonEdges和recursiveEdgeGroups都为空）
    expect(checkNodeRunStatus({ nodesMap, node: processNode, runtimeEdges: edges1 })).toBe('run');

    // 场景2: Tool节点执行完成后,process可以运行但end仍需等待
    const edges2: RuntimeEdgeItemType[] = [
      createEdge('tool1', 'process', 'active'),
      createEdge('process', 'end', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: processNode, runtimeEdges: edges2 })).toBe('run');
    // end节点的输入边是waiting状态,需要等待process完成
    expect(checkNodeRunStatus({ nodesMap, node: endNode, runtimeEdges: edges2 })).toBe('wait');

    // 场景2.1: process完成后,end可以运行
    const edges2_1: RuntimeEdgeItemType[] = [
      createEdge('tool1', 'process', 'active'),
      createEdge('process', 'end', 'active')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: endNode, runtimeEdges: edges2_1 })).toBe('run');

    // 场景3: 有workflowStart时，tool节点不再是入口节点
    const startNode = createNode('start', FlowNodeTypeEnum.workflowStart);
    const nodesMapWithStart = new Map<string, RuntimeNodeItemType>([
      ['start', startNode],
      ['tool1', toolNode],
      ['process', processNode],
      ['end', endNode]
    ]);

    const edges3: RuntimeEdgeItemType[] = [
      createEdge('start', 'tool1', 'active'),
      createEdge('tool1', 'process', 'waiting'),
      createEdge('process', 'end', 'waiting')
    ];

    // 此时tool节点不再是入口节点，需要start激活才能运行
    expect(
      checkNodeRunStatus({ nodesMap: nodesMapWithStart, node: toolNode, runtimeEdges: edges3 })
    ).toBe('run');
    expect(
      checkNodeRunStatus({ nodesMap: nodesMapWithStart, node: processNode, runtimeEdges: edges3 })
    ).toBe('wait');

    // Tool执行完成后，process可以运行
    const edges4: RuntimeEdgeItemType[] = [
      createEdge('start', 'tool1', 'active'),
      createEdge('tool1', 'process', 'active'),
      createEdge('process', 'end', 'waiting')
    ];

    expect(
      checkNodeRunStatus({ nodesMap: nodesMapWithStart, node: processNode, runtimeEdges: edges4 })
    ).toBe('run');
  });

  it('工具调用2: ToolSet节点与条件分支和循环组合 (Agent → ToolSet → Tool1/Tool2 → Result → Agent)', () => {
    // 场景：Agent调用工具集，工具集根据条件选择不同工具执行，并支持循环调用
    // Start → Agent → ToolSet → (Tool1 | Tool2) → Result → Agent (循环)
    const nodeStart = createNode('start', FlowNodeTypeEnum.workflowStart);
    const agentNode = createNode('agent', FlowNodeTypeEnum.agent);
    const toolSetNode = createNode('toolSet', FlowNodeTypeEnum.toolSet);
    const tool1Node = createNode('tool1', FlowNodeTypeEnum.tool);
    const tool2Node = createNode('tool2', FlowNodeTypeEnum.tool);
    const resultNode = createNode('result');

    const nodesMap = new Map<string, RuntimeNodeItemType>([
      ['start', nodeStart],
      ['agent', agentNode],
      ['toolSet', toolSetNode],
      ['tool1', tool1Node],
      ['tool2', tool2Node],
      ['result', resultNode]
    ]);

    // 场景1: 第一次执行，Agent选择Tool1
    const edges1: RuntimeEdgeItemType[] = [
      createEdge('start', 'agent', 'active'),
      createEdge('agent', 'toolSet', 'active'),
      createEdge('toolSet', 'tool1', 'active'), // 选择Tool1
      createEdge('toolSet', 'tool2', 'skipped'), // Tool2未选择
      createEdge('tool1', 'result', 'waiting'),
      createEdge('tool2', 'result', 'skipped'),
      createEdge('result', 'agent', 'waiting') // 循环边等待
    ];

    expect(checkNodeRunStatus({ nodesMap, node: agentNode, runtimeEdges: edges1 })).toBe('wait');
    expect(checkNodeRunStatus({ nodesMap, node: toolSetNode, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: tool1Node, runtimeEdges: edges1 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: tool2Node, runtimeEdges: edges1 })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: resultNode, runtimeEdges: edges1 })).toBe('wait');

    // 场景2: Tool1执行完成，Result处理结果
    const edges2: RuntimeEdgeItemType[] = [
      createEdge('start', 'agent', 'active'),
      createEdge('agent', 'toolSet', 'active'),
      createEdge('toolSet', 'tool1', 'active'),
      createEdge('toolSet', 'tool2', 'skipped'),
      createEdge('tool1', 'result', 'active'), // Tool1完成
      createEdge('tool2', 'result', 'skipped'),
      createEdge('result', 'agent', 'waiting')
    ];

    expect(checkNodeRunStatus({ nodesMap, node: resultNode, runtimeEdges: edges2 })).toBe('run');

    // 场景3: 循环回Agent，第二次调用选择Tool2
    const edges3: RuntimeEdgeItemType[] = [
      createEdge('start', 'agent', 'active'),
      createEdge('agent', 'toolSet', 'active'),
      createEdge('toolSet', 'tool1', 'skipped'), // Tool1未选择
      createEdge('toolSet', 'tool2', 'active'), // 选择Tool2
      createEdge('tool1', 'result', 'skipped'),
      createEdge('tool2', 'result', 'active'), // Tool2完成
      createEdge('result', 'agent', 'active') // 循环边激活
    ];

    // Agent有来自start和result的两条active边
    expect(checkNodeRunStatus({ nodesMap, node: agentNode, runtimeEdges: edges3 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: tool1Node, runtimeEdges: edges3 })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: tool2Node, runtimeEdges: edges3 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: resultNode, runtimeEdges: edges3 })).toBe('run');

    // 场景4: 循环退出，不再调用工具
    const edges4: RuntimeEdgeItemType[] = [
      createEdge('start', 'agent', 'active'),
      createEdge('agent', 'toolSet', 'skipped'), // 不再调用工具集
      createEdge('toolSet', 'tool1', 'skipped'),
      createEdge('toolSet', 'tool2', 'skipped'),
      createEdge('tool1', 'result', 'skipped'),
      createEdge('tool2', 'result', 'skipped'),
      createEdge('result', 'agent', 'skipped') // 循环退出
    ];

    expect(checkNodeRunStatus({ nodesMap, node: agentNode, runtimeEdges: edges4 })).toBe('run');
    expect(checkNodeRunStatus({ nodesMap, node: toolSetNode, runtimeEdges: edges4 })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: tool1Node, runtimeEdges: edges4 })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: tool2Node, runtimeEdges: edges4 })).toBe('skip');
    expect(checkNodeRunStatus({ nodesMap, node: resultNode, runtimeEdges: edges4 })).toBe('skip');
  });
});
