import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { createWorkflowEditor } from '@fastgpt/global/core/workflow/editor/runtime/runtime';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';

/** 图查询夹具节点：只带判定需要的字段，其余由 runtime 入站边界补齐。 */
const node = (
  nodeId: string,
  flowNodeType: FlowNodeTypeEnum,
  parentNodeId?: string,
  inputs: unknown[] = []
) =>
  ({
    nodeId,
    flowNodeType,
    name: nodeId,
    inputs,
    outputs: [],
    ...(parentNodeId ? { parentNodeId } : {})
  }) as never;

/** start -> answer 的普通流程连线。 */
const flowEdge = {
  source: 'start',
  target: 'answer',
  sourceHandle: 'source',
  targetHandle: 'target'
};

/** tool1 把 http 挂成工具的 selectedTools 边。 */
const toolEdge = {
  source: 'tool1',
  target: 'http',
  sourceHandle: NodeOutputKeyEnum.selectedTools,
  targetHandle: NodeOutputKeyEnum.selectedTools
};

/**
 * 图查询夹具：普通连线两条（answer 有两个入边，用于验证顺序）、工具挂载边一条、
 * 容器带两个子节点，根级与容器内都有节点，四个方法都能读到非空索引。
 * 初始文档不过 placement 校验，可以直接摆出目标形状。
 */
const createGraphRuntime = (): WorkflowRuntimePort =>
  createWorkflowEditor({
    nodes: [
      node('start', FlowNodeTypeEnum.workflowStart),
      node('answer', FlowNodeTypeEnum.answerNode),
      node('tool1', FlowNodeTypeEnum.toolCall),
      node('http', FlowNodeTypeEnum.chatNode),
      node('loop', FlowNodeTypeEnum.loopRun, undefined, [
        {
          key: NodeInputKeyEnum.loopRunInputArray,
          label: 'Input',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          valueType: WorkflowIOValueTypeEnum.string,
          value: ['start', 'source']
        }
      ]),
      node('loopStart', FlowNodeTypeEnum.loopRunStart, 'loop'),
      node('child', FlowNodeTypeEnum.answerNode, 'loop')
    ],
    edges: [flowEdge, toolEdge, { ...flowEdge, source: 'tool1', targetHandle: 'answer-target' }],
    chatConfig: {}
  } as never);

