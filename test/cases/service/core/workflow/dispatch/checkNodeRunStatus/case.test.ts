import { describe, it, expect } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowQueue } from '@fastgpt/service/core/workflow/dispatch/index';
import { createNode, createEdge, setEdgeStatus } from '../../utils';

describe('1: 医疗记录工作流 - 非对称分支汇聚 + 中间节点循环', () => {
  /**
   * 工作流结构（来源于真实用户工作流）：
   *
   *              IF → code → newArr → getFirst → updateArr → updateCur1 ──┐
   * start → ifElse1                      ↑                                ├──→ AI → ifElse2
   *              ELSE ──── updateCur2 ───┼────────────────────────────────┘        │
   *                                      │                                         IF → updateHistory ─┘
   *                                      │                                         ELSE → reply [退出]
   *                                      └─────────────────────────────────────────────────────────────
   *
   * 关键特点：
   * 1. ifElse1 的 IF 分支经过长链路（code→newArr→getFirst→updateArr→updateCur1），ELSE 分支走短链路（updateCur2）
   * 2. 两条分支汇聚到 AI 节点（非对称汇聚）
   * 3. 循环目标是中间节点 getFirst，而非初始 ifElse1（非对称循环）
   * 4. getFirst 有两个来源组：[newArr→getFirst]（初始 IF 路径）和 [updateHistory→getFirst]（循环路径）
   * 5. AI 有两个来源组：[updateCur1→AI]（IF 路径）和 [updateCur2→AI]（ELSE 路径）
   *
   * 预期分组：
   * - getFirst: 组1[newArr→getFirst], 组2[updateHistory→getFirst]
   * - AI:       组1[updateCur1→AI],   组2[updateCur2→AI]
   *
   * 测试场景：
   * 1. IF 分支首次执行：newArr→getFirst active → getFirst 应该运行
   * 2. IF 分支首次执行：updateCur1���AI active, updateCur2→AI skipped → AI 应该运行
   * 3. ELSE 分支执行：updateCur2→AI active, updateCur1→AI skipped → AI 应该运行
   * 4. ELSE 分支执行：newArr→getFirst skipped → getFirst 应该跳过
   * 5. 循环迭代：updateHistory→getFirst active, newArr→getFirst skipped → getFirst 应该运行
   * 6. 循环迭代：updateCur1→AI active, updateCur2→AI skipped → AI 应该继续运行
   * 7. 退出路径：reply 应该运行
   */

  const nodes = [
    createNode('start', FlowNodeTypeEnum.workflowStart),
    createNode('ifElse1', FlowNodeTypeEnum.ifElseNode),
    createNode('code', FlowNodeTypeEnum.code),
    createNode('newArr', FlowNodeTypeEnum.variableUpdate),
    createNode('getFirst', FlowNodeTypeEnum.code),
    createNode('updateArr', FlowNodeTypeEnum.variableUpdate),
    createNode('updateCur1', FlowNodeTypeEnum.variableUpdate),
    createNode('AI', FlowNodeTypeEnum.chatNode),
    createNode('updateCur2', FlowNodeTypeEnum.variableUpdate),
    createNode('ifElse2', FlowNodeTypeEnum.ifElseNode),
    createNode('updateHistory', FlowNodeTypeEnum.variableUpdate),
    createNode('reply', FlowNodeTypeEnum.answerNode)
  ];

  const edges = [
    createEdge('start', 'ifElse1'),
    // IF 分支（长链路）
    createEdge('ifElse1', 'code', 'waiting', 'ifElse1-source-IF'),
    createEdge('code', 'newArr'),
    createEdge('newArr', 'getFirst'),
    createEdge('getFirst', 'updateArr'),
    createEdge('updateArr', 'updateCur1'),
    createEdge('updateCur1', 'AI'),
    // ELSE 分支（短链路）
    createEdge('ifElse1', 'updateCur2', 'waiting', 'ifElse1-source-ELSE'),
    createEdge('updateCur2', 'AI'),
    // AI 后续
    createEdge('AI', 'ifElse2'),
    // 循环路径（IF 分支）：更新历史后回到 getFirst
    createEdge('ifElse2', 'updateHistory', 'waiting', 'ifElse2-source-IF'),
    createEdge('updateHistory', 'getFirst'),
    // 退出路径（ELSE 分支）
    createEdge('ifElse2', 'reply', 'waiting', 'ifElse2-source-ELSE')
  ];

  const edgeIndex = WorkflowQueue.buildEdgeIndex({ runtimeEdges: edges });
  const edgeGroupsMap = WorkflowQueue.buildNodeEdgeGroupsMap({
    runtimeNodes: nodes,
    edgeIndex
  });

  it('getFirst 节点应该分成 2 组（初始 IF 路径 + 循环路径）', () => {
    const groups = edgeGroupsMap.get('getFirst') || [];
    expect(groups.length).toBe(2);
  });

  it('AI 节点应该分成 2 组（IF 分支 + ELSE 分支）', () => {
    const groups = edgeGroupsMap.get('AI') || [];
    expect(groups.length).toBe(2);
  });

  it('场景24.1: IF 分支首次执行，newArr→getFirst active，getFirst 应该运行', () => {
    setEdgeStatus(edges, 'newArr', 'getFirst', 'active');
    setEdgeStatus(edges, 'updateHistory', 'getFirst', 'waiting');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'getFirst')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('场景24.2: IF 分支首次执行，updateCur1→AI active，updateCur2→AI skipped，AI 应该运行', () => {
    setEdgeStatus(edges, 'updateCur1', 'AI', 'active');
    setEdgeStatus(edges, 'updateCur2', 'AI', 'skipped');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'AI')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('场景24.3: ELSE 分支执行，updateCur2→AI active，updateCur1→AI skipped，AI 应该运行', () => {
    setEdgeStatus(edges, 'updateCur2', 'AI', 'active');
    setEdgeStatus(edges, 'updateCur1', 'AI', 'skipped');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'AI')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('场景24.4: ELSE 分支执行且退出，所有入边均 skipped，getFirst 应该跳过', () => {
    // ELSE 路径：ifElse1 走 ELSE → updateCur2 → AI → ifElse2 走 ELSE → reply
    // IF 链路（code/newArr/getFirst/updateArr/updateCur1）全部被 skipped
    // ifElse2 走 ELSE 分支，updateHistory 也被 skipped，所以 updateHistory→getFirst 也为 skipped
    setEdgeStatus(edges, 'newArr', 'getFirst', 'skipped');
    setEdgeStatus(edges, 'updateHistory', 'getFirst', 'skipped');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'getFirst')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    // Group1[newArr→getFirst] 全部 skipped，Group2[updateHistory→getFirst] 全部 skipped
    // getFirst 应该跳过
    expect(status).toBe('skip');
  });

  it('场景24.5: 循环迭代，updateHistory→getFirst active，newArr→getFirst skipped，getFirst 应该运行', () => {
    setEdgeStatus(edges, 'updateHistory', 'getFirst', 'active');
    setEdgeStatus(edges, 'newArr', 'getFirst', 'skipped');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'getFirst')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('场景24.6: 循环迭代，updateCur1→AI active，updateCur2→AI skipped，AI 应该继续运行', () => {
    setEdgeStatus(edges, 'updateCur1', 'AI', 'active');
    setEdgeStatus(edges, 'updateCur2', 'AI', 'skipped');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'AI')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('场景24.7: 退出路径，ifElse2→reply active，reply 应该运行', () => {
    setEdgeStatus(edges, 'ifElse2', 'reply', 'active');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'reply')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('run');
  });

  it('场景24.8: AI 两条边都 waiting，AI 应该等待', () => {
    setEdgeStatus(edges, 'updateCur1', 'AI', 'waiting');
    setEdgeStatus(edges, 'updateCur2', 'AI', 'waiting');

    const status = WorkflowQueue.getNodeRunStatus({
      node: nodes.find((n) => n.nodeId === 'AI')!,
      nodeEdgeGroupsMap: edgeGroupsMap
    });

    expect(status).toBe('wait');
  });
});
