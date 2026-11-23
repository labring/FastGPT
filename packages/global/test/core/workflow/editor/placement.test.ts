import { buildNodeTemplateContext } from '@fastgpt/global/common/workflow/editor/utils';
import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { createWorkflowEditor } from '@fastgpt/global/common/workflow/editor/runtime/runtime';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';

/** placement 夹具：容器与根级节点齐备，初始文档不过 placement 校验，可以直接摆出目标形状。 */
const node = ({
  nodeId,
  flowNodeType,
  parentNodeId
}: {
  nodeId: string;
  flowNodeType: FlowNodeTypeEnum;
  parentNodeId?: string;
}) =>
  ({
    nodeId,
    flowNodeType,
    name: nodeId,
    inputs: [],
    outputs: [],
    ...(parentNodeId !== undefined ? { parentNodeId } : {})
  }) as never;

const edge = ({
  source,
  target,
  targetHandle = `${target}-target-left`
}: {
  source: string;
  target: string;
  targetHandle?: string;
}) => ({
  source,
  target,
  sourceHandle: `${source}-source-right`,
  targetHandle
});

/** loopRun 容器里有一个工具调用，parallelRun 容器为空；workflowStart 在根级。 */
const createScopeRuntime = (): WorkflowRuntimePort =>
  createWorkflowEditor({
    nodes: [
      node({ nodeId: 'start', flowNodeType: FlowNodeTypeEnum.workflowStart }),
      node({ nodeId: 'loop', flowNodeType: FlowNodeTypeEnum.loopRun }),
      node({
        nodeId: 'loopStart',
        flowNodeType: FlowNodeTypeEnum.loopRunStart,
        parentNodeId: 'loop'
      }),
      node({ nodeId: 'toolInLoop', flowNodeType: FlowNodeTypeEnum.toolCall, parentNodeId: 'loop' }),
      node({ nodeId: 'parallel', flowNodeType: FlowNodeTypeEnum.parallelRun })
    ],
    edges: [],
    chatConfig: {}
  } as never);

/** 工具子流程：toolCall 经 selectedTools 挂 n1，再经普通连线到 n2、n3。 */
const createToolChainRuntime = (): WorkflowRuntimePort =>
  createWorkflowEditor({
    nodes: [
      node({ nodeId: 'start', flowNodeType: FlowNodeTypeEnum.workflowStart }),
      node({ nodeId: 'tool1', flowNodeType: FlowNodeTypeEnum.toolCall }),
      node({ nodeId: 'n1', flowNodeType: FlowNodeTypeEnum.chatNode }),
      node({ nodeId: 'n2', flowNodeType: FlowNodeTypeEnum.chatNode }),
      node({ nodeId: 'n3', flowNodeType: FlowNodeTypeEnum.chatNode })
    ],
    edges: [
      edge({ source: 'tool1', target: 'n1', targetHandle: NodeOutputKeyEnum.selectedTools }),
      edge({ source: 'n1', target: 'n2' }),
      edge({ source: 'n2', target: 'n3' })
    ],
    chatConfig: {}
  } as never);

const createStagedToolPlacementRuntime = (): WorkflowRuntimePort =>
  createWorkflowEditor({
    nodes: [
      node({ nodeId: 'tool', flowNodeType: FlowNodeTypeEnum.toolCall }),
      node({ nodeId: 'middle', flowNodeType: FlowNodeTypeEnum.chatNode }),
      node({ nodeId: 'stop', flowNodeType: FlowNodeTypeEnum.stopTool })
    ],
    edges: [],
    chatConfig: {}
  } as never);