describe('workflow runtime graph queries', () => {
  it('isMountedTool 只认 selectedTools 入边', () => {
    const editor = createGraphRuntime();
    const queries = editor.getGraphQueries();

    expect(queries.isMountedTool('http')).toBe(true);
    expect(queries.isMountedTool('tool1')).toBe(false);
    // answer 有两条普通入边，都不算挂载。
    expect(queries.isMountedTool('answer')).toBe(false);
    // 不存在的节点没有入边桶，按未挂载处理，不抛错。
    expect(queries.isMountedTool('missing')).toBe(false);

    expect(editor.dispatch({ type: 'disconnectEdge', edge: toolEdge }).ok).toBe(true);
    expect(queries.isMountedTool('http')).toBe(false);

    expect(editor.undo().ok).toBe(true);
    expect(queries.isMountedTool('http')).toBe(true);
    expect(editor.redo().ok).toBe(true);
    expect(queries.isMountedTool('http')).toBe(false);
  });

  it('删掉挂载来源节点后目标一起失去挂载状态', () => {
    const editor = createGraphRuntime();
    const queries = editor.getGraphQueries();

    expect(editor.dispatch({ type: 'removeNodes', nodeIds: ['tool1'] }).ok).toBe(true);
    expect(queries.isMountedTool('http')).toBe(false);
    expect(queries.getIncomingEdges('http')).toEqual([]);
    // 同一个来源节点上的普通边也一起消失，另一个目标节点的入边不受影响。
    expect(queries.getIncomingEdges('answer')).toEqual([
      { source: 'start', sourceHandle: 'source', target: 'answer', targetHandle: 'target' }
    ]);

    editor.undo();
    expect(queries.isMountedTool('http')).toBe(true);
  });

  it('isHandleConnected 按方向读对应索引', () => {
    const editor = createGraphRuntime();
    const queries = editor.getGraphQueries();

    expect(
      queries.isHandleConnected({ nodeId: 'start', handleId: 'source', direction: 'source' })
    ).toBe(true);
    expect(
      queries.isHandleConnected({ nodeId: 'answer', handleId: 'target', direction: 'target' })
    ).toBe(true);
    expect(
      queries.isHandleConnected({
        nodeId: 'answer',
        handleId: 'answer-target',
        direction: 'target'
      })
    ).toBe(true);
    expect(
      queries.isHandleConnected({
        nodeId: 'tool1',
        handleId: NodeOutputKeyEnum.selectedTools,
        direction: 'source'
      })
    ).toBe(true);
    expect(
      queries.isHandleConnected({
        nodeId: 'http',
        handleId: NodeOutputKeyEnum.selectedTools,
        direction: 'target'
      })
    ).toBe(true);
    // 方向换成另一侧就是另一个索引：start 没有入边，answer 没有出边。
    expect(
      queries.isHandleConnected({ nodeId: 'start', handleId: 'source', direction: 'target' })
    ).toBe(false);
    expect(
      queries.isHandleConnected({ nodeId: 'answer', handleId: 'target', direction: 'source' })
    ).toBe(false);
    expect(
      queries.isHandleConnected({ nodeId: 'answer', handleId: 'missing', direction: 'target' })
    ).toBe(false);
    expect(
      queries.isHandleConnected({ nodeId: 'missing', handleId: 'source', direction: 'source' })
    ).toBe(false);

    // 重复连线被拒，索引与查询结果都不变。
    expect(editor.dispatch({ type: 'connectEdge', edge: flowEdge }).ok).toBe(false);
    expect(
      queries.isHandleConnected({ nodeId: 'start', handleId: 'source', direction: 'source' })
    ).toBe(true);

    expect(editor.dispatch({ type: 'disconnectEdge', edge: flowEdge }).ok).toBe(true);
    expect(
      queries.isHandleConnected({ nodeId: 'start', handleId: 'source', direction: 'source' })
    ).toBe(false);
    expect(
      queries.isHandleConnected({ nodeId: 'answer', handleId: 'target', direction: 'target' })
    ).toBe(false);
    // 同节点上另一个 handle 的连线还在。
    expect(
      queries.isHandleConnected({
        nodeId: 'answer',
        handleId: 'answer-target',
        direction: 'target'
      })
    ).toBe(true);

    editor.undo();
    expect(
      queries.isHandleConnected({ nodeId: 'start', handleId: 'source', direction: 'source' })
    ).toBe(true);
    expect(
      queries.isHandleConnected({ nodeId: 'answer', handleId: 'target', direction: 'target' })
    ).toBe(true);
  });

  it('getIncomingEdges 只暴露端点字段并按结构更新', () => {
    const editor = createGraphRuntime();
    const queries = editor.getGraphQueries();

    const incoming = queries.getIncomingEdges('answer');
    expect(incoming).toEqual([
      { source: 'start', sourceHandle: 'source', target: 'answer', targetHandle: 'target' },
      { source: 'tool1', sourceHandle: 'source', target: 'answer', targetHandle: 'answer-target' }
    ]);
    // 内部边记录不外泄：没有 Runtime Edge ID，也没有多余字段。
    expect(Object.keys(incoming[0])).toEqual(['source', 'sourceHandle', 'target', 'targetHandle']);
    expect(Object.isFrozen(incoming)).toBe(true);
    expect(Object.isFrozen(incoming[0])).toBe(true);

    // 没有入边时返回共享空数组，不同入参之间身份也相同。
    expect(queries.getIncomingEdges('start')).toBe(queries.getIncomingEdges('missing'));
    expect(queries.getIncomingEdges('start')).toEqual([]);

    editor.dispatch({ type: 'addNode', node: node('answer2', FlowNodeTypeEnum.answerNode) });
    expect(queries.getIncomingEdges('answer2')).toBe(queries.getIncomingEdges('start'));
    expect(
      editor.dispatch({
        type: 'connectEdge',
        edge: { ...flowEdge, target: 'answer2', targetHandle: 'target' }
      }).ok
    ).toBe(true);
    expect(queries.getIncomingEdges('answer2')).toEqual([
      { source: 'start', sourceHandle: 'source', target: 'answer2', targetHandle: 'target' }
    ]);

    // 删掉一个目标节点，另一个目标节点的入边不受影响。
    editor.dispatch({ type: 'removeNodes', nodeIds: ['answer2'] });
    expect(queries.getIncomingEdges('answer2')).toEqual([]);
    expect(queries.getIncomingEdges('answer')).toBe(incoming);
  });

  it('getChildNodeIds 读容器直接子节点与根级桶', () => {
    const editor = createGraphRuntime();
    const queries = editor.getGraphQueries();

    expect(queries.getChildNodeIds('loop')).toEqual(['loopStart', 'child']);
    // 空串是文档根：根级子节点也能查，app 侧不必自建 childrenNodeIdListMap。
    expect(queries.getChildNodeIds('')).toEqual(['start', 'answer', 'tool1', 'http', 'loop']);
    // 非容器与不存在的 id 都返回共享空数组。
    expect(queries.getChildNodeIds('start')).toBe(queries.getChildNodeIds('missing'));
    expect(queries.getChildNodeIds('start')).toEqual([]);

    editor.dispatch({ type: 'addNode', node: node('floating', FlowNodeTypeEnum.answerNode) });
    expect(queries.getChildNodeIds('')).toContain('floating');
    expect(queries.getChildNodeIds('loop')).toEqual(['loopStart', 'child']);

    // attach：根桶摘掉它，容器桶接上它。
    expect(
      editor.dispatch({ type: 'attachToContainer', nodeId: 'floating', containerId: 'loop' }).ok
    ).toBe(true);
    expect(queries.getChildNodeIds('loop')).toEqual(['loopStart', 'child', 'floating']);
    expect(queries.getChildNodeIds('')).not.toContain('floating');

    // 删子节点与 undo。
    expect(editor.dispatch({ type: 'removeNodes', nodeIds: ['child'] }).ok).toBe(true);
    expect(queries.getChildNodeIds('loop')).toEqual(['loopStart', 'floating']);
    editor.undo();
    expect(queries.getChildNodeIds('loop')).toEqual(['loopStart', 'child', 'floating']);
  });

  it('getSourceNodeIds 收回来源闭包、容器引用和可选直接子节点', () => {
    const editor = createGraphRuntime();
    const queries = editor.getGraphQueries();

    expect(queries.getSourceNodeIds({ nodeId: 'child' })).toEqual(['start']);
    expect(queries.getSourceNodeIds({ nodeId: 'child' })).toBe(
      queries.getSourceNodeIds({ nodeId: 'child' })
    );
    expect(queries.getSourceNodeIds({ nodeId: 'loop', includeChildren: true })).toEqual([
      'loopStart',
      'child'
    ]);

    // 几何变化不改变来源查询身份；结构变化后按新 document 重新计算。
    editor.dispatch({ type: 'commitGeometry', nodeId: 'child', position: { x: 10, y: 20 } });
    expect(queries.getSourceNodeIds({ nodeId: 'child' })).toEqual(['start']);
    editor.dispatch({ type: 'disconnectEdge', edge: flowEdge });
    expect(queries.getSourceNodeIds({ nodeId: 'child' })).toEqual(['start']);
    expect(queries.getSourceNodeIds({ nodeId: 'answer' })).toEqual(['tool1']);
  });

  it('整文档替换后按新文档重建查询结果', () => {
    const editor = createGraphRuntime();
    const queries = editor.getGraphQueries();
    const document = editor.getWorkflowData();

    expect(
      editor.dispatch({
        type: 'replaceDocument',
        document: {
          ...document,
          nodes: document.nodes.filter((item) => item.nodeId !== 'child'),
          edges: document.edges.filter(
            (item) => item.targetHandle !== NodeOutputKeyEnum.selectedTools
          )
        } as never
      }).ok
    ).toBe(true);
    expect(queries.getChildNodeIds('loop')).toEqual(['loopStart']);
    expect(queries.isMountedTool('http')).toBe(false);
    expect(queries.getIncomingEdges('http')).toEqual([]);
    expect(
      queries.isHandleConnected({
        nodeId: 'tool1',
        handleId: NodeOutputKeyEnum.selectedTools,
        direction: 'source'
      })
    ).toBe(false);
    // 替换后仍在的边按新索引重建，内容与替换前一致。
    expect(queries.getIncomingEdges('answer')).toHaveLength(2);
    // 查询对象身份跨越 replace 不变。
    expect(editor.getGraphQueries()).toBe(queries);
  });

  it('集合身份在同一结构版本内稳定，结构变化后更新', () => {
    const editor = createGraphRuntime();
    const queries = editor.getGraphQueries();

    // port 每次返回同一个对象：可以直接当 selector 入参与 memo 依赖。
    expect(editor.getGraphQueries()).toBe(queries);

    const incoming = queries.getIncomingEdges('answer');
    const children = queries.getChildNodeIds('loop');
    expect(queries.getIncomingEdges('answer')).toBe(incoming);
    expect(queries.getChildNodeIds('loop')).toBe(children);

    // 纯几何提交不改结构：拖拽不能让 selector 结果换身份，否则每个 handle 都会重渲染。
    expect(
      editor.dispatch({ type: 'commitGeometry', nodeId: 'answer', position: { x: 10, y: 20 } }).ok
    ).toBe(true);
    expect(editor.getGraphQueries()).toBe(queries);
    expect(queries.getIncomingEdges('answer')).toBe(incoming);
    expect(queries.getChildNodeIds('loop')).toBe(children);

    // 字段编辑同样不动图索引。
    editor.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'Renamed' } });
    expect(queries.getIncomingEdges('answer')).toBe(incoming);

    // 结构变化后身份更新，且内容跟着变。
    editor.dispatch({ type: 'disconnectEdge', edge: flowEdge });
    const nextIncoming = queries.getIncomingEdges('answer');
    expect(nextIncoming).not.toBe(incoming);
    expect(nextIncoming).toEqual([
      { source: 'tool1', sourceHandle: 'source', target: 'answer', targetHandle: 'answer-target' }
    ]);
    expect(queries.getIncomingEdges('answer')).toBe(nextIncoming);

    editor.dispatch({ type: 'removeNodes', nodeIds: ['child'] });
    const nextChildren = queries.getChildNodeIds('loop');
    expect(nextChildren).not.toBe(children);
    expect(nextChildren).toEqual(['loopStart']);
    expect(queries.getChildNodeIds('loop')).toBe(nextChildren);

    // undo 后值恢复；身份不保证跨版本复用，因此只断言内容。
    editor.undo();
    expect(queries.getChildNodeIds('loop')).toEqual(['loopStart', 'child']);
    editor.undo();
    expect(queries.getIncomingEdges('answer')).toEqual(incoming);
    expect(editor.getGraphQueries()).toBe(queries);
  });

  it('释放后查询返回空结果而不抛错', () => {
    const editor = createGraphRuntime();
    const queries = editor.getGraphQueries();

    editor.dispose();

    // 卸载竞态里 selector 还会跑一次：返回空结果比抛错安全。
    expect(() => queries.isMountedTool('http')).not.toThrow();
    expect(queries.isMountedTool('http')).toBe(false);
    expect(
      queries.isHandleConnected({ nodeId: 'start', handleId: 'source', direction: 'source' })
    ).toBe(false);
    expect(queries.getIncomingEdges('answer')).toEqual([]);
    expect(queries.getChildNodeIds('loop')).toEqual([]);
  });
});
