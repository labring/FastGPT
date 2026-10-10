import { describe, expect, it } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { createWorkflowEditor } from '@fastgpt/global/core/workflow/editor/runtime/runtime';
import {
  hydrateWorkflowEditor,
  migrateStoreWorkflow
} from '@fastgpt/global/core/workflow/editor/protocol';
import type {
  WorkflowChange,
  WorkflowCommand,
  WorkflowDispatchResult,
  WorkflowEnvironment,
  WorkflowIssueUpdate,
  WorkflowRuntimePort
} from '@fastgpt/global/core/workflow/editor/types';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const createRuntime = (): WorkflowRuntimePort => {
  const editor = createWorkflowEditor({
    nodes: [
      {
        nodeId: 'start',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        name: 'Start',
        inputs: [],
        outputs: [
          {
            id: 'userChatInput',
            key: 'userChatInput',
            type: FlowNodeOutputTypeEnum.source,
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      },
      {
        nodeId: 'answer',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Answer',
        inputs: [
          {
            key: NodeInputKeyEnum.answerText,
            label: 'Answer',
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.reference,
            valueType: WorkflowIOValueTypeEnum.string
          }
        ],
        outputs: []
      }
    ],
    edges: [],
    chatConfig: {}
  });
  editor.dispatch({
    type: 'connectEdge',
    edge: { source: 'start', target: 'answer', sourceHandle: 'source', targetHandle: 'target' }
  });
  return editor;
};

/** 容器夹具：loopRun 带一份过期的子节点清单，用于验证结构变化后的派生字段重算。 */
const createContainerRuntime = (): WorkflowRuntimePort =>
  createWorkflowEditor({
    nodes: [
      {
        nodeId: 'start',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        name: 'Start',
        inputs: [],
        outputs: [
          {
            id: 'userChatInput',
            key: 'userChatInput',
            type: FlowNodeOutputTypeEnum.source,
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      },
      {
        nodeId: 'loop',
        flowNodeType: FlowNodeTypeEnum.loopRun,
        name: 'Loop',
        inputs: [
          {
            key: NodeInputKeyEnum.loopRunMode,
            label: 'Mode',
            renderTypeList: [FlowNodeInputTypeEnum.input],
            value: 'array'
          },
          {
            key: NodeInputKeyEnum.loopRunInputArray,
            label: 'Array',
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.arrayAny,
            value: []
          },
          {
            key: NodeInputKeyEnum.childrenNodeIdList,
            label: '',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.arrayString,
            value: ['ghost']
          }
        ],
        outputs: []
      }
    ],
    edges: [],
    chatConfig: {}
  });

describe('workflow editor runtime modules', () => {
  it('commits a command batch atomically', () => {
    const editor = createRuntime();
    const beforeHistory = editor.getHistory();
    const result = editor.dispatch([
      { type: 'updateNode', nodeId: 'answer', patch: { name: 'Updated' } },
      { type: 'updateNode', nodeId: 'missing', patch: { name: 'Missing' } }
    ] satisfies readonly WorkflowCommand[]);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('not_found');
    expect(editor.getNode('answer')?.name).toBe('Answer');
    expect(editor.getNode('start')).toBeDefined();
    expect(editor.getHistory()).toEqual(beforeHistory);
  });

  it('treats an unchanged command as a no-op', () => {
    const editor = createRuntime();
    const beforeHistory = editor.getHistory();
    const result = editor.dispatch({
      type: 'updateChatConfig',
      chatConfig: editor.getWorkflowData().chatConfig as never
    });

    expect(result.ok).toBe(true);
    expect(result.change).toBeUndefined();
    expect(editor.getHistory()).toEqual(beforeHistory);
  });

  it('separates general chat config changes from variable source changes', () => {
    const editor = createRuntime();

    const welcomeChange = editor.dispatch({
      type: 'updateChatConfig',
      chatConfig: { welcomeText: 'Hello' }
    });
    expect(welcomeChange.change?.changedRecords).toMatchObject({
      chatConfig: true,
      chatConfigVariablesChanged: false
    });

    const variableChange = editor.dispatch({
      type: 'updateChatConfig',
      chatConfig: {
        variables: [
          {
            key: 'customerName',
            label: 'Customer name',
            type: 'input',
            description: 'Name used by the workflow'
          }
        ]
      }
    });
    expect(variableChange.change?.changedRecords).toMatchObject({
      chatConfig: true,
      chatConfigVariablesChanged: true
    });
  });

  it('replaces a node record and carries its delete protection forward', () => {
    const editor = createRuntime();
    const result = editor.dispatch({
      type: 'replaceNode',
      nodeId: 'answer',
      node: {
        nodeId: 'answer',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Replaced',
        position: { x: 10, y: 12 },
        forbidDelete: true,
        inputs: [],
        outputs: []
      } as never
    });

    expect(result.ok).toBe(true);
    expect(result.change?.changedRecords.nodeIds).toEqual(['answer']);
    expect(result.change?.changedRecords.nodeViewIds).toEqual(['answer']);
    expect(editor.getNode('answer')?.name).toBe('Replaced');
    expect(editor.getNodeView('answer')?.position).toEqual({ x: 10, y: 12 });
    expect(editor.dispatch({ type: 'removeNodes', nodeIds: ['answer'] }).error?.code).toBe(
      'invalid_command'
    );
  });

  it('removes a node together with the edges attached to it', () => {
    const editor = createRuntime();
    const result = editor.dispatch({ type: 'removeNodes', nodeIds: ['answer'] });

    expect(result.ok).toBe(true);
    expect(result.change?.changedRecords.nodeIds).toEqual(['answer']);
    expect(result.change?.changedRecords.edgeIds).toHaveLength(1);
    expect(editor.getNode('answer')).toBeUndefined();
    expect(editor.getWorkflow().edges).toEqual([]);
  });

  it('keeps a break node inside a conditional loop', () => {
    const editor = createWorkflowEditor({ nodes: [], edges: [], chatConfig: {} });
    const added = editor.dispatch([
      {
        type: 'addNode',
        node: {
          nodeId: 'loop',
          flowNodeType: FlowNodeTypeEnum.loopRun,
          name: 'Loop',
          inputs: [
            {
              key: NodeInputKeyEnum.loopRunMode,
              label: 'Mode',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              value: 'conditional'
            }
          ],
          outputs: []
        }
      },
      {
        type: 'addNode',
        node: {
          nodeId: 'break',
          flowNodeType: FlowNodeTypeEnum.loopRunBreak,
          name: 'Break',
          parentNodeId: 'loop',
          inputs: [],
          outputs: []
        }
      }
    ] satisfies readonly WorkflowCommand[]);
    expect(added.ok).toBe(true);

    expect(editor.dispatch({ type: 'removeNodes', nodeIds: ['break'] }).error?.code).toBe(
      'invalid_command'
    );
    expect(editor.getNode('break')).toBeDefined();
    expect(editor.dispatch({ type: 'removeNodes', nodeIds: ['loop'] }).ok).toBe(true);
    expect(editor.getNode('break')).toBeUndefined();
  });

  it('records only the touched field for a single field update', () => {
    const editor = createRuntime();
    const result = editor.dispatch({
      type: 'updateField',
      nodeId: 'answer',
      fieldKey: NodeInputKeyEnum.answerText,
      value: 'hello'
    });

    expect(result.ok).toBe(true);
    expect(result.change?.changedRecords.nodeIds).toEqual(['answer']);
    expect(result.change?.changedRecords.nodeViewIds).toEqual([]);
    expect(result.change?.changedRecords.fieldIds).toEqual([
      { nodeId: 'answer', key: NodeInputKeyEnum.answerText, kind: 'input' }
    ]);
    expect(
      editor.getField({ nodeId: 'answer', fieldKey: NodeInputKeyEnum.answerText })?.input?.value
    ).toBe('hello');
  });

  it('derives node type specific issues', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'http',
          flowNodeType: FlowNodeTypeEnum.httpRequest468,
          name: 'HTTP',
          inputs: [],
          outputs: []
        },
        {
          nodeId: 'ifElse',
          flowNodeType: FlowNodeTypeEnum.ifElseNode,
          name: 'If',
          inputs: [],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    });

    expect(editor.getNode('http')?.issues.map((issue) => issue.code)).toContain('http_url_empty');
    expect(editor.getNode('ifElse')?.issues.map((issue) => issue.code)).toContain(
      'if_else_incomplete'
    );
  });

  it('commits geometry once and restores it through history', () => {
    const editor = createRuntime();
    const changes: WorkflowChange[] = [];
    editor.subscribe((change) => changes.push(change));
    const result = editor.dispatch([
      { type: 'commitGeometry', nodeId: 'answer', position: { x: 20, y: 30 } },
      { type: 'commitGeometry', nodeId: 'start', position: { x: 40, y: 50 } }
    ] satisfies readonly WorkflowCommand[]);

    expect(result.ok).toBe(true);
    expect(result.change?.kind).toBe('geometry');
    expect(result.change?.changedRecords.nodeViewIds).toEqual(['answer', 'start']);
    expect(editor.getNodeView('answer')?.position).toEqual({ x: 20, y: 30 });
    expect(editor.undo().ok).toBe(true);
    expect(editor.getNodeView('answer')?.position).toBeUndefined();
    expect(editor.redo().ok).toBe(true);
    expect(editor.getNodeView('answer')?.position).toEqual({ x: 20, y: 30 });
    expect(changes).toHaveLength(3);
  });

  it('does not publish a geometry change when every position is unchanged', () => {
    const editor = createRuntime();
    const first = editor.dispatch({
      type: 'commitGeometry',
      nodeId: 'answer',
      position: { x: 20, y: 30 }
    });
    expect(first.ok).toBe(true);
    const workflow = editor.getWorkflow();
    const history = editor.getHistory();

    const result = editor.dispatch([
      { type: 'commitGeometry', nodeId: 'answer', position: { x: 20, y: 30 } },
      { type: 'commitGeometry', nodeId: 'start', position: undefined }
    ] satisfies readonly WorkflowCommand[]);

    expect(result).toEqual({ ok: true });
    expect(editor.getWorkflow()).toBe(workflow);
    expect(editor.getHistory()).toEqual(history);
  });

  it('removes all runtime behavior after disposal', () => {
    const editor = createRuntime();
    const result: WorkflowDispatchResult = editor.dispatch({
      type: 'updateNode',
      nodeId: 'answer',
      patch: { name: 'Updated' }
    });
    expect(result.ok).toBe(true);
    editor.dispose();

    expect(() => editor.getWorkflow()).toThrow();
    expect(editor.dispatch({ type: 'removeNodes', nodeIds: ['answer'] }).error?.code).toBe(
      'disposed'
    );
  });

  it('derives reference options and statuses from the connected graph', () => {
    const editor = createRuntime();
    const query = { nodeId: 'answer', fieldKey: NodeInputKeyEnum.answerText };
    const options = editor.getField(query)?.referenceOptions ?? [];
    expect(options.map((item) => item.reference)).toContainEqual(['start', 'userChatInput']);
    expect(options.find((item) => item.reference[0] === 'start')).toEqual(
      expect.objectContaining({ sourceLabel: 'Start', outputLabel: 'userChatInput' })
    );

    editor.dispatch({ type: 'updateField', ...query, value: [['start', 'userChatInput']] });
    expect(editor.getField(query)?.references).toEqual([
      expect.objectContaining({ code: 'valid' })
    ]);
    expect(editor.getNode('answer')?.issues).toEqual([]);

    editor.dispatch({ type: 'updateField', ...query, value: [['start', 'missing']] });
    expect(editor.getField(query)?.references).toEqual([
      expect.objectContaining({ code: 'invalid_reference' })
    ]);
    expect(editor.getNode('answer')?.issues.map((issue) => issue.code)).toEqual([
      'invalid_reference'
    ]);
  });

  it('accepts array string references in string inputs after runtime formatting', () => {
    const editor = createRuntime();
    const start = editor.getNode('start');
    expect(start).toBeDefined();

    expect(
      editor.dispatch({
        type: 'replaceNode',
        nodeId: 'start',
        node: {
          ...start,
          outputs: [
            ...(start?.outputs ?? []),
            {
              id: NodeOutputKeyEnum.userFiles,
              key: NodeOutputKeyEnum.userFiles,
              type: FlowNodeOutputTypeEnum.source,
              valueType: WorkflowIOValueTypeEnum.arrayString
            }
          ]
        } as never
      }).ok
    ).toBe(true);

    const query = { nodeId: 'answer', fieldKey: NodeInputKeyEnum.answerText };
    editor.dispatch({
      type: 'updateField',
      ...query,
      value: [['start', NodeOutputKeyEnum.userFiles]]
    });

    expect(editor.getField(query)?.references).toEqual([
      expect.objectContaining({ code: 'valid', sourceType: WorkflowIOValueTypeEnum.arrayString })
    ]);
    expect(editor.getNode('answer')?.issues).toEqual([]);
  });

  it('keeps malformed reference arrays consistent between field status and issue rules', () => {
    const editor = createRuntime();
    const query = { nodeId: 'answer', fieldKey: NodeInputKeyEnum.answerText };
    editor.dispatch({
      type: 'updateField',
      ...query,
      value: [['start', 'missing'], 'malformed']
    });

    const fieldStatuses = editor.getField(query)?.references.map((status) => status.code);
    expect(fieldStatuses).toEqual(['invalid_reference', 'invalid_reference']);
    expect(editor.getNode('answer')?.issues.map((issue) => issue.code)).toEqual([
      'invalid_reference'
    ]);
  });

  it('does not treat ordinary multiple-select values as references', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'select',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Select',
          inputs: [
            {
              key: 'sources',
              label: 'Sources',
              renderTypeList: [
                FlowNodeInputTypeEnum.multipleSelect,
                FlowNodeInputTypeEnum.reference
              ],
              selectedType: FlowNodeInputTypeEnum.multipleSelect,
              valueType: WorkflowIOValueTypeEnum.arrayString,
              value: [],
              list: [
                { label: 'Alpha', value: 'alpha' },
                { label: 'Beta', value: 'beta' }
              ]
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    });
    const query = { nodeId: 'select', fieldKey: 'sources' };

    for (const value of [[], ['alpha'], ['alpha', 'beta']]) {
      editor.dispatch({ type: 'updateField', ...query, value });
      expect(editor.getField(query)?.references).toEqual([]);
      expect(
        editor.getNode('select')?.issues.filter((issue) => issue.code.includes('reference'))
      ).toEqual([]);
    }

    const referenceEditor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'source',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Source',
          inputs: [],
          outputs: [
            {
              id: 'text',
              key: 'text',
              type: FlowNodeOutputTypeEnum.source,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ]
        },
        {
          nodeId: 'select',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Select',
          inputs: [
            {
              key: 'sources',
              label: 'Sources',
              renderTypeList: [
                FlowNodeInputTypeEnum.multipleSelect,
                FlowNodeInputTypeEnum.reference
              ],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string,
              value: [['source', 'text']]
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    });
    referenceEditor.dispatch({
      type: 'connectEdge',
      edge: { source: 'source', target: 'select', sourceHandle: 'source', targetHandle: 'target' }
    });
    expect(referenceEditor.getField(query)?.references.map((status) => status.code)).toEqual([
      'valid'
    ]);
  });

  it('keeps structured and dynamic values on value-based reference checks', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'update',
          flowNodeType: FlowNodeTypeEnum.variableUpdate,
          name: 'Update',
          inputs: [
            {
              key: NodeInputKeyEnum.updateList,
              label: 'Updates',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              value: [
                {
                  variable: ['missing', 'value'],
                  value: ['', ''],
                  renderType: FlowNodeInputTypeEnum.reference
                }
              ]
            }
          ],
          outputs: []
        },
        {
          nodeId: 'dynamic',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Dynamic',
          inputs: [
            {
              key: NodeInputKeyEnum.addInputParam,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.addInputParam]
            },
            {
              key: 'dynamicName',
              label: 'Dynamic name',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              valueType: WorkflowIOValueTypeEnum.string,
              value: '{{$missing.value$}}',
              canEdit: true
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    });

    expect(editor.getNode('update')?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_reference', inputKey: 'updateList[0].variable' })
      ])
    );
    expect(editor.getNode('dynamic')?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_reference', inputKey: 'dynamicName' })
      ])
    );
  });

  it('exposes variable update target type errors in field reference status', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'source',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Source',
          inputs: [],
          outputs: [
            {
              id: 'output',
              key: 'output',
              type: FlowNodeOutputTypeEnum.source,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ]
        },
        {
          nodeId: 'update',
          flowNodeType: FlowNodeTypeEnum.variableUpdate,
          name: 'Update',
          inputs: [
            {
              key: NodeInputKeyEnum.updateList,
              label: 'Updates',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              value: [
                {
                  variable: ['source', 'output'],
                  valueType: WorkflowIOValueTypeEnum.number,
                  value: ['', ''],
                  renderType: FlowNodeInputTypeEnum.input
                }
              ]
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'source',
          target: 'update',
          sourceHandle: 'output',
          targetHandle: 'target'
        }
      ],
      chatConfig: {}
    });

    expect(
      editor.getField({ nodeId: 'update', fieldKey: NodeInputKeyEnum.updateList })?.references
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_reference_type',
          reference: ['source', 'output']
        })
      ])
    );
  });

  it('marks downstream consumers as affected without changing them', () => {
    const editor = createRuntime();
    editor.dispatch({
      type: 'updateField',
      nodeId: 'answer',
      fieldKey: NodeInputKeyEnum.answerText,
      value: [['start', 'userChatInput']]
    });

    const result = editor.dispatch({
      type: 'updateNode',
      nodeId: 'start',
      patch: { name: 'Renamed Start' }
    });

    expect(result.ok).toBe(true);
    expect(result.change?.changedRecords.nodeIds).toEqual(['start']);
    expect(result.change?.affectedRecords.nodeIds).toContain('answer');
    expect(result.change?.affectedRecords.fieldIds).toContainEqual({
      nodeId: 'answer',
      key: NodeInputKeyEnum.answerText,
      kind: 'input'
    });
    expect(
      editor.getField({ nodeId: 'answer', fieldKey: NodeInputKeyEnum.answerText })?.references[0]
    ).toEqual(expect.objectContaining({ sourceLabel: 'Renamed Start' }));
  });

  it('restores references and issues through undo and redo', () => {
    const editor = createRuntime();
    const query = { nodeId: 'answer', fieldKey: NodeInputKeyEnum.answerText };
    editor.dispatch({ type: 'updateField', ...query, value: [['start', 'userChatInput']] });
    expect(editor.getHistory()).toMatchObject({ canUndo: true, canRedo: false });

    expect(editor.undo().ok).toBe(true);
    expect(editor.getField(query)?.references).toEqual([]);
    expect(editor.getNode('answer')?.issues).toEqual([]);

    expect(editor.redo().ok).toBe(true);
    expect(editor.getField(query)?.references).toEqual([
      expect.objectContaining({ code: 'valid' })
    ]);
    expect(editor.getNode('answer')?.issues).toEqual([]);

    editor.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'Branch' } });
    expect(editor.getHistory().canRedo).toBe(false);
  });

  it('keeps the public edge list stable across unrelated edits', () => {
    const editor = createRuntime();
    const beforeWorkflow = editor.getWorkflow();
    const beforeEdge = beforeWorkflow.edges[0];
    const beforeChatConfig = beforeWorkflow.chatConfig;
    editor.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'Renamed' } });
    const afterNodeEdit = editor.getWorkflow();
    expect(afterNodeEdit).not.toBe(beforeWorkflow);
    expect(afterNodeEdit.edges[0]).toBe(beforeEdge);
    expect(afterNodeEdit.chatConfig).toBe(beforeChatConfig);

    const result = editor.dispatch({
      type: 'disconnectEdge',
      edge: { source: 'start', target: 'answer', sourceHandle: 'source', targetHandle: 'target' }
    });
    expect(result.ok).toBe(true);
    expect(result.change?.changedRecords.edgeIds).toHaveLength(1);
    expect(editor.getWorkflow().edges).toHaveLength(beforeWorkflow.edges.length - 1);
  });

  it('replaces the whole document as an exclusive transaction', () => {
    const editor = createRuntime();
    const document = {
      ...editor.getWorkflowData(),
      chatConfig: {
        ...editor.getWorkflowData().chatConfig,
        welcomeText: 'replacement',
        variables: [
          {
            key: 'customerName',
            label: 'Customer name',
            type: 'input',
            description: 'Name used by the workflow'
          }
        ]
      }
    };
    const mixed = editor.dispatch([
      { type: 'replaceDocument', document },
      { type: 'updateNode', nodeId: 'answer', patch: { name: 'Ignored' } }
    ] satisfies readonly WorkflowCommand[]);
    expect(mixed.ok).toBe(false);
    expect(mixed.error?.code).toBe('invalid_command');

    const result = editor.dispatch({ type: 'replaceDocument', document });
    expect(result.ok).toBe(true);
    expect(result.change?.kind).toBe('replace');
    expect(result.change?.changedRecords.chatConfig).toBe(true);
    expect(result.change?.changedRecords.chatConfigVariablesChanged).toBe(true);
    // 整文档替换是全量失效分支，必须发布结构失效，投影与引用闭包才会整体重算。
    expect(result.change?.affectedRecords.structure).toBe(true);
    expect(editor.getWorkflowData()).toEqual(document);
    expect(editor.undo().ok).toBe(true);
  });

  it('disconnects one edge by its runtime edge id without touching the other', () => {
    const editor = createRuntime();
    editor.dispatch({
      type: 'addNode',
      node: {
        nodeId: 'answer2',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Answer 2',
        inputs: [],
        outputs: []
      } as never
    });
    const connected = editor.dispatch({
      type: 'connectEdge',
      edge: { source: 'start', target: 'answer2', sourceHandle: 'source', targetHandle: 'target' }
    });
    expect(connected.ok).toBe(true);
    const [edgeId] = connected.change?.changedRecords.edgeIds ?? [];
    expect(edgeId).toEqual(expect.any(String));
    expect(editor.getWorkflow().edges).toHaveLength(2);

    editor.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'Renamed' } });

    const disconnected = editor.dispatch({ type: 'disconnectEdge', edgeId });
    expect(disconnected.ok).toBe(true);
    expect(disconnected.change?.changedRecords.edgeIds).toEqual([edgeId]);
    expect(editor.getWorkflow().edges).toEqual([
      expect.objectContaining({ source: 'start', target: 'answer' })
    ]);
  });

  it('keeps semantic reads untouched for a pure geometry transaction', () => {
    const editor = createRuntime();
    const query = { nodeId: 'answer', fieldKey: NodeInputKeyEnum.answerText };
    editor.dispatch({ type: 'updateField', ...query, value: [['start', 'userChatInput']] });
    const workflowBefore = editor.getWorkflow();
    const nodeBefore = editor.getNode('answer');
    const fieldBefore = editor.getField(query);

    const result = editor.dispatch({
      type: 'commitGeometry',
      nodeId: 'answer',
      position: { x: 1, y: 2 }
    });

    expect(result.change?.kind).toBe('geometry');
    expect(result.change?.changedRecords.nodeIds).toEqual([]);
    expect(result.change?.changedRecords.fieldIds).toEqual([]);
    expect(result.change?.changedRecords.edgeIds).toEqual([]);
    expect(result.change?.affectedRecords.nodeIds).toEqual([]);
    expect(result.change?.affectedRecords.structure).toBe(false);
    // 纯 geometry 不推进语义版本，语义 scoped snapshot 必须保持同一对象身份。
    expect(editor.getWorkflow()).toBe(workflowBefore);
    expect(editor.getNode('answer')).toBe(nodeBefore);
    expect(editor.getField(query)).toBe(fieldBefore);
    expect(editor.getNodeView('answer')?.position).toEqual({ x: 1, y: 2 });
  });

  it('signals structure invalidation only when the graph really changes', () => {
    const editor = createRuntime();

    const renamed = editor.dispatch({
      type: 'updateNode',
      nodeId: 'start',
      patch: { name: 'Renamed Start' }
    });
    expect(renamed.change?.affectedRecords.structure).toBe(false);

    const added = editor.dispatch({
      type: 'addNode',
      node: {
        nodeId: 'answer2',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Answer 2',
        inputs: [],
        outputs: []
      } as never
    });
    expect(added.change?.affectedRecords.structure).toBe(true);
    expect(added.change?.affectedRecords.nodeIds).toContain('answer2');

    // 改变 outputs 属于结构变化，affected 需要带上引用闭包里的下游节点。
    const outputsChanged = editor.dispatch({
      type: 'updateNode',
      nodeId: 'start',
      patch: {
        outputs: [
          {
            id: 'userChatInput',
            key: 'userChatInput',
            type: FlowNodeOutputTypeEnum.source,
            valueType: WorkflowIOValueTypeEnum.string
          },
          {
            id: 'extra',
            key: 'extra',
            type: FlowNodeOutputTypeEnum.source,
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      } as never
    });
    expect(outputsChanged.ok).toBe(true);
    expect(outputsChanged.change?.affectedRecords.structure).toBe(true);
    expect(outputsChanged.change?.affectedRecords.nodeIds).toContain('answer');
  });

  it('starts clean and keeps a no-op transaction clean', () => {
    const editor = createWorkflowEditor({ nodes: [], edges: [], chatConfig: {} });
    expect(editor.getSavepoint()).toEqual({ contentRevision: 0, isDirty: false });

    const noop = editor.dispatch({
      type: 'updateChatConfig',
      chatConfig: editor.getWorkflowData().chatConfig as never
    });
    expect(noop.change).toBeUndefined();
    expect(editor.getSavepoint()).toEqual({ contentRevision: 0, isDirty: false });
  });

  it('restores the content revision through undo and redo', () => {
    const editor = createRuntime();
    const beforeEdit = editor.getSavepoint();

    editor.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'Renamed' } });
    const afterEdit = editor.getSavepoint();
    expect(afterEdit.isDirty).toBe(true);
    expect(afterEdit.contentRevision).toBeGreaterThan(beforeEdit.contentRevision);

    editor.undo();
    expect(editor.getSavepoint()).toEqual(beforeEdit);
    editor.redo();
    expect(editor.getSavepoint()).toEqual(afterEdit);
  });

  it('keeps the final value when undoing and redoing consecutive field updates', () => {
    const editor = createRuntime();
    const query = { nodeId: 'answer', fieldKey: NodeInputKeyEnum.answerText };

    for (const value of ['1', '12', '123', '1234', '12345', '123456', '1234566']) {
      editor.dispatch({ type: 'updateField', ...query, value });
    }

    editor.undo();
    expect(editor.getField(query)?.input?.value).toBe('123456');
    editor.redo();
    expect(editor.getField(query)?.input?.value).toBe('1234566');
  });

  it('publishes one final change for multi-entry history replay', () => {
    const editor = createRuntime();
    const changes: WorkflowChange[] = [];
    editor.subscribe((change) => changes.push(change));

    editor.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'One' } });
    editor.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'Two' } });
    editor.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'Three' } });
    changes.length = 0;

    const result = editor.replayHistory('undo', 3);

    expect(result.ok).toBe(true);
    expect(editor.getNode('answer')?.name).toBe('Answer');
    expect(changes).toHaveLength(1);
    expect(changes[0]?.origin).toBe('undo');
  });

  it('keeps edits made during a save request unsaved', () => {
    const editor = createRuntime();
    editor.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'Saved' } });
    // host 在发起保存请求前取内容版本，请求成功后回填该版本。
    const { contentRevision } = editor.getSavepoint();
    editor.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'During request' } });
    editor.markSaved(contentRevision);
    expect(editor.getSavepoint().isDirty).toBe(true);

    // 撤销回已保存内容恢复干净状态，再重做又变脏。
    editor.undo();
    expect(editor.getSavepoint().isDirty).toBe(false);
    editor.redo();
    expect(editor.getSavepoint().isDirty).toBe(true);

    // 几何提交同样是内容变化。
    editor.markSaved(editor.getSavepoint().contentRevision);
    expect(editor.getSavepoint().isDirty).toBe(false);
    editor.dispatch({ type: 'commitGeometry', nodeId: 'answer', position: { x: 1, y: 2 } });
    expect(editor.getSavepoint().isDirty).toBe(true);
    editor.undo();
    expect(editor.getSavepoint().isDirty).toBe(false);
  });

  it('restores a deleted node view and persists the committed position', () => {
    const editor = createRuntime();
    editor.dispatch({ type: 'commitGeometry', nodeId: 'answer', position: { x: 5, y: 6 } });
    expect(
      editor.getWorkflowData().nodes.find((node) => node.nodeId === 'answer')?.position
    ).toEqual({ x: 5, y: 6 });

    editor.dispatch({ type: 'removeNodes', nodeIds: ['answer'] });
    expect(editor.getNodeView('answer')).toBeUndefined();

    editor.undo();
    expect(editor.getNodeView('answer')?.position).toEqual({ x: 5, y: 6 });
    editor.undo();
    expect(editor.getNodeView('answer')?.position).toBeUndefined();
  });

  it('drops an added node view when the add is undone', () => {
    const editor = createRuntime();
    editor.dispatch({
      type: 'addNode',
      node: {
        nodeId: 'answer2',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Answer 2',
        position: { x: 3, y: 4 },
        inputs: [],
        outputs: []
      } as never
    });
    expect(editor.getNodeView('answer2')?.position).toEqual({ x: 3, y: 4 });

    editor.undo();
    expect(editor.getNodeView('answer2')).toBeUndefined();
    editor.redo();
    expect(
      editor.getWorkflowData().nodes.find((node) => node.nodeId === 'answer2')?.position
    ).toEqual({ x: 3, y: 4 });
  });

  it('restores node views across a whole document replace', () => {
    const editor = createRuntime();
    editor.dispatch({ type: 'commitGeometry', nodeId: 'answer', position: { x: 1, y: 1 } });

    const document = editor.getWorkflowData();
    editor.dispatch({
      type: 'replaceDocument',
      document: {
        ...document,
        nodes: document.nodes.map((node) =>
          node.nodeId === 'answer' ? { ...node, position: { x: 9, y: 9 } } : { ...node }
        )
      } as never
    });
    expect(editor.getNodeView('answer')?.position).toEqual({ x: 9, y: 9 });

    editor.undo();
    expect(editor.getNodeView('answer')?.position).toEqual({ x: 1, y: 1 });
    editor.redo();
    expect(editor.getNodeView('answer')?.position).toEqual({ x: 9, y: 9 });
  });

  it('commits geometry together with a semantic command in one transaction', () => {
    const editor = createRuntime();
    const result = editor.dispatch([
      { type: 'updateNode', nodeId: 'answer', patch: { name: 'Moved' } },
      { type: 'commitGeometry', nodeId: 'answer', position: { x: 7, y: 8 } }
    ] satisfies readonly WorkflowCommand[]);

    expect(result.ok).toBe(true);
    expect(result.change?.kind).toBe('semantic');
    expect(result.change?.changedRecords.nodeIds).toEqual(['answer']);
    expect(result.change?.changedRecords.nodeViewIds).toEqual(['answer']);
    expect(editor.getNode('answer')?.name).toBe('Moved');
    expect(editor.getNodeView('answer')?.position).toEqual({ x: 7, y: 8 });

    editor.undo();
    expect(editor.getNode('answer')?.name).toBe('Answer');
    expect(editor.getNodeView('answer')?.position).toBeUndefined();
  });

  it('recomputes the container children list on structure changes', () => {
    const editor = createContainerRuntime();
    const getChildren = () =>
      editor
        .getNode('loop')
        ?.inputs.find((input) => input.key === NodeInputKeyEnum.childrenNodeIdList)?.value;

    // 水合不重算：存量数据原样保留，打开工作流不会凭空产生历史或未保存状态。
    expect(getChildren()).toEqual(['ghost']);

    const added = editor.dispatch({
      type: 'addNode',
      node: {
        nodeId: 'child',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Child',
        parentNodeId: 'loop',
        inputs: [],
        outputs: []
      } as never
    });
    expect(added.ok).toBe(true);
    expect(getChildren()).toEqual(['child']);
    // 派生字段作为普通字段参与变化记录。
    expect(added.change?.changedRecords.nodeIds).toContain('loop');
    expect(added.change?.changedRecords.fieldIds).toContainEqual({
      nodeId: 'loop',
      key: NodeInputKeyEnum.childrenNodeIdList,
      kind: 'input'
    });

    editor.dispatch({ type: 'removeNodes', nodeIds: ['child'] });
    expect(getChildren()).toEqual([]);

    // 容器归属变化同样触发重算。
    editor.dispatch({
      type: 'addNode',
      node: {
        nodeId: 'floating',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Floating',
        inputs: [],
        outputs: []
      } as never
    });
    expect(getChildren()).toEqual([]);
    editor.dispatch({ type: 'attachToContainer', nodeId: 'floating', containerId: 'loop' });
    expect(getChildren()).toEqual(['floating']);

    // 整文档替换按新文档重算。
    const document = editor.getWorkflowData();
    editor.dispatch({
      type: 'replaceDocument',
      document: {
        ...document,
        nodes: [
          ...document.nodes,
          {
            nodeId: 'c1',
            flowNodeType: FlowNodeTypeEnum.answerNode,
            name: 'C1',
            parentNodeId: 'loop',
            inputs: [],
            outputs: []
          }
        ]
      } as never
    });
    expect(getChildren()).toEqual(['floating', 'c1']);
  });

  it('derives the container array value type from the referenced output', () => {
    const editor = createContainerRuntime();
    const getArrayValueType = () =>
      editor
        .getNode('loop')
        ?.inputs.find((input) => input.key === NodeInputKeyEnum.loopRunInputArray)?.valueType;
    expect(getArrayValueType()).toBe(WorkflowIOValueTypeEnum.arrayAny);

    editor.dispatch({
      type: 'updateField',
      nodeId: 'loop',
      fieldKey: NodeInputKeyEnum.loopRunInputArray,
      value: [['start', 'userChatInput']]
    });
    expect(getArrayValueType()).toBe(WorkflowIOValueTypeEnum.arrayString);

    // 引用清空后回落到 arrayAny，与旧编辑器的推断口径一致。
    editor.dispatch({
      type: 'updateField',
      nodeId: 'loop',
      fieldKey: NodeInputKeyEnum.loopRunInputArray,
      value: []
    });
    expect(getArrayValueType()).toBe(WorkflowIOValueTypeEnum.arrayAny);
  });

  it('cleans canvas size fields at the migration boundary and never stores them', () => {
    // migration 边界先清理，Runtime 内部再拒绝写入，两层都不产生画布测量值。
    const migrated = migrateStoreWorkflow({
      nodes: [
        {
          nodeId: 'loop',
          flowNodeType: FlowNodeTypeEnum.loopRun,
          name: 'Loop',
          inputs: [
            {
              key: NodeInputKeyEnum.childrenNodeIdList,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.arrayString,
              value: []
            },
            {
              key: NodeInputKeyEnum.nodeWidth,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.number,
              value: 900
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    });
    expect(migrated.nodes[0].inputs.map((input) => input.key)).toEqual([
      NodeInputKeyEnum.childrenNodeIdList
    ]);

    const editor = hydrateWorkflowEditor({
      nodes: [
        {
          nodeId: 'loop',
          flowNodeType: FlowNodeTypeEnum.loopRun,
          name: 'Loop',
          position: { x: 1, y: 2 },
          inputs: [
            {
              key: NodeInputKeyEnum.childrenNodeIdList,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.arrayString,
              value: []
            },
            {
              key: NodeInputKeyEnum.nodeWidth,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.number,
              value: 900
            },
            {
              key: NodeInputKeyEnum.nodeHeight,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.number,
              value: 500
            },
            {
              key: NodeInputKeyEnum.nestedNodeInputHeight,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.number,
              value: 320
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    });

    const inputKeys = () => (editor.getNode('loop')?.inputs ?? []).map((input) => input.key);
    expect(inputKeys()).toEqual([NodeInputKeyEnum.childrenNodeIdList]);
    // 位置属于 Node View，不随尺寸字段一起被清理。
    expect(editor.getNodeView('loop')?.position).toEqual({ x: 1, y: 2 });

    // 命令写不进容器尺寸字段。
    editor.dispatch({
      type: 'updateNode',
      nodeId: 'loop',
      patch: {
        inputs: [
          {
            key: NodeInputKeyEnum.nodeWidth,
            label: '',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.number,
            value: 1200
          }
        ] as never
      }
    });
    expect(editor.getWorkflowData().nodes[0].inputs).toEqual([]);
  });

  it('keeps debug and the deleted edge count off the public surface', () => {
    const editor = createRuntime();
    const result = editor.dispatch({ type: 'removeNodes', nodeIds: ['answer'] });
    expect(result.ok).toBe(true);
    expect(result.change?.changedRecords.edgeIds).toHaveLength(1);
    expect(result).not.toHaveProperty('deletedEdgeCount');
    // @ts-expect-error 删除边计数已从公开 dispatch 结果移除，条数由边变化记录推导。
    expect(result.deletedEdgeCount).toBeUndefined();
    expect(editor).not.toHaveProperty('startDebug');
    // @ts-expect-error Debug 面已从 Workflow Runtime Port 移除，等独立设计。
    expect(editor.getDebug).toBeUndefined();
  });
});
/** 环境事实夹具：chat 依赖模型目录，tool 依赖 sandbox 开关。 */
const createEnvironmentFixture = (chatConfig: Record<string, unknown> = {}) => ({
  nodes: [
    {
      nodeId: 'start',
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      name: 'Start',
      inputs: [],
      outputs: [
        {
          id: 'userChatInput',
          key: 'userChatInput',
          type: FlowNodeOutputTypeEnum.source,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    },
    {
      nodeId: 'chat',
      flowNodeType: FlowNodeTypeEnum.chatNode,
      name: 'Chat',
      inputs: [
        {
          key: NodeInputKeyEnum.aiModelId,
          label: 'Model',
          renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
          selectedType: FlowNodeInputTypeEnum.selectLLMModel,
          valueType: WorkflowIOValueTypeEnum.string,
          required: true
        }
      ],
      outputs: []
    },
    {
      nodeId: 'tool',
      flowNodeType: FlowNodeTypeEnum.toolCall,
      name: 'Tool',
      inputs: [
        {
          key: NodeInputKeyEnum.useAgentSandbox,
          label: 'Sandbox',
          renderTypeList: [FlowNodeInputTypeEnum.switch],
          valueType: WorkflowIOValueTypeEnum.boolean,
          value: true
        }
      ],
      outputs: []
    }
  ],
  edges: [
    { source: 'start', target: 'chat', sourceHandle: 'source', targetHandle: 'target' },
    { source: 'chat', target: 'tool', sourceHandle: 'source', targetHandle: 'target' }
  ],
  chatConfig
});

const LLM_MODELS = [{ modelId: 'llm-1', model: 'llm-1', type: ModelTypeEnum.llm }];

describe('workflow environment facts', () => {
  it('skips model rules until the catalog is ready, then refreshes without a workflow change', () => {
    // 用对象承载目录：模拟“先未就绪、后就绪”，getEnvironment 每轮读当前值。
    const environment: { models?: WorkflowEnvironment['models'] } = {};
    const editor = createWorkflowEditor(createEnvironmentFixture(), {
      getEnvironment: () => ({
        models: environment.models,
        sandbox: { configured: true, planSupported: true }
      })
    });
    const changes: WorkflowChange[] = [];
    const updates: WorkflowIssueUpdate[] = [];
    editor.subscribe((change) => changes.push(change));
    editor.subscribeIssues((update) => updates.push(update));
    // 目录未就绪时不判定模型规则，冷启动阶段不会误报模型不可用。
    expect(editor.getNode('chat')?.issues.map((issue) => issue.code)).not.toContain(
      'model_required'
    );

    const savepoint = editor.getSavepoint();
    const history = editor.getHistory();
    const workflowBeforeRefresh = editor.getWorkflow();
    const issuesBeforeRefresh = editor.getWorkflowIssues();
    environment.models = LLM_MODELS;
    const update = editor.refreshIssues('all');

    // 目录就绪后，chat 与 tool 的模型规则同时生效；顺序按文档节点顺序。
    expect(update.nodeIds).toEqual(['chat', 'tool']);
    expect(updates).toEqual([update]);
    expect(editor.getNode('chat')?.issues.map((issue) => issue.code)).toContain('model_required');
    expect(editor.getWorkflow()).toBe(workflowBeforeRefresh);
    expect(editor.getWorkflowIssues()).not.toBe(issuesBeforeRefresh);
    // 环境刷新不是 Workflow Change，也不改 Content Revision、History 与 dirty。
    expect(changes).toHaveLength(0);
    expect(editor.getSavepoint()).toEqual(savepoint);
    expect(editor.getHistory()).toEqual(history);
  });

  it('reports sandbox facts on the field that enables the sandbox', () => {
    const editor = createWorkflowEditor(createEnvironmentFixture(), {
      getEnvironment: () => ({ models: [], sandbox: { configured: false, planSupported: true } })
    });
    expect(
      editor.getNode('tool')?.issues.map((issue) => [issue.code, issue.inputKey])
    ).toContainEqual(['sandbox_not_configured', NodeInputKeyEnum.useAgentSandbox]);
  });

  it('recomputes only the scoped nodes on a targeted refresh', () => {
    let configured = false;
    const editor = createWorkflowEditor(createEnvironmentFixture(), {
      getEnvironment: () => ({ models: [], sandbox: { configured, planSupported: true } })
    });
    expect(editor.getNode('tool')?.issues.map((issue) => issue.code)).toContain(
      'sandbox_not_configured'
    );

    configured = true;
    expect(editor.refreshIssues(['tool']).nodeIds).toEqual(['tool']);
    expect(editor.getNode('tool')?.issues.map((issue) => issue.code)).not.toContain(
      'sandbox_not_configured'
    );
    // 环境事实没有变化时，定向刷新不产生通知。
    expect(editor.refreshIssues(['tool']).nodeIds).toEqual([]);
  });

  it('keeps chat config model issues in their own bucket', () => {
    const editor = createWorkflowEditor(
      createEnvironmentFixture({ questionGuide: { open: true, modelId: 'gone' } }),
      {
        getEnvironment: () => ({
          models: LLM_MODELS,
          sandbox: { configured: true, planSupported: true }
        })
      }
    );
    // chatConfig 的模型问题不属于任何画布节点，单独成桶供 gate 排在提示文案最后。
    const issues = editor.getWorkflowIssues();
    expect(issues.chatConfigIssues.map((issue) => issue.code)).toEqual(['model_unavailable_short']);
    expect(issues.issues.every((issue) => !!issue.nodeId)).toBe(true);
    expect(Object.isFrozen(issues)).toBe(true);
    expect(Object.isFrozen(issues.issues)).toBe(true);
    expect(Object.isFrozen(issues.chatConfigIssues)).toBe(true);
  });
});