describe('placement context', () => {
  it('无来源节点且非侧边栏时不产出 context', () => {
    const editor = createScopeRuntime();

    expect(editor.getPlacementContext({})).toBeNull();
    expect(editor.getPlacementContext({ node: { nodeId: 'missing' } })).toBeNull();
  });

  it('hasToolNode / hasLoopRunNode / takenUniqueTypes 按目标父容器的直接子节点计算', () => {
    const editor = createScopeRuntime();

    const root = editor.getPlacementContext({ isSidebar: true })!;
    expect(root.parentType).toBeNull();
    // 唯一的工具调用在容器里：root context 不算它，侧边栏因此不再显示工具终止/自定义工具变量。
    expect(root.hasToolNode).toBe(false);
    expect(root.hasLoopRunNode).toBe(true);
    expect(root.takenUniqueTypes).toEqual([FlowNodeTypeEnum.workflowStart]);

    const inLoop = editor.getPlacementContext({
      node: { nodeId: 'toolInLoop', handleId: 'source' }
    })!;
    expect(inLoop.handleId).toBe('source');
    expect(inLoop.parentType).toBe(FlowNodeTypeEnum.loopRun);
    expect(inLoop.hasToolNode).toBe(true);
    expect(inLoop.hasLoopRunNode).toBe(false);
    expect(inLoop.takenUniqueTypes).toEqual([FlowNodeTypeEnum.loopRunStart]);
  });

  it('takenUniqueTypes 随文档增删变化', () => {
    const editor = createScopeRuntime();
    const rootTakenUniqueTypes = () =>
      editor.getPlacementContext({ isSidebar: true })!.takenUniqueTypes;

    editor.dispatch({
      type: 'addNode',
      node: node({ nodeId: 'output', flowNodeType: FlowNodeTypeEnum.pluginOutput })
    });
    expect(rootTakenUniqueTypes()).toEqual([
      FlowNodeTypeEnum.workflowStart,
      FlowNodeTypeEnum.pluginOutput
    ]);

    // 根级唯一节点都受删除保护，用 undo 回到添加前。
    editor.undo();
    expect(rootTakenUniqueTypes()).toEqual([FlowNodeTypeEnum.workflowStart]);
  });

  it('root context 随节点进出容器与删除增量维护', () => {
    const editor = createScopeRuntime();
    const rootHasToolNode = () => editor.getPlacementContext({ isSidebar: true })!.hasToolNode;

    expect(rootHasToolNode()).toBe(false);

    editor.dispatch({
      type: 'addNode',
      node: node({ nodeId: 'rootTool', flowNodeType: FlowNodeTypeEnum.toolCall })
    });
    expect(rootHasToolNode()).toBe(true);

    // 移进容器：根桶要摘掉它，容器作用域开始算它。
    editor.dispatch({ type: 'attachToContainer', nodeId: 'rootTool', containerId: 'loop' });
    expect(rootHasToolNode()).toBe(false);
    expect(editor.getPlacementContext({ node: { nodeId: 'rootTool' } })!.parentType).toBe(
      FlowNodeTypeEnum.loopRun
    );

    editor.dispatch({ type: 'removeNodes', nodeIds: ['rootTool'] });
    expect(rootHasToolNode()).toBe(false);
    expect(editor.getPlacementContext({ node: { nodeId: 'rootTool' } })).toBeNull();
  });

  it('isConnectedTool 沿入边经普通节点上溯到 selectedTools 根边', () => {
    const editor = createToolChainRuntime();
    const isConnectedTool = (nodeId: string) =>
      editor.getPlacementContext({ node: { nodeId } })?.isConnectedTool;

    expect(isConnectedTool('n3')).toBe(true);
    expect(isConnectedTool('n1')).toBe(true);
    expect(isConnectedTool('tool1')).toBe(false);
    expect(isConnectedTool('start')).toBe(false);
  });

  it('拒绝普通流程连入工具子流程', () => {
    const editor = createWorkflowEditor({
      nodes: [
        node({ nodeId: 'start', flowNodeType: FlowNodeTypeEnum.workflowStart }),
        node({ nodeId: 'outside', flowNodeType: FlowNodeTypeEnum.chatNode }),
        node({ nodeId: 'tool1', flowNodeType: FlowNodeTypeEnum.toolCall }),
        node({ nodeId: 'n1', flowNodeType: FlowNodeTypeEnum.chatNode }),
        node({ nodeId: 'n2', flowNodeType: FlowNodeTypeEnum.chatNode })
      ],
      edges: [
        edge({ source: 'tool1', target: 'n1', targetHandle: NodeOutputKeyEnum.selectedTools }),
        edge({ source: 'n1', target: 'n2' })
      ],
      chatConfig: {}
    } as never);

    expect(
      editor.dispatch({ type: 'connectEdge', edge: edge({ source: 'outside', target: 'n2' }) })
        .error?.code
    ).toBe('invalid_edge');
  });

  it('允许空父级和缺省父级的历史根节点连线', () => {
    const editor = createWorkflowEditor({
      nodes: [
        node({ nodeId: 'start', flowNodeType: FlowNodeTypeEnum.workflowStart, parentNodeId: '' }),
        node({ nodeId: 'answer', flowNodeType: FlowNodeTypeEnum.answerNode })
      ],
      edges: [],
      chatConfig: {}
    });

    const connection = edge({ source: 'start', target: 'answer' });
    expect(editor.dispatch({ type: 'connectEdge', edge: connection }).ok).toBe(true);
    expect(editor.getWorkflowData().edges).toEqual([connection]);
  });

  it('同一批新增 selectedTools 边后仍能连接 stopTool', () => {
    const editor = createStagedToolPlacementRuntime();

    const result = editor.dispatch([
      {
        type: 'connectEdge',
        edge: edge({
          source: 'tool',
          target: 'middle',
          targetHandle: NodeOutputKeyEnum.selectedTools
        })
      },
      {
        type: 'connectEdge',
        edge: edge({ source: 'middle', target: 'stop' })
      }
    ]);

    expect(result.ok).toBe(true);
    expect(editor.getWorkflow().edges).toHaveLength(2);
  });

  it('连线校验消费同一份 context：toolParams 只接受工具调用的 selectedTools 柄', () => {
    const editor = createToolChainRuntime();
    editor.dispatch({
      type: 'addNode',
      node: node({ nodeId: 'params', flowNodeType: FlowNodeTypeEnum.toolParams })
    });

    expect(
      editor.dispatch({
        type: 'connectEdge',
        edge: {
          source: 'tool1',
          target: 'params',
          sourceHandle: NodeOutputKeyEnum.selectedTools,
          targetHandle: 'params-target-left'
        }
      }).ok
    ).toBe(true);
    expect(
      editor.dispatch({
        type: 'connectEdge',
        edge: {
          source: 'n2',
          target: 'params',
          sourceHandle: 'n2-source-right',
          targetHandle: 'params-target-left'
        }
      }).error?.code
    ).toBe('invalid_edge');
  });
});

