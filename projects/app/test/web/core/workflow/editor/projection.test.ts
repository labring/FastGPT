import { describe, expect, it } from 'vitest';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type {
  WorkflowCommand,
  WorkflowRuntimePort
} from '@fastgpt/global/core/workflow/editor/types';
import { hydrateRuntime } from '@/web/core/workflow/editor/codec';
import type { CanvasNode } from '@/web/core/workflow/editor/canvas';
import {
  createProjectionCache,
  projectRuntimeCanvas,
  type ProjectionCache,
  type ViewDataOverlayMap
} from '@/web/core/workflow/editor/projection';

const t = ((key: string) => key) as never;

const createWorkflow = () => ({
  nodes: [
    {
      nodeId: 'start',
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      name: 'Start',
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: [
        {
          id: NodeOutputKeyEnum.userChatInput,
          key: NodeOutputKeyEnum.userChatInput,
          type: FlowNodeOutputTypeEnum.source,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    },
    {
      nodeId: 'http',
      flowNodeType: FlowNodeTypeEnum.httpRequest468,
      name: 'Http',
      position: { x: 100, y: 0 },
      // 显式关闭错误分支：否则 legacy migration 会按旧目标补一条 source_catch 边。
      catchError: false,
      inputs: [],
      outputs: []
    },
    {
      // 指向不存在的来源：hydrate 后该节点带 Issue View，用于验证问题状态不进画布数组。
      nodeId: 'answer',
      flowNodeType: FlowNodeTypeEnum.answerNode,
      name: 'Answer',
      position: { x: 200, y: 0 },
      inputs: [
        {
          key: NodeInputKeyEnum.answerText,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          valueType: WorkflowIOValueTypeEnum.string,
          value: ['missing', NodeOutputKeyEnum.userChatInput]
        }
      ],
      outputs: []
    }
  ],
  edges: [
    { source: 'start', target: 'http', sourceHandle: 'source', targetHandle: 'target' },
    { source: 'http', target: 'answer', sourceHandle: 'source', targetHandle: 'target' }
  ],
  chatConfig: {}
});

const createRuntime = () => {
  const runtime = hydrateRuntime({ input: createWorkflow(), t });
  runtime.refreshIssues('all');
  return runtime;
};

const project = (
  runtime: WorkflowRuntimePort,
  options: {
    overlays?: ViewDataOverlayMap;
    errorNodeId?: string;
    localNodes?: CanvasNode[];
    cache?: ProjectionCache;
  } = {}
) =>
  projectRuntimeCanvas({
    runtime,
    overlays: options.overlays ?? {},
    errorNodeId: options.errorNodeId,
    localNodes: options.localNodes ?? [],
    localEdges: [],
    cache: options.cache ?? createProjectionCache()
  });

/** 本地交互数组只需要 id 与被保留的交互字段。 */
const localNode = (id: string, fields: Record<string, unknown>) =>
  ({ id, data: { nodeId: id }, position: { x: 0, y: 0 }, ...fields }) as unknown as CanvasNode;

const nodeById = (nodes: CanvasNode[], id: string) => {
  const node = nodes.find((item) => item.id === id);
  if (!node) throw new Error(`missing projected node ${id}`);
  return node;
};

describe('workflow editor projection', () => {
  it('merges runtime snapshot with template-only display fields', () => {
    const runtime = createRuntime();
    const { nodes } = project(runtime);

    // unique / forbidDelete / showSourceHandle 只属于模板，canonical 文档不携带。
    expect(runtime.getNode('start')).not.toHaveProperty('unique');
    expect(nodeById(nodes, 'start').data).toMatchObject({
      nodeId: 'start',
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      unique: true,
      forbidDelete: true,
      showSourceHandle: true
    });
    expect(nodeById(nodes, 'start').type).toBe(FlowNodeTypeEnum.workflowStart);
    // hasToolInput 决定节点内是否渲染工具参数面板。
    expect(nodeById(nodes, 'http').data.hasToolInput).toBe(true);
  });

  it('keeps issue view out of the canvas array', () => {
    const runtime = createRuntime();
    expect(runtime.getNode('answer')?.issues.length).toBeGreaterThan(0);

    const { nodes } = project(runtime);

    expect(nodeById(nodes, 'answer').data).not.toHaveProperty('issues');
  });

  it('merges node view, overlay and issue focus into canvas data', () => {
    const runtime = createRuntime();
    runtime.dispatch({
      type: 'commitGeometry',
      nodeId: 'http',
      position: { x: 320, y: 40 },
      isFolded: true
    });

    const { nodes } = project(runtime, {
      overlays: { http: { searchedText: 'keyword' } },
      errorNodeId: 'answer'
    });

    const http = nodeById(nodes, 'http');
    expect(http.position).toEqual({ x: 320, y: 40 });
    expect(http.data.isFolded).toBe(true);
    expect(http.data.searchedText).toBe('keyword');

    const answer = nodeById(nodes, 'answer');
    expect(answer.data.isError).toBe(true);
    // 标红焦点节点强制选中，定位后无需再点一次。
    expect(answer.selected).toBe(true);
    expect(http.data).not.toHaveProperty('isError');
  });

  it('preserves renderer interaction state and dragging position', () => {
    const runtime = createRuntime();
    runtime.dispatch({ type: 'commitGeometry', nodeId: 'http', position: { x: 320, y: 40 } });

    const { nodes } = project(runtime, {
      localNodes: [
        localNode('http', {
          selected: true,
          dragging: true,
          position: { x: 999, y: 999 },
          width: 300,
          height: 120,
          measured: { width: 300, height: 120 }
        })
      ]
    });

    const http = nodeById(nodes, 'http');
    // 拖拽中的几何以本地数组为准，手势结束才提交给 Runtime。
    expect(http.position).toEqual({ x: 999, y: 999 });
    expect(http).toMatchObject({
      selected: true,
      dragging: true,
      width: 300,
      height: 120,
      measured: { width: 300, height: 120 }
    });
  });

  it('reuses node and edge objects until their structure changes', () => {
    const runtime = createRuntime();
    const cache = createProjectionCache();
    const first = project(runtime, { cache });
    const second = project(runtime, { cache });

    expect(second.nodes[0]).toBe(first.nodes[0]);
    expect(second.nodes[2]).toBe(first.nodes[2]);
    expect(second.edges[0]).toBe(first.edges[0]);

    // 只改一个节点：其余节点保持同一对象，避免整画布重渲染。
    runtime.dispatch({ type: 'updateNode', nodeId: 'http', patch: { name: 'Renamed' } });
    const third = project(runtime, { cache });

    expect(third.nodes[0]).toBe(first.nodes[0]);
    expect(third.nodes[1]).not.toBe(first.nodes[1]);
    expect(nodeById(third.nodes, 'http').data.name).toBe('Renamed');
    expect(third.edges[0]).toBe(first.edges[0]);
  });

  it('keeps node identity stable for input and output value changes', () => {
    const runtime = createRuntime();
    const cache = createProjectionCache();
    const first = project(runtime, { cache });

    runtime.dispatch([
      {
        type: 'updateField',
        nodeId: 'start',
        fieldKey: NodeOutputKeyEnum.userChatInput,
        kind: 'output',
        value: 'user input'
      },
      {
        type: 'updateField',
        nodeId: 'answer',
        fieldKey: NodeInputKeyEnum.answerText,
        value: 'answer value'
      }
    ] satisfies readonly WorkflowCommand[]);
    const second = project(runtime, { cache });

    expect(second.nodes[0]).toBe(first.nodes[0]);
    expect(second.nodes[2]).toBe(first.nodes[2]);
  });

  it('refreshes node identity when dynamic handle topology changes', () => {
    const runtime = hydrateRuntime({
      input: {
        nodes: [
          {
            nodeId: 'ifElse',
            flowNodeType: FlowNodeTypeEnum.ifElseNode,
            name: 'If Else',
            position: { x: 0, y: 0 },
            inputs: [
              {
                key: NodeInputKeyEnum.ifElseList,
                value: [{ branchId: 'branch-1', condition: 'AND', list: [] }]
              }
            ],
            outputs: []
          }
        ],
        edges: [],
        chatConfig: {}
      },
      t
    });
    const cache = createProjectionCache();
    const first = projectRuntimeCanvas({
      runtime,
      overlays: {},
      localNodes: [],
      localEdges: [],
      cache
    });

    runtime.dispatch({
      type: 'updateField',
      nodeId: 'ifElse',
      fieldKey: NodeInputKeyEnum.ifElseList,
      value: [
        { branchId: 'branch-1', condition: 'AND', list: [] },
        { branchId: 'branch-2', condition: 'AND', list: [] }
      ]
    });
    const second = projectRuntimeCanvas({
      runtime,
      overlays: {},
      localNodes: [],
      localEdges: [],
      cache
    });

    expect(second.nodes[0]).not.toBe(first.nodes[0]);
  });

  it('projects runtime edges by index and prunes stale cache entries', () => {
    const runtime = createRuntime();
    const cache = createProjectionCache();
    const first = project(runtime, { cache });

    expect(first.edges.map((edge) => edge.id)).toEqual(['wfedge-0', 'wfedge-1']);
    expect(first.edges[0]).toMatchObject({
      source: 'start',
      target: 'http',
      sourceHandle: 'source',
      targetHandle: 'target'
    });

    runtime.dispatch({ type: 'disconnectEdge', index: 0 });
    const second = project(runtime, { cache });

    expect(second.edges.map((edge) => edge.id)).toEqual(['wfedge-0']);
    expect(second.edges[0]).toMatchObject({ source: 'http', target: 'answer' });
    expect(cache.edges.size).toBe(1);
  });

  it('drops projected nodes removed from the document', () => {
    const runtime = createRuntime();
    const cache = createProjectionCache();
    expect(project(runtime, { cache }).nodes).toHaveLength(3);

    runtime.dispatch({ type: 'removeNodes', nodeIds: ['answer'] });
    const { nodes } = project(runtime, { cache });

    expect(nodes.map((node) => node.id)).toEqual(['start', 'http']);
    expect(cache.nodes.size).toBe(2);
  });
});
