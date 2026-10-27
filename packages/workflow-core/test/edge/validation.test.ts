import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { WorkflowDocumentSchema } from '@fastgpt/global/core/workflow/type/document';
import { applyWorkflowCommand } from '../../src/command/apply';
import {
  assertExecutionConnection,
  checkExecutionConnection,
  assertExecutionEdge,
  getDefaultExecutionSourcePort,
  getExecutionBranchKeys
} from '../../src/edge/validation';
import { WorkflowCommandError } from '../../src/domain/diagnostic';
import {
  FlowNodeTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { CommentNode } from '@fastgpt/global/core/workflow/template/system/comment';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { StoreNodeItemTypeSchema } from '@fastgpt/global/core/workflow/type/node';
import { createWorkflowDocument } from '../../src/domain/document';
import { builtinTemplateProvider } from '../template/provider';
import fixture from '../fixtures/basic-static/workflow.json';
import { describe, expect, it } from 'vitest';
import { compileExecutionEdge } from '../../src/edge/compiler';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type {
  StoreEdgeItemType,
  WorkflowExecutionEdge
} from '@fastgpt/global/core/workflow/type/edge';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { USER_SELECT_REFERENCE_HANDLE_KEY } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';

describe('assertExecutionConnection', () => {
  it('isolates main and different tool flows in both directions without deleting edges', async () => {
    const document = WorkflowDocumentSchema.parse(fixture);
    document.nodes = [
      document.nodes.find((node) => node.nodeId === 'start')!,
      ...['caller', 'tool', 'tail', 'outer', 'free', 'other-tool', 'other-tail'].map((nodeId) =>
        StoreNodeItemTypeSchema.parse({
          ...(nodeId === 'caller' ? ToolCallNode : AiChatModule),
          nodeId
        })
      )
    ];
    document.executionEdges = [
      { source: { kind: 'next', nodeId: 'start' }, target: { kind: 'target', nodeId: 'caller' } },
      { source: { kind: 'next', nodeId: 'caller' }, target: { kind: 'target', nodeId: 'outer' } },
      {
        source: { kind: 'selectedTools', nodeId: 'caller' },
        target: { kind: 'selectedTools', nodeId: 'tool' }
      },
      { source: { kind: 'next', nodeId: 'tool' }, target: { kind: 'target', nodeId: 'tail' } },
      {
        source: { kind: 'selectedTools', nodeId: 'caller' },
        target: { kind: 'selectedTools', nodeId: 'other-tool' }
      },
      {
        source: { kind: 'next', nodeId: 'other-tool' },
        target: { kind: 'target', nodeId: 'other-tail' }
      }
    ];
    const before = structuredClone(document);
    for (const [source, target] of [
      ['tail', 'caller'],
      ['tail', 'outer'],
      ['outer', 'tail'],
      ['caller', 'tail'],
      ['tail', 'other-tail'],
      ['other-tail', 'tail'],
      ['free', 'tail']
    ]) {
      const edge = {
        source: { kind: 'next' as const, nodeId: source },
        target: { kind: 'target' as const, nodeId: target }
      };
      expect(() => assertExecutionConnection({ document, edge })).toThrow(
        WorkflowDiagnosticCodeEnum.edgeCrossScope
      );
      await expect(
        applyWorkflowCommand({
          document,
          command: { type: 'edge.connect', edge },
          dependencies: { templateProvider: builtinTemplateProvider }
        })
      ).rejects.toThrow(WorkflowDiagnosticCodeEnum.edgeCrossScope);
      // 保存前的整图检查也必须识别已有越界边，不能依赖鼠标拖线入口。
      expect(() =>
        assertExecutionEdge(
          { ...document, executionEdges: [...document.executionEdges, edge] },
          edge
        )
      ).toThrow(WorkflowDiagnosticCodeEnum.edgeCrossScope);
    }
    expect(
      assertExecutionConnection({
        document,
        edge: {
          source: { kind: 'next', nodeId: 'tail' },
          target: { kind: 'target', nodeId: 'free' }
        }
      })
    ).toBeUndefined();
    expect(document).toEqual(before);
  });
  it('checks the same connection as the write command without modifying the document', async () => {
    const document = WorkflowDocumentSchema.parse(fixture);
    const edge = document.executionEdges.shift()!;
    const before = structuredClone(document);
    expect(assertExecutionConnection({ document, edge })).toBeUndefined();
    expect(document).toEqual(before);
    const result = await applyWorkflowCommand({
      document,
      command: { type: 'edge.connect', edge },
      dependencies: { templateProvider: builtinTemplateProvider }
    });
    expect(result.document.executionEdges.at(-1)).toEqual(edge);
    expect(document).toEqual(before);
  });

  it('rejects duplicate and self connections without modifying the document', () => {
    const document = WorkflowDocumentSchema.parse(fixture);
    const before = structuredClone(document);
    expect(() => assertExecutionConnection({ document, edge: document.executionEdges[0] })).toThrow(
      WorkflowDiagnosticCodeEnum.edgeDuplicated
    );
    expect(() =>
      assertExecutionConnection({
        document,
        edge: {
          source: { kind: 'next', nodeId: 'text' },
          target: { kind: 'target', nodeId: 'text' }
        }
      })
    ).toThrow(WorkflowCommandError);
    expect(document).toEqual(before);
  });
});

describe('assertExecutionEdge', () => {
  const templates = [...moduleTemplatesFlat, CommentNode];
  /** 从真实模板投影持久化节点，覆盖手写节点容易遗漏的能力差异。 */
  const createNode = (template: (typeof templates)[number], nodeId: string) =>
    StoreNodeItemTypeSchema.parse({ ...template, nodeId });
  const answer = templates.find(
    (template) => template.flowNodeType === FlowNodeTypeEnum.answerNode
  )!;
  const caller = templates.find((template) => template.flowNodeType === FlowNodeTypeEnum.toolCall)!;

  it('allows exactly the ordinary source and target ports exposed by existing templates', () => {
    for (const template of templates) {
      for (const direction of ['source', 'target'] as const) {
        const document = createWorkflowDocument({
          nodes:
            direction === 'source'
              ? [createNode(template, 'source'), createNode(answer, 'target')]
              : [createNode(caller, 'source'), createNode(template, 'target')]
        });
        const connect = () =>
          assertExecutionEdge(document, {
            source: { kind: 'next', nodeId: 'source' },
            target: { kind: 'target', nodeId: 'target' }
          });
        const enabled =
          direction === 'source' ? template.showSourceHandle : template.showTargetHandle;
        const message = `${template.flowNodeType} ${direction}`;
        if (
          enabled &&
          direction === 'target' &&
          [
            FlowNodeTypeEnum.toolParams,
            FlowNodeTypeEnum.stopTool,
            FlowNodeTypeEnum.loopRunBreak
          ].includes(template.flowNodeType)
        ) {
          expect(connect, message).toThrow(WorkflowCommandError);
        } else if (enabled) expect(connect, message).not.toThrow();
        else
          expect(connect, message).toThrow(
            direction === 'source'
              ? WorkflowDiagnosticCodeEnum.nextPortUnsupported
              : WorkflowDiagnosticCodeEnum.targetPortUnsupported
          );
      }
    }
  });

  it('matches every template tool capability without a separately maintained node list', () => {
    for (const template of templates) {
      const document = createWorkflowDocument({
        nodes: [createNode(caller, 'caller'), createNode(template, 'tool')]
      });
      const connect = () =>
        assertExecutionEdge(document, {
          source: { kind: 'selectedTools', nodeId: 'caller' },
          target: { kind: 'selectedTools', nodeId: 'tool' }
        });
      if (template.isTool) expect(connect, template.flowNodeType).not.toThrow();
      else
        expect(connect, template.flowNodeType).toThrow(
          WorkflowDiagnosticCodeEnum.toolEdgeNodeInvalid
        );
    }
  });

  it('rejects editor-only node types without a runtime template', () => {
    const document = createWorkflowDocument({
      nodes: [
        createNode(caller, 'caller'),
        createNode({ ...answer, flowNodeType: FlowNodeTypeEnum.globalVariable }, 'config')
      ]
    });
    expect(() =>
      assertExecutionEdge(document, {
        source: { kind: 'selectedTools', nodeId: 'caller' },
        target: { kind: 'selectedTools', nodeId: 'config' }
      })
    ).toThrow(WorkflowDiagnosticCodeEnum.toolEdgeNodeInvalid);
  });

  it('retains enabled catch and container-scope guards', () => {
    const document = createWorkflowDocument({
      nodes: [createNode(caller, 'caller'), createNode(answer, 'target')]
    });
    const catchEdge = {
      source: { kind: 'catch' as const, nodeId: 'caller' },
      target: { kind: 'target' as const, nodeId: 'target' }
    };
    expect(() => assertExecutionEdge(document, catchEdge)).toThrow(
      WorkflowDiagnosticCodeEnum.catchNotEnabled
    );
    document.nodes[0].catchError = true;
    expect(() => assertExecutionEdge(document, catchEdge)).not.toThrow();
    const toolEdge = {
      source: { kind: 'selectedTools' as const, nodeId: 'caller' },
      target: { kind: 'selectedTools' as const, nodeId: 'target' }
    };
    document.nodes[1].flowNodeType = FlowNodeTypeEnum.code;
    document.nodes[1].parentNodeId = 'container';
    expect(() => assertExecutionEdge(document, toolEdge)).toThrow(
      WorkflowDiagnosticCodeEnum.edgeCrossScope
    );
  });
});

describe('getDefaultExecutionSourcePort', () => {
  it('supports inserting a reply before subsequent processing', () => {
    const document = WorkflowDocumentSchema.parse(fixture);
    expect(getDefaultExecutionSourcePort(document, 'answer')).toEqual({
      kind: 'next',
      nodeId: 'answer'
    });
  });
});

describe('checkExecutionConnection', () => {
  const node = (nodeId: string, type = FlowNodeTypeEnum.chatNode): StoreNodeItemType =>
    StoreNodeItemTypeSchema.parse({
      ...moduleTemplatesFlat.find((item) => item.flowNodeType === type)!,
      nodeId
    });
  const ordinary = (source: string, target: string): StoreEdgeItemType => ({
    source,
    target,
    sourceHandle: `${source}-source-right`,
    targetHandle: `${target}-target-left`
  });
  const tool = (source: string, target: string): StoreEdgeItemType => ({
    source,
    target,
    sourceHandle: NodeOutputKeyEnum.selectedTools,
    targetHandle: NodeOutputKeyEnum.selectedTools
  });
  const evaluate = ({
    connection,
    edges = [],
    nodes = [node('source', FlowNodeTypeEnum.toolCall), node('target'), node('other')]
  }: {
    connection: Parameters<typeof checkExecutionConnection>[0]['connection'];
    edges?: Parameters<typeof checkExecutionConnection>[0]['edges'];
    nodes?: StoreNodeItemType[];
  }) =>
    checkExecutionConnection({
      connection,
      edges,
      getNodeById: (id) => nodes.find((item) => item.nodeId === id)
    });

  it.each([
    ['self', ordinary('source', 'source'), [], WorkflowDiagnosticCodeEnum.edgeSelfConnection],
    ['missing node', ordinary('missing', 'target'), [], WorkflowDiagnosticCodeEnum.nodeNotFound],
    ['missing target', ordinary('source', 'missing'), [], WorkflowDiagnosticCodeEnum.nodeNotFound],
    [
      'missing handle',
      { ...ordinary('source', 'target'), sourceHandle: null },
      [],
      WorkflowDiagnosticCodeEnum.edgeHandleUnsupported
    ],
    [
      'invalid handle',
      { ...ordinary('source', 'target'), targetHandle: 'invalid' },
      [],
      WorkflowDiagnosticCodeEnum.edgeHandleUnsupported
    ],
    [
      'tool port mismatch',
      { ...ordinary('source', 'target'), sourceHandle: NodeOutputKeyEnum.selectedTools },
      [],
      WorkflowDiagnosticCodeEnum.toolEdgeInvalid
    ],
    [
      'ordinary duplicate',
      ordinary('source', 'target'),
      [ordinary('source', 'target')],
      WorkflowDiagnosticCodeEnum.edgeDuplicated
    ],
    [
      'historical right duplicate',
      ordinary('source', 'target'),
      [{ ...ordinary('source', 'target'), targetHandle: 'target-target-right' }],
      WorkflowDiagnosticCodeEnum.edgeDuplicated
    ],
    [
      'tool duplicate',
      tool('source', 'target'),
      [tool('source', 'target')],
      WorkflowDiagnosticCodeEnum.edgeDuplicated
    ],
    [
      'tool with normal input',
      tool('source', 'target'),
      [ordinary('other', 'target')],
      WorkflowDiagnosticCodeEnum.toolTargetHasNormalEdges
    ],
    [
      'tool already owned',
      tool('source', 'target'),
      [tool('other', 'target')],
      WorkflowDiagnosticCodeEnum.toolTargetAlreadyAttached
    ],
    [
      'ordinary into tool root',
      ordinary('source', 'target'),
      [tool('other', 'target')],
      WorkflowDiagnosticCodeEnum.normalTargetHasToolEdges
    ]
  ] as const)(
    'returns a refusal reason for %s without changing edges',
    (_name, connection, edges, code) => {
      const before = structuredClone(edges);
      expect(evaluate({ connection, edges: [...edges] })).toMatchObject({
        allowed: false,
        reason: { code }
      });
      expect(edges).toEqual(before);
    }
  );

  it('keeps raw and semantic candidates, command validation and existing-edge validation consistent', () => {
    const nodes = [node('source', FlowNodeTypeEnum.toolCall), node('target'), node('other')];
    const document = createWorkflowDocument({ nodes });
    for (const edge of [
      { source: { kind: 'next', nodeId: 'source' }, target: { kind: 'target', nodeId: 'target' } },
      {
        source: { kind: 'selectedTools', nodeId: 'source' },
        target: { kind: 'selectedTools', nodeId: 'target' }
      }
    ] as WorkflowExecutionEdge[]) {
      const raw = compileExecutionEdge(edge, document);
      expect(evaluate({ connection: edge, nodes })).toEqual({ allowed: true });
      expect(evaluate({ connection: raw, nodes })).toEqual({ allowed: true });
      document.executionEdges = [edge];
      expect(() => assertExecutionEdge(document, edge)).not.toThrow();
      expect(() => assertExecutionConnection({ document, edge })).toThrow(
        WorkflowDiagnosticCodeEnum.edgeDuplicated
      );
      expect(evaluate({ connection: edge, edges: [edge], nodes })).toMatchObject({
        allowed: false,
        reason: { code: WorkflowDiagnosticCodeEnum.edgeDuplicated }
      });
    }
  });

  it('ignores unrelated legacy handles without bypassing the new connection rules', () => {
    const edges = [{ ...ordinary('other', 'source'), targetHandle: 'legacy-handle' }];
    expect(evaluate({ connection: ordinary('source', 'target'), edges })).toEqual({
      allowed: true
    });
    expect(
      evaluate({ connection: { ...ordinary('source', 'target'), sourceHandle: 'unknown' }, edges })
    ).toMatchObject({
      allowed: false,
      reason: { code: WorkflowDiagnosticCodeEnum.edgeHandleUnsupported }
    });
  });

  it.each(['next', 'sourceOutput'] as const)(
    'rejects direct and transitive serial cycles through any %s port',
    async (kind) => {
      const source = node('source');
      source.outputs.push({
        id: 'custom',
        key: 'custom',
        label: '',
        type: FlowNodeOutputTypeEnum.source
      });
      const middle = node('middle');
      const nodes = [node('upstream'), middle, source];
      const candidate: WorkflowExecutionEdge = {
        source: (() => {
          if (kind === 'sourceOutput') return { kind, nodeId: 'source', outputKey: 'custom' };
          return { kind, nodeId: 'source' };
        })(),
        target: { kind: 'target', nodeId: 'upstream' }
      };
      for (const targetId of ['source', 'middle']) {
        const document = createWorkflowDocument({
          nodes,
          executionEdges: [
            {
              source: { kind: 'next', nodeId: 'upstream' },
              target: { kind: 'target', nodeId: targetId }
            },
            ...(targetId === 'middle'
              ? [
                  {
                    source: { kind: 'next' as const, nodeId: 'middle' },
                    target: { kind: 'target' as const, nodeId: 'source' }
                  }
                ]
              : [])
          ]
        });
        const before = structuredClone(document);
        for (const connection of [candidate, compileExecutionEdge(candidate, document)]) {
          // Core 语义边与画布原始 handle 均检查不经过分支的回流路径。
          for (const edges of [
            document.executionEdges,
            document.executionEdges.map((edge) => compileExecutionEdge(edge, document))
          ])
            expect(evaluate({ connection, edges, nodes })).toMatchObject({
              allowed: false,
              reason: { code: WorkflowDiagnosticCodeEnum.edgeCreatesCycle }
            });
        }
        await expect(
          applyWorkflowCommand({
            document,
            command: { type: 'edge.connect', edge: candidate },
            dependencies: { templateProvider: builtinTemplateProvider }
          })
        ).rejects.toThrow(WorkflowDiagnosticCodeEnum.edgeCreatesCycle);
        expect(() =>
          assertExecutionEdge(
            { ...document, executionEdges: [...document.executionEdges, candidate] },
            candidate
          )
        ).toThrow(WorkflowDiagnosticCodeEnum.edgeCreatesCycle);
        expect(document).toEqual(before);
      }
    }
  );

  it.each([
    FlowNodeTypeEnum.ifElseNode,
    FlowNodeTypeEnum.classifyQuestion,
    FlowNodeTypeEnum.userSelect,
    'catch',
    'success',
    'custom-success'
  ] as const)(
    'allows a cycle controlled by a %s port at any position in the loop',
    async (branchType) => {
      for (const branchId of ['a', 'b', 'c']) {
        const nodes = ['a', 'b', 'c'].map((id) =>
          node(
            id,
            id === branchId && !['catch', 'success', 'custom-success'].includes(branchType)
              ? (branchType as FlowNodeTypeEnum)
              : undefined
          )
        );
        const branch = nodes.find((item) => item.nodeId === branchId)!;
        const inputKey =
          branchType === FlowNodeTypeEnum.userSelect
            ? NodeInputKeyEnum.userSelectOptions
            : NodeInputKeyEnum.agents;
        if (['catch', 'success', 'custom-success'].includes(branchType)) branch.catchError = true;
        else if (branchType !== FlowNodeTypeEnum.ifElseNode)
          branch.inputs.find((input) => input.key === inputKey)!.value = [
            { key: 'continue', value: 'Continue' },
            { key: 'exit', value: 'Exit' }
          ];
        if (branchType === 'custom-success')
          branch.outputs.push({
            id: 'custom',
            key: 'custom',
            type: FlowNodeOutputTypeEnum.source,
            label: ''
          });
        const source = (nodeId: string): WorkflowExecutionEdge['source'] => {
          if (nodeId !== branchId || branchType === 'success') return { kind: 'next', nodeId };
          if (branchType === 'catch') return { kind: 'catch', nodeId };
          if (branchType === 'custom-success')
            return { kind: 'sourceOutput', nodeId, outputKey: 'custom' };
          return {
            kind: 'branch',
            nodeId,
            branchKey: branchType === FlowNodeTypeEnum.ifElseNode ? 'ELSE' : 'continue'
          };
        };
        const document = createWorkflowDocument({
          nodes,
          executionEdges: [
            { source: source('a'), target: { kind: 'target', nodeId: 'b' } },
            { source: source('b'), target: { kind: 'target', nodeId: 'c' } }
          ]
        });
        const candidate: WorkflowExecutionEdge = {
          source: source('c'),
          target: { kind: 'target', nodeId: 'a' }
        };
        for (const connection of [candidate, compileExecutionEdge(candidate, document)])
          for (const edges of [
            document.executionEdges,
            document.executionEdges.map((edge) => compileExecutionEdge(edge, document))
          ])
            expect(evaluate({ nodes, connection, edges })).toEqual({ allowed: true });
        const before = structuredClone(document);
        const result = await applyWorkflowCommand({
          document,
          command: { type: 'edge.connect', edge: candidate },
          dependencies: { templateProvider: builtinTemplateProvider }
        });
        for (const edge of result.document.executionEdges)
          expect(() => assertExecutionEdge(result.document, edge)).not.toThrow();
        expect(document).toEqual(before);
      }
    }
  );

  it('does not exempt a return path merely because its node has conditional ports', () => {
    const branch = node('branch', FlowNodeTypeEnum.ifElseNode);
    branch.catchError = false;
    branch.outputs.push({
      id: 'custom',
      key: 'custom',
      type: FlowNodeOutputTypeEnum.source,
      label: ''
    });
    const nodes = [node('source'), node('target'), branch];
    const document = createWorkflowDocument({ nodes });
    for (const source of [
      { kind: 'catch', nodeId: 'branch' },
      { kind: 'sourceOutput', nodeId: 'branch', outputKey: 'custom' },
      { kind: 'branch', nodeId: 'branch', branchKey: 'removed' }
    ] as WorkflowExecutionEdge['source'][]) {
      const edges: WorkflowExecutionEdge[] = [
        {
          source: { kind: 'next', nodeId: 'target' },
          target: { kind: 'target', nodeId: 'branch' }
        },
        { source, target: { kind: 'target', nodeId: 'source' } }
      ];
      for (const graph of [edges, edges.map((edge) => compileExecutionEdge(edge, document))])
        expect(
          evaluate({ nodes, edges: graph, connection: ordinary('source', 'target') })
        ).toMatchObject({
          allowed: false,
          reason: { code: WorkflowDiagnosticCodeEnum.edgeCreatesCycle }
        });
    }
  });

  it.each(['if-stable', 'if-legacy', 'classification', 'manual-options', 'dynamic-options'])(
    'accepts every declared branch handle in %s, including fallbacks and reserved-looking keys',
    (mode) => {
      const type = mode.startsWith('if-')
        ? FlowNodeTypeEnum.ifElseNode
        : mode === 'classification'
          ? FlowNodeTypeEnum.classifyQuestion
          : FlowNodeTypeEnum.userSelect;
      const branch = node('branch', type);
      const inputKey =
        type === FlowNodeTypeEnum.ifElseNode
          ? NodeInputKeyEnum.ifElseList
          : type === FlowNodeTypeEnum.classifyQuestion
            ? NodeInputKeyEnum.agents
            : NodeInputKeyEnum.userSelectOptions;
      const input = branch.inputs.find((item) => item.key === inputKey)!;
      input.value =
        mode === 'if-stable'
          ? [{ branchId: 'first' }, { branchId: 'second' }]
          : mode === 'if-legacy'
            ? [{}, {}]
            : [
                { key: 'first', value: 'First' },
                { key: 'right', value: 'Fallback' }
              ];
      if (mode === 'dynamic-options') {
        input.selectedType = FlowNodeInputTypeEnum.reference;
        input.value = [['target', 'options']];
      }
      const expectedKeys =
        mode === 'if-stable'
          ? ['first', 'second', 'ELSE']
          : mode === 'if-legacy'
            ? ['IF', 'ELSE IF 1', 'ELSE']
            : mode === 'dynamic-options'
              ? [USER_SELECT_REFERENCE_HANDLE_KEY]
              : ['first', 'right'];
      expect(getExecutionBranchKeys(branch)).toEqual(expectedKeys);
      const nodes = [node('target'), branch, node('source')];
      const document = createWorkflowDocument({ nodes });
      for (const branchKey of expectedKeys) {
        const edges: WorkflowExecutionEdge[] = [
          {
            source: { kind: 'next', nodeId: 'target' },
            target: { kind: 'target', nodeId: 'branch' }
          },
          {
            source: { kind: 'branch', nodeId: 'branch', branchKey },
            target: { kind: 'target', nodeId: 'source' }
          }
        ];
        for (const graph of [edges, edges.map((edge) => compileExecutionEdge(edge, document))])
          expect(
            evaluate({ nodes, edges: graph, connection: ordinary('source', 'target') })
          ).toEqual({ allowed: true });
      }
    }
  );

  it('keeps valid conditional sources usable when an unrelated historical target handle is unknown', () => {
    const nodes = [{ ...node('target'), catchError: true }, node('source')];
    const edges = [{ ...ordinary('target', 'source'), targetHandle: 'legacy-target' }];
    const before = structuredClone(edges);
    expect(evaluate({ nodes, edges, connection: ordinary('source', 'target') })).toEqual({
      allowed: true
    });
    expect(edges).toEqual(before);
  });

  it('checks every return path so a branch outside a serial cycle cannot bypass the rule', () => {
    const nodes = ['source', 'target', 'middle', 'branch'].map((id) =>
      node(id, id === 'branch' ? FlowNodeTypeEnum.ifElseNode : undefined)
    );
    const edges = [
      ordinary('target', 'middle'),
      ordinary('middle', 'source'),
      { ...ordinary('branch', 'source'), sourceHandle: 'branch-source-ELSE' }
    ];
    for (const branchEdge of [ordinary('branch', 'target'), ordinary('target', 'branch')])
      expect(
        evaluate({ nodes, edges: [...edges, branchEdge], connection: ordinary('source', 'target') })
      ).toMatchObject({
        allowed: false,
        reason: { code: WorkflowDiagnosticCodeEnum.edgeCreatesCycle }
      });
  });

  it('allows forward branches and merges while safely traversing unrelated historical cycles', () => {
    const nodes = ['source', 'left', 'right', 'target', 'cycle-a', 'cycle-b'].map((id) => node(id));
    const edges = [
      ordinary('source', 'left'),
      ordinary('source', 'right'),
      ordinary('left', 'target'),
      ordinary('right', 'target'),
      ordinary('cycle-a', 'cycle-b'),
      ordinary('cycle-b', 'cycle-a')
    ];
    expect(evaluate({ nodes, edges, connection: ordinary('source', 'target') })).toEqual({
      allowed: true
    });
    expect(evaluate({ nodes, edges, connection: ordinary('source', 'cycle-a') })).toEqual({
      allowed: true
    });
  });

  it('requires an explicit detach before assigning a tool entry to another caller', async () => {
    const nodes = [
      node('caller-a', FlowNodeTypeEnum.toolCall),
      node('caller-b', FlowNodeTypeEnum.toolCall),
      node('entry')
    ];
    const document = createWorkflowDocument({ nodes });
    const original: WorkflowExecutionEdge = {
      source: { kind: 'selectedTools', nodeId: 'caller-a' },
      target: { kind: 'selectedTools', nodeId: 'entry' }
    };
    const candidate: WorkflowExecutionEdge = {
      source: { kind: 'selectedTools', nodeId: 'caller-b' },
      target: { kind: 'selectedTools', nodeId: 'entry' }
    };
    document.executionEdges = [original];
    const before = structuredClone(document);
    const raw = compileExecutionEdge(candidate, document);
    for (const connection of [candidate, raw]) {
      expect(evaluate({ connection, nodes, edges: document.executionEdges })).toMatchObject({
        allowed: false,
        reason: {
          code: WorkflowDiagnosticCodeEnum.toolTargetAlreadyAttached,
          params: { ownerNodeId: 'caller-a' }
        }
      });
    }
    await expect(
      applyWorkflowCommand({
        document,
        command: { type: 'edge.connect', edge: candidate },
        dependencies: { templateProvider: builtinTemplateProvider }
      })
    ).rejects.toThrow(WorkflowDiagnosticCodeEnum.toolTargetAlreadyAttached);
    const shared = { ...document, executionEdges: [original, candidate] };
    for (const edge of shared.executionEdges)
      expect(() => assertExecutionEdge(shared, edge)).toThrow(
        WorkflowDiagnosticCodeEnum.toolTargetAlreadyAttached
      );
    expect(document).toEqual(before);
    const detached = await applyWorkflowCommand({
      document,
      command: { type: 'edge.disconnect', edge: original },
      dependencies: { templateProvider: builtinTemplateProvider }
    });
    const reassigned = await applyWorkflowCommand({
      document: detached.document,
      command: { type: 'edge.connect', edge: candidate },
      dependencies: { templateProvider: builtinTemplateProvider }
    });
    expect(reassigned.document.executionEdges).toEqual([candidate]);
    expect(document).toEqual(before);
  });

  it('applies tool-only templates and container restrictions to raw handles and Core commands alike', () => {
    const caller = node('source', FlowNodeTypeEnum.toolCall);
    const params = node('target', FlowNodeTypeEnum.toolParams);
    expect(
      evaluate({ nodes: [caller, params], connection: ordinary('source', 'target') })
    ).toMatchObject({
      allowed: false,
      reason: { code: WorkflowDiagnosticCodeEnum.templateUnavailable }
    });
    expect(evaluate({ nodes: [caller, params], connection: tool('source', 'target') })).toEqual({
      allowed: true
    });
    const stop = node('target', FlowNodeTypeEnum.stopTool);
    expect(
      evaluate({ nodes: [caller, stop], connection: ordinary('source', 'target') }).allowed
    ).toBe(false);
    expect(
      evaluate({
        nodes: [caller, stop, node('outer', FlowNodeTypeEnum.toolCall)],
        edges: [tool('outer', 'source')],
        connection: ordinary('source', 'target')
      })
    ).toEqual({ allowed: true });
    const parallel = node('parallel', FlowNodeTypeEnum.parallelRun);
    const source = { ...node('source'), parentNodeId: 'parallel' };
    const target = { ...node('target', FlowNodeTypeEnum.userSelect), parentNodeId: 'parallel' };
    const document = createWorkflowDocument({ nodes: [parallel, source, target] });
    const edge: WorkflowExecutionEdge = {
      source: { kind: 'next', nodeId: 'source' },
      target: { kind: 'target', nodeId: 'target' }
    };
    expect(evaluate({ nodes: document.nodes, connection: edge })).toMatchObject({
      allowed: false,
      reason: { code: WorkflowDiagnosticCodeEnum.nodeNotAllowedInContainer }
    });
    expect(() => assertExecutionConnection({ document, edge })).toThrow(
      WorkflowDiagnosticCodeEnum.nodeNotAllowedInContainer
    );
  });

  it('checks branch configuration, catch switches and removed source outputs', () => {
    const branch = node('source', FlowNodeTypeEnum.ifElseNode);
    branch.inputs.find((input) => input.key === NodeInputKeyEnum.ifElseList)!.value = [
      { branchId: 'valid' }
    ];
    const target = node('target');
    expect(
      evaluate({
        nodes: [branch, target],
        connection: { ...ordinary('source', 'target'), sourceHandle: 'source-source-valid' }
      })
    ).toEqual({ allowed: true });
    expect(
      evaluate({
        nodes: [branch, target],
        connection: { ...ordinary('source', 'target'), sourceHandle: 'source-source-removed' }
      })
    ).toMatchObject({
      allowed: false,
      reason: { code: WorkflowDiagnosticCodeEnum.branchKeyNotFound }
    });
    const source = node('source');
    const connection = {
      ...ordinary('source', 'target'),
      sourceHandle: 'source-source_catch-right'
    };
    expect(evaluate({ nodes: [source, target], connection })).toMatchObject({
      allowed: false,
      reason: { code: WorkflowDiagnosticCodeEnum.catchNotEnabled }
    });
    source.catchError = true;
    expect(evaluate({ nodes: [source, target], connection })).toEqual({ allowed: true });
    source.outputs.push({
      id: 'result-port',
      key: 'result-port',
      type: FlowNodeOutputTypeEnum.source,
      valueType: WorkflowIOValueTypeEnum.string,
      label: 'Result',
      invalid: true
    });
    expect(
      evaluate({
        nodes: [source, target],
        connection: { ...ordinary('source', 'target'), sourceHandle: 'source-source-result-port' }
      })
    ).toMatchObject({
      allowed: false,
      reason: { code: WorkflowDiagnosticCodeEnum.sourceOutputNotFound }
    });
  });
});