const addNode = (editor: WorkflowRuntimePort, fixture: Parameters<typeof node>[0]) =>
  editor.dispatch({ type: 'addNode', node: node(fixture) });

describe('placement rejection reason', () => {
  it('容器拒绝带上结构化 reason', () => {
    const editor = createScopeRuntime();

    // parallelRun 里不允许交互节点。
    expect(
      addNode(editor, {
        nodeId: 'select',
        flowNodeType: FlowNodeTypeEnum.userSelect,
        parentNodeId: 'parallel'
      }).error
    ).toMatchObject({ code: 'invalid_placement', reason: 'can_not_parallel' });

    // loopRunBreak 只能落在 loopRun 里。
    expect(
      addNode(editor, {
        nodeId: 'break',
        flowNodeType: FlowNodeTypeEnum.loopRunBreak,
        parentNodeId: 'parallel'
      }).error?.reason
    ).toBe('loop_run_break_must_inside_loop_run');
    expect(
      addNode(editor, {
        nodeId: 'break',
        flowNodeType: FlowNodeTypeEnum.loopRunBreak,
        parentNodeId: 'loop'
      }).ok
    ).toBe(true);

    // 嵌套容器：loopRun 里不能再放容器。
    expect(
      addNode(editor, {
        nodeId: 'loop2',
        flowNodeType: FlowNodeTypeEnum.loopRun,
        parentNodeId: 'loop'
      }).error?.reason
    ).toBe('can_not_loop');
  });

  it('容器内 toolSet 只在容器已有工具调用时允许', () => {
    const editor = createScopeRuntime();

    expect(
      addNode(editor, {
        nodeId: 'toolSet',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        parentNodeId: 'loop'
      }).ok
    ).toBe(true);
    expect(
      addNode(editor, {
        nodeId: 'toolSet2',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        parentNodeId: 'parallel'
      }).error?.reason
    ).toBe('can_not_add_inside_container');
  });

  it('容器内工具类节点按模板 isShowInContext 拒绝', () => {
    const editor = createScopeRuntime();

    // 文档节点不带 isShowInContext，placement 需按类型解析模板：parallel 里没有工具调用。
    expect(
      addNode(editor, {
        nodeId: 'params',
        flowNodeType: FlowNodeTypeEnum.toolParams,
        parentNodeId: 'parallel'
      }).error?.reason
    ).toBe('can_not_add_inside_container');
    expect(
      addNode(editor, {
        nodeId: 'stop',
        flowNodeType: FlowNodeTypeEnum.stopTool,
        parentNodeId: 'parallel'
      }).error?.reason
    ).toBe('can_not_add_inside_container');

    expect(
      addNode(editor, {
        nodeId: 'params',
        flowNodeType: FlowNodeTypeEnum.toolParams,
        parentNodeId: 'loop'
      }).ok
    ).toBe(true);
  });

  it('拖入容器走同一条规则并带 reason', () => {
    const editor = createScopeRuntime();
    addNode(editor, { nodeId: 'select', flowNodeType: FlowNodeTypeEnum.userSelect });

    expect(
      editor.dispatch({ type: 'attachToContainer', nodeId: 'select', containerId: 'parallel' })
        .error
    ).toMatchObject({ code: 'invalid_placement', reason: 'can_not_parallel' });
    expect(
      editor.dispatch({ type: 'attachToContainer', nodeId: 'select', containerId: 'loop' }).ok
    ).toBe(true);
  });

  it('唯一性拒绝不带 reason：目录侧已按 takenUniqueTypes 过滤', () => {
    const editor = createScopeRuntime();

    const duplicateRoot = addNode(editor, {
      nodeId: 'start2',
      flowNodeType: FlowNodeTypeEnum.workflowStart
    });
    expect(duplicateRoot.ok).toBe(false);
    expect(duplicateRoot.error?.code).toBe('invalid_placement');
    expect(duplicateRoot.error?.reason).toBeUndefined();

    const duplicateSystemChild = addNode(editor, {
      nodeId: 'loopStart2',
      flowNodeType: FlowNodeTypeEnum.loopRunStart,
      parentNodeId: 'loop'
    });
    expect(duplicateSystemChild.error?.code).toBe('invalid_placement');
    expect(duplicateSystemChild.error?.reason).toBeUndefined();
  });

  it('根级放系统子节点只有开发期 message，没有 reason', () => {
    const editor = createScopeRuntime();

    expect(
      addNode(editor, { nodeId: 'rootLoopStart', flowNodeType: FlowNodeTypeEnum.loopRunStart })
        .error
    ).toEqual({
      code: 'invalid_placement',
      message: 'Node placement is not allowed'
    });
  });
});

describe('shared placement context builder', () => {
  it('produces the same tool-chain context from indexed edges and a flat edge array', () => {
    const edges = [
      edge({ source: 'tool', target: 'middle', targetHandle: NodeOutputKeyEnum.selectedTools }),
      edge({ source: 'middle', target: 'source' }),
      edge({ source: 'unrelated', target: 'elsewhere' })
    ];
    const query = {
      sourceNode: {
        nodeId: 'source',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        parentNodeId: 'loop'
      },
      handleId: 'source-source-right',
      getNodeById: () => ({ flowNodeType: FlowNodeTypeEnum.loopRun }),
      hasToolNode: true,
      hasLoopRunNode: false,
      takenUniqueTypes: [FlowNodeTypeEnum.loopRunStart]
    };
    const visited: string[] = [];
    const indexed = buildNodeTemplateContext({
      ...query,
      getIncomingEdges: (nodeId) => {
        visited.push(nodeId);
        return edges.filter((item) => item.target === nodeId);
      }
    });
    expect(indexed).toEqual(buildNodeTemplateContext({ ...query, edges }));
    expect(indexed).toMatchObject({
      isConnectedTool: true,
      parentType: FlowNodeTypeEnum.loopRun,
      takenUniqueTypes: [FlowNodeTypeEnum.loopRunStart]
    });
    expect(visited).toEqual(['source', 'middle']);
  });
});
