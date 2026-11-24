import { describe, expect, it, vi } from 'vitest';
import { defaultAppSelectFileConfig } from '@fastgpt/global/core/app/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum,
  LoopRunModeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { createWorkflowEditor } from '@fastgpt/global/common/workflow/editor/runtime/runtime';
import * as documentRules from '@fastgpt/global/common/workflow/editor/runtime/documentRules';
import * as issueRules from '@fastgpt/global/common/workflow/editor/runtime/issueRules';
import { hydrateWorkflowEditor } from '@fastgpt/global/common/workflow/editor/protocol';
import type {
  WorkflowChange,
  WorkflowCommand,
  WorkflowDispatchResult,
  WorkflowEnvironment,
  WorkflowIssueUpdate,
  WorkflowRuntimePort
} from '@fastgpt/global/core/workflow/editor/types';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { getHandleId } from '@fastgpt/global/common/workflow/reference';
import {
  getFieldIdentityKey,
  getInputReferences
} from '@fastgpt/global/common/workflow/editor/runtime/kernel';
import { USER_SELECT_REFERENCE_HANDLE_KEY } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import {
  StoreNodeItemTypeSchema,
  type StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node';
import type { ReferenceValueType } from '@fastgpt/global/core/workflow/type/io';
import type { FlowNodeTemplateOutputItemType } from '@fastgpt/global/core/workflow/template/output';

const emptyNode = (node: Pick<StoreNodeItemType, 'nodeId' | 'flowNodeType' | 'name'>) => ({
  ...node,
  inputs: [],
  outputs: []
});

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

it('adds a batch without repeatedly copying the staged node array', () => {
  const editor = createWorkflowEditor({ nodes: [], edges: [], chatConfig: {} });
  const nodes = Array.from({ length: 200 }, (_, index) => ({
    nodeId: `pasted-${index}`,
    name: 'Answer',
    flowNodeType: FlowNodeTypeEnum.answerNode,
    inputs: [],
    outputs: []
  }));
  const iterator = Array.prototype[Symbol.iterator];
  let copiedRecords = 0;
  Array.prototype[Symbol.iterator] = function (this: Array<{ data?: { nodeId: string } }>) {
    if (this[0]?.data?.nodeId?.startsWith('pasted-')) copiedRecords += this.length;
    return iterator.call(this);
  };
  let result: WorkflowDispatchResult;
  try {
    result = editor.getWorkflowActions().addNodes(nodes);
  } finally {
    Array.prototype[Symbol.iterator] = iterator;
  }

  expect(result.ok).toBe(true);
  expect(copiedRecords).toBeLessThanOrEqual(nodes.length);
  expect(editor.getWorkflow().nodes.map((node) => node.nodeId)).toEqual(
    nodes.map((node) => node.nodeId)
  );
  expect(editor.undo().ok).toBe(true);
  expect(editor.getWorkflow().nodes).toEqual([]);
});

it('does not recopy the shared reference bucket for each consumer in a batch', () => {
  const runtime = createRuntime();
  const referenceField = runtime.getNode('answer')!.inputs[0];
  const sharedConsumer = getFieldIdentityKey({
    nodeId: 'consumer-0',
    key: referenceField.key,
    kind: 'input'
  });
  const iterator = Set.prototype[Symbol.iterator];
  let bucketCopies = 0;
  const spy = vi.spyOn(Set.prototype, Symbol.iterator).mockImplementation(function (
    this: Set<unknown>
  ) {
    if (this.has(sharedConsumer)) bucketCopies += 1;
    return iterator.call(this);
  });
  try {
    const consumers = Array.from({ length: 20 }, (_, index) => ({
      nodeId: `consumer-${index}`,
      flowNodeType: FlowNodeTypeEnum.answerNode,
      name: 'Consumer',
      inputs: [{ ...referenceField, value: ['start', 'userChatInput'] }],
      outputs: []
    }));
    expect(runtime.getWorkflowActions().addNodes(consumers).ok).toBe(true);
    expect(bucketCopies).toBeLessThan(3);
  } finally {
    spy.mockRestore();
    runtime.dispose();
  }
});

it('preserves canvas edge identity across unrelated edits and excludes deleted edges', () => {
  const runtime = createRuntime();
  const edges = runtime.getCanvasEdges();
  expect(edges).toHaveLength(1);
  runtime.getNodeActions('answer')?.setName('Renamed');
  expect(runtime.getCanvasEdges()[0]).toBe(edges[0]);

  expect(runtime.getWorkflowActions().disconnectEdges([{ index: 0 }]).ok).toBe(true);
  expect(runtime.getCanvasEdges()).toHaveLength(0);
  expect(runtime.undo().ok).toBe(true);
  expect(runtime.getCanvasEdges()).toEqual(edges);
  runtime.dispose();
});

/** 容器夹具：loopRun 带一份过期的子节点清单，用于验证结构变化后的派生字段重算。 */
const createContainerRuntime = (loopInputValue: ReferenceValueType = []): WorkflowRuntimePort =>
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
            value: loopInputValue
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

describe('workflow start auto-fill runtime', () => {
  const createStartNode = (includeUserFiles = false) => ({
    nodeId: 'start',
    flowNodeType: FlowNodeTypeEnum.workflowStart,
    name: 'Start',
    inputs: [],
    outputs: [
      {
        id: NodeOutputKeyEnum.userChatInput,
        key: NodeOutputKeyEnum.userChatInput,
        type: FlowNodeOutputTypeEnum.source,
        valueType: WorkflowIOValueTypeEnum.string
      },
      ...(includeUserFiles
        ? [
            {
              id: NodeOutputKeyEnum.userFiles,
              key: NodeOutputKeyEnum.userFiles,
              type: FlowNodeOutputTypeEnum.source,
              valueType: WorkflowIOValueTypeEnum.arrayString
            }
          ]
        : [])
    ]
  });
  const createInputNode = ({
    nodeId,
    extraInputKey,
    fileInput = false
  }: {
    nodeId: string;
    extraInputKey?: string;
    fileInput?: boolean;
  }) => ({
    nodeId,
    flowNodeType: FlowNodeTypeEnum.chatNode,
    name: nodeId,
    inputs: [
      ...[NodeInputKeyEnum.userChatInput, extraInputKey].filter(
        (key): key is string => key !== undefined
      ),
      ...(fileInput ? [NodeInputKeyEnum.fileUrlList] : [])
    ].map((key) => ({
      key,
      label: key,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference,
      valueType:
        key === NodeInputKeyEnum.fileUrlList
          ? WorkflowIOValueTypeEnum.arrayString
          : WorkflowIOValueTypeEnum.string
    })),
    outputs: [
      {
        id: 'out',
        key: 'out',
        type: FlowNodeOutputTypeEnum.source,
        valueType: WorkflowIOValueTypeEnum.string
      }
    ]
  });
  const edge = ({
    source,
    target,
    sourceKey,
    targetKey
  }: {
    source: string;
    target: string;
    sourceKey: string;
    targetKey: string;
  }) => ({
    source,
    target,
    sourceHandle: getHandleId(source, 'source', sourceKey),
    targetHandle: getHandleId(target, 'target', targetKey)
  });

  it('keeps auto-filled input while another start path remains, then clears it on final disconnect', () => {
    const editor = createWorkflowEditor({
      nodes: [
        createStartNode(),
        createInputNode({ nodeId: 'branchA' }),
        createInputNode({ nodeId: 'branchB' }),
        createInputNode({ nodeId: 'target', extraInputKey: 'otherInput' })
      ],
      edges: [],
      chatConfig: {}
    } as never);

    [
      edge({
        source: 'start',
        target: 'branchA',
        sourceKey: NodeOutputKeyEnum.userChatInput,
        targetKey: NodeInputKeyEnum.userChatInput
      }),
      edge({
        source: 'start',
        target: 'branchB',
        sourceKey: NodeOutputKeyEnum.userChatInput,
        targetKey: NodeInputKeyEnum.userChatInput
      }),
      edge({
        source: 'branchA',
        target: 'target',
        sourceKey: 'out',
        targetKey: NodeInputKeyEnum.userChatInput
      }),
      edge({ source: 'branchB', target: 'target', sourceKey: 'out', targetKey: 'otherInput' })
    ].forEach((connectedEdge) => {
      expect(editor.dispatch({ type: 'connectEdge', edge: connectedEdge }).ok).toBe(true);
    });

    const targetInput = () =>
      editor.getNode('target')?.inputs.find((input) => input.key === NodeInputKeyEnum.userChatInput)
        ?.value;
    expect(targetInput()).toEqual(['start', NodeOutputKeyEnum.userChatInput]);

    expect(
      editor.dispatch({
        type: 'disconnectEdge',
        edge: edge({
          source: 'branchA',
          target: 'target',
          sourceKey: 'out',
          targetKey: NodeInputKeyEnum.userChatInput
        })
      }).ok
    ).toBe(true);
    expect(targetInput()).toEqual(['start', NodeOutputKeyEnum.userChatInput]);

    expect(
      editor.dispatch({
        type: 'disconnectEdge',
        edge: edge({
          source: 'branchB',
          target: 'target',
          sourceKey: 'out',
          targetKey: 'otherInput'
        })
      }).ok
    ).toBe(true);
    expect(targetInput()).toBeUndefined();
  });

  it('removes file references auto-filled from a start output that is later disabled', () => {
    const editor = createWorkflowEditor({
      nodes: [
        createStartNode(true),
        createInputNode({ nodeId: 'target', extraInputKey: undefined, fileInput: true })
      ],
      edges: [],
      chatConfig: {}
    } as never);
    const fileEdge = edge({
      source: 'start',
      target: 'target',
      sourceKey: NodeOutputKeyEnum.userChatInput,
      targetKey: NodeInputKeyEnum.fileUrlList
    });

    expect(editor.dispatch({ type: 'connectEdge', edge: fileEdge }).ok).toBe(true);
    expect(
      editor.getNode('target')?.inputs.find((input) => input.key === NodeInputKeyEnum.fileUrlList)
        ?.value
    ).toEqual([['start', NodeOutputKeyEnum.userFiles]]);

    expect(
      editor.dispatch({
        type: 'updateNode',
        nodeId: 'start',
        patch: {
          outputs: editor
            .getNode('start')!
            .outputs.filter((output) => output.id !== NodeOutputKeyEnum.userFiles)
        }
      }).ok
    ).toBe(true);
    expect(
      editor.getNode('target')?.inputs.find((input) => input.key === NodeInputKeyEnum.fileUrlList)
        ?.value
    ).toBeUndefined();
  });

  it('refills blanks on a new connection or a start output edit, while preserving unrelated edits', () => {
    const start = createStartNode(true);
    const detachedEdge = edge({
      source: 'unrelated',
      target: 'tool',
      sourceKey: 'right',
      targetKey: 'left'
    });
    const editor = createWorkflowEditor({
      nodes: [
        start,
        createInputNode({ nodeId: 'target', fileInput: true }),
        { ...createInputNode({ nodeId: 'unrelated' }), flowNodeType: FlowNodeTypeEnum.agent },
        createInputNode({ nodeId: 'tool' })
      ],
      edges: [
        edge({ source: 'start', target: 'target', sourceKey: 'right', targetKey: 'left' }),
        detachedEdge
      ],
      chatConfig: {}
    });
    const targetFileReference = () =>
      editor.getNode('target')?.inputs.find(({ key }) => key === NodeInputKeyEnum.fileUrlList)
        ?.value;
    expect(targetFileReference()).toBeUndefined();

    const unrelatedUpdate = editor.getNodeHandle('unrelated')!.updateNode(({ outputs }) => ({
      outputs: outputs.map((output) => ({ ...output, label: 'Renamed output' }))
    }));
    expect(unrelatedUpdate.ok).toBe(true);
    expect(targetFileReference()).toBeUndefined();
    expect(editor.dispatch({ type: 'disconnectEdge', edge: detachedEdge }).ok).toBe(true);
    expect(targetFileReference()).toBeUndefined();

    const uploadUpdate = editor.dispatch([
      {
        type: 'updateChatConfig',
        chatConfig: { fileSelectConfig: { ...defaultAppSelectFileConfig, canSelectImg: true } }
      },
      { type: 'updateNode', nodeId: 'start', patch: { outputs: start.outputs } }
    ]);
    expect(uploadUpdate.ok).toBe(true);
    expect(targetFileReference()).toEqual([['start', NodeOutputKeyEnum.userFiles]]);

    expect(editor.undo().ok).toBe(true);
    expect(targetFileReference()).toBeUndefined();
    expect(
      editor.dispatch({
        type: 'connectEdge',
        edge: {
          source: 'unrelated',
          target: 'tool',
          sourceHandle: NodeOutputKeyEnum.selectedTools,
          targetHandle: NodeOutputKeyEnum.selectedTools
        }
      }).ok
    ).toBe(true);
    expect(targetFileReference()).toEqual([['start', NodeOutputKeyEnum.userFiles]]);
  });
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

  it('rolls back semantic derivation failure across runtime state', () => {
    const editor = createRuntime();
    const beforeWorkflow = editor.getWorkflow();
    const beforeNode = editor.getNode('answer');
    const beforeNodeView = editor.getNodeView('answer');
    const beforeField = editor.getField({
      nodeId: 'answer',
      fieldKey: NodeInputKeyEnum.answerText
    });
    const beforeIssues = editor.getWorkflowIssues();
    const beforeHistory = editor.getHistory();
    const beforeSavepoint = editor.getSavepoint();
    const changes: WorkflowChange[] = [];
    editor.subscribe((change) => changes.push(change));

    const derivedFailure = vi
      .spyOn(documentRules, 'applyPersistedDerivedFields')
      .mockImplementation(() => {
        throw new Error('injected semantic derivation failure');
      });

    let result: WorkflowDispatchResult;
    try {
      result = editor.dispatch([
        {
          type: 'addNode',
          node: emptyNode({
            nodeId: 'answer2',
            flowNodeType: FlowNodeTypeEnum.answerNode,
            name: 'Answer 2'
          }) as never
        },
        {
          type: 'connectEdge',
          edge: {
            source: 'start',
            target: 'answer2',
            sourceHandle: 'source',
            targetHandle: 'target'
          }
        }
      ] satisfies readonly WorkflowCommand[]);
    } finally {
      derivedFailure.mockRestore();
    }

    expect(result!.ok).toBe(false);
    expect(editor.getWorkflow()).toBe(beforeWorkflow);
    expect(editor.getNode('answer')).toBe(beforeNode);
    expect(editor.getNodeView('answer')).toBe(beforeNodeView);
    expect(editor.getField({ nodeId: 'answer', fieldKey: NodeInputKeyEnum.answerText })).toBe(
      beforeField
    );
    expect(editor.getWorkflowIssues()).toBe(beforeIssues);
    expect(editor.getHistory()).toEqual(beforeHistory);
    expect(editor.getSavepoint()).toEqual(beforeSavepoint);
    expect(changes).toEqual([]);

    editor.dispatch({
      type: 'addNode',
      node: emptyNode({
        nodeId: 'answer2',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Answer 2'
      }) as never
    });
    const connected = editor.dispatch({
      type: 'connectEdge',
      edge: {
        source: 'start',
        target: 'answer2',
        sourceHandle: 'source',
        targetHandle: 'target'
      }
    });
    expect(connected.change?.changedRecords.edgeIds).toEqual(['edge-1']);
  });

  it('keeps semantic commit when Issue derivation fails', () => {
    const editor = createRuntime();
    const beforeHistory = editor.getHistory();
    const beforeSavepoint = editor.getSavepoint();
    const changes: WorkflowChange[] = [];
    editor.subscribe((change) => changes.push(change));
    const issueFailure = vi.spyOn(issueRules, 'collectNodeIssues').mockImplementation(() => {
      throw new Error('injected issue derivation failure');
    });

    let result: WorkflowDispatchResult;
    try {
      result = editor.dispatch({
        type: 'updateNode',
        nodeId: 'answer',
        patch: { name: 'Committed despite Issue failure' }
      });
    } finally {
      issueFailure.mockRestore();
    }

    expect(result!.ok).toBe(true);
    expect(editor.getNode('answer')?.name).toBe('Committed despite Issue failure');
    expect(editor.getHistory().undoCount).toBe(beforeHistory.undoCount + 1);
    expect(editor.getSavepoint().contentRevision).toBeGreaterThan(beforeSavepoint.contentRevision);
    expect(changes).toHaveLength(1);
  });

  it('keeps the trusted Issue view and throws when refresh derivation fails', () => {
    const editor = createRuntime();
    const beforeIssues = editor.getWorkflowIssues();
    const issueFailure = vi.spyOn(issueRules, 'collectNodeIssues').mockImplementation(() => {
      throw new Error('injected issue refresh failure');
    });

    try {
      expect(() => editor.refreshIssues('all')).toThrow('injected issue refresh failure');
    } finally {
      issueFailure.mockRestore();
    }

    expect(editor.getWorkflowIssues()).toBe(beforeIssues);
  });

  it('deduplicates node issues by semantic identity instead of message', () => {
    const editor = createRuntime();
    const issueFailure = vi.spyOn(issueRules, 'collectNodeIssues').mockReturnValue([
      {
        nodeId: 'answer',
        level: 'error',
        code: 'invalid_reference',
        inputKey: NodeInputKeyEnum.answerText,
        message: 'Answer cites an invalid Variable'
      },
      {
        nodeId: 'answer',
        level: 'error',
        code: 'invalid_reference',
        inputKey: NodeInputKeyEnum.answerText,
        message: 'invalid_reference'
      },
      {
        nodeId: 'answer',
        level: 'error',
        code: 'invalid_reference',
        inputKey: NodeInputKeyEnum.answerText,
        message: 'Answer cites a different invalid Variable',
        params: { inputName: 'different' }
      }
    ]);

    try {
      editor.refreshIssues(['answer']);
    } finally {
      issueFailure.mockRestore();
    }

    expect(editor.getNode('answer')?.issues).toEqual([
      expect.objectContaining({
        code: 'invalid_reference',
        inputKey: NodeInputKeyEnum.answerText,
        message: 'Answer cites an invalid Variable'
      }),
      expect.objectContaining({
        code: 'invalid_reference',
        inputKey: NodeInputKeyEnum.answerText,
        message: 'Answer cites a different invalid Variable',
        params: { inputName: 'different' }
      })
    ]);
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

  it('commits a chat config change followed by the same value in one batch', () => {
    const editor = createRuntime();
    const command = { type: 'updateChatConfig', chatConfig: { welcomeText: 'Hello' } } as const;

    expect(editor.dispatch([command, command]).change?.changedRecords.chatConfig).toBe(true);
    expect(editor.getWorkflow().chatConfig.welcomeText).toBe('Hello');
    expect(editor.undo().ok).toBe(true);
    expect(editor.getWorkflow().chatConfig.welcomeText).toBeUndefined();
  });

  it('invalidates a removed variable reference when the batch also changes the welcome text', () => {
    const editor = createRuntime();
    const variable = { key: 'name', label: 'Name', type: 'input', description: '' } as const;
    const query = {
      nodeId: 'answer',
      fieldKey: NodeInputKeyEnum.answerText,
      kind: 'input'
    } as const;
    editor.dispatch([
      { type: 'updateChatConfig', chatConfig: { variables: [variable] } },
      { ...query, type: 'updateField', value: [VARIABLE_NODE_ID, variable.key] }
    ]);
    expect(editor.getField(query)?.references[0]?.code).toBe('valid');

    const result = editor.dispatch([
      { type: 'updateChatConfig', chatConfig: { variables: [] } },
      { type: 'updateChatConfig', chatConfig: { variables: [], welcomeText: 'Hello' } }
    ]);

    expect(editor.getField(query)?.references[0]?.code).toBe('invalid_reference');
    expect(result.change?.changedRecords.chatConfigVariablesChanged).toBe(true);
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
    // @ts-expect-error 删除边计数已从公开 dispatch 结果移除，条数由边变化记录推导。
    expect(result.deletedEdgeCount).toBeUndefined();
    expect(editor).not.toHaveProperty('startDebug');
    // @ts-expect-error Debug 面不属于 Workflow Runtime Port。
    expect(editor.getDebug).toBeUndefined();
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

  it('handles add parent, add child, then remove parent in one staged batch', () => {
    const editor = createWorkflowEditor({ nodes: [], edges: [], chatConfig: {} });
    const result = editor.dispatch([
      {
        type: 'addNode',
        node: {
          nodeId: 'parent',
          flowNodeType: FlowNodeTypeEnum.loopRun,
          name: 'Parent',
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
          nodeId: 'child',
          flowNodeType: FlowNodeTypeEnum.answerNode,
          name: 'Child',
          parentNodeId: 'parent',
          inputs: [],
          outputs: []
        }
      },
      { type: 'removeNodes', nodeIds: ['parent'] }
    ] satisfies readonly WorkflowCommand[]);

    expect(result).toEqual({ ok: true });
    expect(editor.getWorkflowData().nodes).toEqual([]);
    expect(editor.getHistory()).toMatchObject({ undoCount: 0, redoCount: 0 });
  });

  it('uses current staged node order after deleting a preceding node', () => {
    const editor = createWorkflowEditor({
      nodes: [
        emptyNode({ nodeId: 'first', flowNodeType: FlowNodeTypeEnum.answerNode, name: 'First' }),
        emptyNode({ nodeId: 'second', flowNodeType: FlowNodeTypeEnum.answerNode, name: 'Second' })
      ],
      edges: [],
      chatConfig: {}
    });

    const result = editor.dispatch([
      { type: 'removeNodes', nodeIds: ['first'] },
      { type: 'updateNode', nodeId: 'second', patch: { name: 'Updated second' } }
    ] satisfies readonly WorkflowCommand[]);

    expect(result.ok).toBe(true);
    expect(editor.getWorkflowData().nodes).toEqual([
      expect.objectContaining({ nodeId: 'second', name: 'Updated second' })
    ]);
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

  it('resolves secret references through the runtime reference graph', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'start',
          flowNodeType: FlowNodeTypeEnum.workflowStart,
          name: 'Start',
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
          name: 'HTTP',
          inputs: [
            {
              key: NodeInputKeyEnum.httpReqUrl,
              label: 'URL',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.string,
              value: 'https://example.com'
            },
            {
              key: NodeInputKeyEnum.headerSecret,
              label: 'Headers',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.object,
              value: { Authorization: { ref: ['start', 'userChatInput'] } }
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'start',
          target: 'http',
          sourceHandle: 'source',
          targetHandle: 'target'
        }
      ],
      chatConfig: {}
    });
    const query = { nodeId: 'http', fieldKey: NodeInputKeyEnum.headerSecret };
    expect(
      getInputReferences(
        editor.getNode('http')!.inputs.find((input) => input.key === query.fieldKey)!,
        FlowNodeTypeEnum.httpRequest468
      )
    ).toEqual([['start', 'userChatInput']]);

    expect(editor.getField(query)?.references).toEqual([
      expect.objectContaining({ code: 'valid', sourceType: WorkflowIOValueTypeEnum.string })
    ]);
    expect(editor.getNode('http')?.issues).toEqual([]);

    editor.dispatch({ type: 'removeNodes', nodeIds: ['start'] });
    expect(editor.getField(query)?.references).toEqual([
      expect.objectContaining({ code: 'invalid_reference' })
    ]);
    expect(editor.getWorkflowData().referenceSnapshots).toEqual([
      expect.objectContaining({
        reference: ['start', 'userChatInput'],
        sourceLabel: 'Start'
      })
    ]);
    expect(editor.getNode('http')?.issues.map((issue) => issue.code)).toContain(
      'invalid_reference'
    );
  });

  it('checks and snapshots system input secret references by input type', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'start',
          flowNodeType: FlowNodeTypeEnum.workflowStart,
          name: 'Start',
          inputs: [],
          outputs: [
            {
              id: 'text',
              key: 'text',
              type: FlowNodeOutputTypeEnum.source,
              valueType: WorkflowIOValueTypeEnum.string
            },
            {
              id: 'count',
              key: 'count',
              type: FlowNodeOutputTypeEnum.source,
              valueType: WorkflowIOValueTypeEnum.number
            }
          ]
        },
        {
          nodeId: 'tool',
          flowNodeType: FlowNodeTypeEnum.tool,
          name: 'Tool',
          inputs: [
            {
              key: NodeInputKeyEnum.systemInputConfig,
              label: 'Authorization',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.object,
              inputList: [
                { key: 'apiKey', label: 'API key', inputType: 'secret' },
                { key: 'limit', label: 'Limit', inputType: 'numberInput' }
              ],
              value: {
                type: 'manual',
                value: {
                  apiKey: { ref: ['start', 'text'] },
                  limit: { ref: ['start', 'count'] }
                }
              }
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'start',
          target: 'tool',
          sourceHandle: 'source',
          targetHandle: 'target'
        }
      ],
      chatConfig: {}
    });
    const query = { nodeId: 'tool', fieldKey: NodeInputKeyEnum.systemInputConfig };

    expect(editor.getField(query)?.references).toEqual([
      expect.objectContaining({ code: 'valid', sourceType: WorkflowIOValueTypeEnum.string }),
      expect.objectContaining({ code: 'valid', sourceType: WorkflowIOValueTypeEnum.number })
    ]);
    expect(editor.getNode('tool')?.issues).toEqual([]);

    editor.dispatch({ type: 'removeNodes', nodeIds: ['start'] });
    expect(editor.getWorkflowData().referenceSnapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reference: ['start', 'text'], sourceLabel: 'Start' }),
        expect.objectContaining({ reference: ['start', 'count'], sourceLabel: 'Start' })
      ])
    );
    expect(editor.getNode('tool')?.issues.map((issue) => issue.code)).toContain(
      'invalid_reference'
    );
  });

  it('keeps UserSelect reference edges as valid execution branches', () => {
    const editor = createWorkflowEditor({
      nodes: [
        emptyNode({ nodeId: 'start', flowNodeType: FlowNodeTypeEnum.workflowStart, name: 'Start' }),
        {
          nodeId: 'select',
          flowNodeType: FlowNodeTypeEnum.userSelect,
          name: 'Select',
          inputs: [
            {
              key: NodeInputKeyEnum.userSelectOptions,
              label: 'Options',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              value: ['start', 'options'],
              valueType: WorkflowIOValueTypeEnum.arrayAny
            }
          ],
          outputs: []
        },
        emptyNode({ nodeId: 'answer', flowNodeType: FlowNodeTypeEnum.answerNode, name: 'Answer' })
      ],
      edges: [
        {
          source: 'start',
          target: 'select',
          sourceHandle: 'source',
          targetHandle: 'target'
        },
        {
          source: 'select',
          target: 'answer',
          sourceHandle: getHandleId('select', 'source', USER_SELECT_REFERENCE_HANDLE_KEY),
          targetHandle: 'target'
        }
      ],
      chatConfig: {}
    });

    expect(editor.getWorkflowData().edges).toHaveLength(2);
    expect(editor.getNode('select')?.issues.map((issue) => issue.code)).not.toContain(
      'unreachable_reference'
    );
  });

  it('rejects array references in string inputs consistently with workflow-core', () => {
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
      expect.objectContaining({
        code: 'invalid_reference_type',
        sourceType: WorkflowIOValueTypeEnum.arrayString
      })
    ]);
    expect(editor.getNode('answer')?.issues).toContainEqual(
      expect.objectContaining({ code: 'invalid_reference_type' })
    );
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

  it.each([
    {
      flowNodeType: FlowNodeTypeEnum.userSelect,
      inputKey: NodeInputKeyEnum.userSelectOptions,
      outputKey: NodeOutputKeyEnum.selectResult
    },
    {
      flowNodeType: FlowNodeTypeEnum.classifyQuestion,
      inputKey: NodeInputKeyEnum.agents,
      outputKey: NodeOutputKeyEnum.cqResult
    }
  ])(
    'refreshes references after changing $flowNodeType branch inputs',
    ({ flowNodeType, inputKey, outputKey }) => {
      const editor = createWorkflowEditor({
        nodes: [
          {
            nodeId: 'start',
            flowNodeType: FlowNodeTypeEnum.workflowStart,
            name: 'Start',
            inputs: [],
            outputs: [
              {
                id: 'source',
                key: 'source',
                type: FlowNodeOutputTypeEnum.source,
                valueType: WorkflowIOValueTypeEnum.string
              }
            ]
          },
          {
            nodeId: 'branch',
            flowNodeType,
            name: 'Branch',
            inputs: [
              {
                key: inputKey,
                label: 'Branch options',
                renderTypeList: [FlowNodeInputTypeEnum.custom],
                valueType: WorkflowIOValueTypeEnum.any,
                value: [{ key: 'option1', value: 'Option 1' }]
              }
            ],
            outputs: [
              {
                id: outputKey,
                key: outputKey,
                type: FlowNodeOutputTypeEnum.static,
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
                valueType: WorkflowIOValueTypeEnum.string,
                value: [['branch', outputKey]]
              }
            ],
            outputs: []
          }
        ],
        edges: [
          { source: 'start', target: 'branch', sourceHandle: 'source', targetHandle: 'target' },
          {
            source: 'branch',
            target: 'answer',
            sourceHandle: getHandleId('branch', 'source', 'option1'),
            targetHandle: 'target'
          }
        ],
        chatConfig: {}
      });
      const field = { nodeId: 'answer', fieldKey: NodeInputKeyEnum.answerText };

      expect(editor.getField(field)?.references.map((status) => status.code)).toEqual(['valid']);

      editor.dispatch({
        type: 'updateField',
        nodeId: 'branch',
        fieldKey: inputKey,
        kind: 'input',
        value: []
      });

      expect(editor.getField(field)?.references.map((status) => status.code)).toEqual([
        'unreachable_reference'
      ]);
      expect(editor.getNode('answer')?.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'no_upstream' })])
      );
    }
  );

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
              valueType: WorkflowIOValueTypeEnum.arrayString
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
            valueType: WorkflowIOValueTypeEnum.string,
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
      node: emptyNode({
        nodeId: 'answer2',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Answer 2'
      }) as never
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
      node: emptyNode({
        nodeId: 'answer2',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Answer 2'
      }) as never
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

  it('signals input row edits and history to structural subscribers while keeping value edits scoped', () => {
    const editor = createWorkflowEditor({
      nodes: [emptyNode({ nodeId: 'code', flowNodeType: FlowNodeTypeEnum.code, name: 'Code' })],
      edges: [],
      chatConfig: {}
    });
    const onStructure = vi.fn();
    const onValue = vi.fn();
    const field = { nodeId: 'code', fieldKey: 'argument' };
    editor.subscribeWorkflow(onStructure);
    editor.subscribeField(field, onValue);

    const argument = {
      key: field.fieldKey,
      label: 'Argument',
      canEdit: true,
      renderTypeList: [FlowNodeInputTypeEnum.input],
      valueType: WorkflowIOValueTypeEnum.string,
      value: 'initial'
    };
    const updateInputs = (inputs: (typeof argument)[]) =>
      editor.dispatch({ type: 'updateNode', nodeId: field.nodeId, patch: { inputs } });

    expect(updateInputs([argument]).change?.affectedRecords.structure).toBe(true);
    expect(onStructure).toHaveBeenCalledTimes(1);
    expect(updateInputs([{ ...argument, value: 'edited' }]).change?.affectedRecords.structure).toBe(
      false
    );
    expect(
      editor.dispatch({ type: 'updateField', ...field, value: 'typed' }).change?.affectedRecords
        .structure
    ).toBe(false);
    expect(editor.getField(field)?.input?.value).toBe('typed');
    expect(onValue).toHaveBeenCalledTimes(3);
    expect(onStructure).toHaveBeenCalledTimes(1);

    expect(
      updateInputs([{ ...argument, value: 'typed', label: 'New label' }]).change?.affectedRecords
        .structure
    ).toBe(true);
    expect(updateInputs([]).change?.affectedRecords.structure).toBe(true);
    expect(editor.undo().change?.affectedRecords.structure).toBe(true);
    expect(editor.getField(field)?.input?.label).toBe('New label');
    expect(editor.redo().change?.affectedRecords.structure).toBe(true);
    expect(editor.getField(field)).toBeUndefined();
  });

  it.each([
    { fieldKey: NodeInputKeyEnum.ifElseList, nodeType: FlowNodeTypeEnum.ifElseNode },
    { fieldKey: NodeInputKeyEnum.userSelectOptions, nodeType: FlowNodeTypeEnum.userSelect },
    { fieldKey: NodeInputKeyEnum.agents, nodeType: FlowNodeTypeEnum.classifyQuestion }
  ])(
    'signals structure invalidation when $fieldKey handle configuration changes',
    ({ fieldKey, nodeType }) => {
      const editor = createWorkflowEditor({
        nodes: [
          {
            nodeId: 'node',
            flowNodeType: nodeType,
            name: 'Node',
            inputs: [
              {
                key: fieldKey,
                label: fieldKey,
                renderTypeList: [FlowNodeInputTypeEnum.hidden],
                valueType: WorkflowIOValueTypeEnum.arrayAny,
                value: []
              }
            ],
            outputs: []
          }
        ],
        edges: [],
        chatConfig: {}
      });

      const result = editor.dispatch({
        type: 'updateField',
        nodeId: 'node',
        fieldKey,
        value: [{ value: fieldKey }]
      });

      expect(result.ok).toBe(true);
      expect(result.change?.affectedRecords.structure).toBe(true);
    }
  );

  it('signals structure invalidation when catchError handles change', () => {
    const editor = createRuntime();
    const result = editor.dispatch({
      type: 'updateNode',
      nodeId: 'answer',
      patch: { catchError: true }
    });

    expect(result.ok).toBe(true);
    expect(result.change?.affectedRecords.structure).toBe(true);
  });

  it('starts clean and keeps a no-op transaction clean', () => {
    const editor = createWorkflowEditor({ nodes: [], edges: [], chatConfig: {} });
    expect(editor.getSavepoint()).toEqual({ contentRevision: 0, isDirty: false });
    const beforeHistory = editor.getHistory();

    const noop = editor.dispatch({
      type: 'updateChatConfig',
      chatConfig: editor.getWorkflowData().chatConfig as never
    });
    expect(noop).toEqual({ ok: true });
    expect(editor.getHistory()).toEqual(beforeHistory);
    expect(editor.getSavepoint()).toEqual({ contentRevision: 0, isDirty: false });
  });

  it('skips revision, history, and change when a batch returns to the canonical state', () => {
    const editor = createRuntime();
    const workflow = editor.getWorkflow();
    const node = editor.getNode('answer');
    const history = editor.getHistory();
    const savepoint = editor.getSavepoint();
    const changes: WorkflowChange[] = [];
    editor.subscribe((change) => changes.push(change));

    const result = editor.dispatch([
      { type: 'updateNode', nodeId: 'answer', patch: { name: 'Temporary' } },
      { type: 'updateNode', nodeId: 'answer', patch: { name: 'Answer' } }
    ] satisfies readonly WorkflowCommand[]);

    expect(result).toEqual({ ok: true });
    expect(editor.getWorkflow()).toBe(workflow);
    expect(editor.getNode('answer')).toBe(node);
    expect(editor.getHistory()).toEqual(history);
    expect(editor.getSavepoint()).toEqual(savepoint);
    expect(changes).toEqual([]);
  });

  it('materializes canonical data on export without using it for local edits', () => {
    const editor = createRuntime();
    const canonical = vi.spyOn(documentRules, 'documentToCanonical');
    const query = { nodeId: 'answer', fieldKey: NodeInputKeyEnum.answerText };

    try {
      const value = ['start', 'userChatInput'];
      const edit = editor.dispatch({ type: 'updateField', ...query, value });
      expect(edit.change).toBeDefined();
      expect(canonical).not.toHaveBeenCalled();

      const exported = editor.getWorkflowData();
      expect(canonical).toHaveBeenCalledOnce();
      exported.nodes.find(({ nodeId }) => nodeId === 'answer')!.inputs[0].value[0] = 'external';
      exported.edges[0].target = 'external';

      expect(editor.getField(query)?.input?.value).toEqual(value);
      expect(editor.getWorkflowData().edges[0].target).toBe('answer');
    } finally {
      canonical.mockRestore();
    }
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

  it('restores the oldest undo entry when a pending replacement fails at the history limit', () => {
    const runtime = createWorkflowEditor({ nodes: [], edges: [], chatConfig: {} });
    const originalRevision = runtime.getSavepoint().contentRevision;
    for (let index = 0; index < 200; index += 1) {
      runtime.dispatch({ type: 'updateChatConfig', chatConfig: { welcomeText: String(index) } });
    }
    expect(runtime.getHistory().undoCount).toBe(200);

    expect(
      runtime.dispatch({
        type: 'replaceDocument',
        document: { ...runtime.getWorkflowData(), chatConfig: { welcomeText: 'Unconfirmed' } },
        rollbackable: true
      }).ok
    ).toBe(true);
    expect(runtime.rollbackDocumentReplacement(runtime.getSavepoint().contentRevision).ok).toBe(
      true
    );

    expect(runtime.getHistory()).toMatchObject({ undoCount: 200, redoCount: 0 });
    expect(runtime.replayHistoryToRevision(originalRevision).ok).toBe(true);
    expect(runtime.getWorkflow().chatConfig.welcomeText).toBeUndefined();
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

  it('replays to a reachable revision and preserves history for an abandoned revision', () => {
    const editor = createRuntime();
    const initialRevision = editor.getSavepoint().contentRevision;
    editor.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'Kept' } });
    editor.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'Abandoned' } });
    const abandonedRevision = editor.getSavepoint().contentRevision;
    editor.undo();
    editor.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'New branch' } });

    const workflow = editor.getWorkflow();
    const savepoint = editor.getSavepoint();
    const history = editor.getHistory();
    const listener = vi.fn();
    editor.subscribe(listener);

    expect(editor.replayHistoryToRevision(abandonedRevision)).toMatchObject({
      ok: false,
      error: { code: 'not_found' }
    });
    expect(editor.getWorkflow()).toBe(workflow);
    expect(editor.getSavepoint()).toEqual(savepoint);
    expect(editor.getHistory()).toEqual(history);
    expect(listener).not.toHaveBeenCalled();

    expect(editor.replayHistoryToRevision(initialRevision).ok).toBe(true);
    expect(editor.getNode('answer')?.name).toBe('Answer');
    expect(editor.replayHistoryToRevision(savepoint.contentRevision).ok).toBe(true);
    expect(editor.getNode('answer')?.name).toBe('New branch');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps history and content state when replay reconstruction fails', () => {
    const editor = createRuntime();
    editor.dispatch({ type: 'updateNode', nodeId: 'answer', patch: { name: 'Renamed' } });
    const workflow = editor.getWorkflow();
    const history = editor.getHistory();
    const savepoint = editor.getSavepoint();
    const changes: WorkflowChange[] = [];
    editor.subscribe((change) => changes.push(change));
    const replayFailure = vi.spyOn(documentRules, 'buildGraphIndex').mockImplementationOnce(() => {
      throw new Error('injected replay reconstruction failure');
    });

    let result: WorkflowDispatchResult;
    try {
      result = editor.undo();
    } finally {
      replayFailure.mockRestore();
    }

    expect(result!.ok).toBe(false);
    expect(editor.getWorkflow()).toBe(workflow);
    expect(editor.getNode('answer')?.name).toBe('Renamed');
    expect(editor.getHistory()).toEqual(history);
    expect(editor.getSavepoint()).toEqual(savepoint);
    expect(changes).toEqual([]);
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

  it('keeps existing parent assignments editable and rejects cycles during document replacement', () => {
    const editor = createContainerRuntime();
    const current = editor.getWorkflowData();
    const document = {
      ...current,
      nodes: [
        ...current.nodes,
        {
          nodeId: 'nested',
          flowNodeType: FlowNodeTypeEnum.loop,
          name: 'Nested loop',
          parentNodeId: 'loop',
          inputs: [],
          outputs: []
        },
        {
          nodeId: 'child',
          flowNodeType: FlowNodeTypeEnum.answerNode,
          name: 'Child',
          parentNodeId: 'missing',
          inputs: [],
          outputs: []
        }
      ]
    };
    expect(editor.dispatch({ type: 'replaceDocument', document }).ok).toBe(true);
    expect(editor.getNode('nested')?.parentNodeId).toBe('loop');
    expect(editor.getNode('child')?.parentNodeId).toBe('missing');

    const active = editor.getWorkflow();
    const history = editor.getHistory();
    const rejected = editor.dispatch({
      type: 'replaceDocument',
      document: {
        ...document,
        nodes: document.nodes.map((node) =>
          node.nodeId === 'loop' ? { ...node, parentNodeId: 'nested' } : node
        )
      }
    });

    expect(rejected).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('Circular workflow parent') }
    });
    expect(editor.getWorkflow()).toBe(active);
    expect(editor.getHistory()).toEqual(history);
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

  it.each([undefined, ''])(
    'undoes geometry and attachment for a root parent of %j',
    (parentNodeId) => {
      const editor = createWorkflowEditor({
        nodes: [
          emptyNode({
            nodeId: 'start',
            flowNodeType: FlowNodeTypeEnum.workflowStart,
            name: 'Start'
          }),
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
              }
            ],
            outputs: []
          },
          {
            ...emptyNode({
              nodeId: 'child',
              flowNodeType: FlowNodeTypeEnum.answerNode,
              name: 'Child'
            }),
            parentNodeId
          }
        ],
        edges: [
          {
            source: 'start',
            target: 'loop',
            sourceHandle: 'source',
            targetHandle: 'target'
          }
        ],
        chatConfig: {}
      });

      const result = editor.dispatch([
        { type: 'commitGeometry', nodeId: 'child', position: { x: 120, y: 140 } },
        { type: 'attachToContainer', nodeId: 'child', containerId: 'loop' }
      ] satisfies readonly WorkflowCommand[]);
      expect(result.ok).toBe(true);
      expect(editor.getNode('child')?.parentNodeId).toBe('loop');
      expect(editor.getNodeView('child')?.position).toEqual({ x: 120, y: 140 });

      expect(editor.undo().ok).toBe(true);
      expect(editor.getNode('child')?.parentNodeId).toBeUndefined();
      expect(editor.getNodeView('child')?.position).toBeUndefined();
    }
  );

  it('recomputes the container children list on structure changes', () => {
    const editor = createContainerRuntime();
    const getChildren = () =>
      editor
        .getNode('loop')
        ?.inputs.find((input) => input.key === NodeInputKeyEnum.childrenNodeIdList)?.value;

    // 水合时先清理旧清单里已不存在的子节点。
    expect(getChildren()).toEqual([]);

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
      node: emptyNode({
        nodeId: 'floating',
        flowNodeType: FlowNodeTypeEnum.answerNode,
        name: 'Floating'
      }) as never
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

  it('refreshes reachability downstream after reconnecting an unreachable node', () => {
    const editor = createWorkflowEditor({
      nodes: [
        emptyNode({ nodeId: 'start', flowNodeType: FlowNodeTypeEnum.workflowStart, name: 'Start' }),
        emptyNode({ nodeId: 'source', flowNodeType: FlowNodeTypeEnum.answerNode, name: 'Source' }),
        emptyNode({ nodeId: 'target', flowNodeType: FlowNodeTypeEnum.answerNode, name: 'Target' })
      ],
      edges: [
        {
          source: 'source',
          target: 'target',
          sourceHandle: 'source',
          targetHandle: 'target'
        }
      ],
      chatConfig: {}
    });
    expect(editor.getNode('target')?.issues.map((issue) => issue.code)).toContain(
      'unreachable_from_start'
    );

    expect(
      editor.dispatch({
        type: 'connectEdge',
        edge: {
          source: 'start',
          target: 'source',
          sourceHandle: 'source',
          targetHandle: 'target'
        }
      }).ok
    ).toBe(true);
    expect(editor.getNode('target')?.issues).not.toContainEqual(
      expect.objectContaining({ code: 'unreachable_from_start' })
    );
  });

  it.each([
    ['add then connect', false],
    ['add with edge', true]
  ] as const)('clears the isolated start issue when %s', (_label, connectInBatch) => {
    const editor = createWorkflowEditor({
      nodes: [
        emptyNode({ nodeId: 'start', flowNodeType: FlowNodeTypeEnum.workflowStart, name: 'Start' })
      ],
      edges: [],
      chatConfig: {}
    });
    expect(editor.getNode('start')?.issues.map((issue) => issue.code)).toContain('isolated_node');

    const node = StoreNodeItemTypeSchema.parse(
      emptyNode({ nodeId: 'answer', flowNodeType: FlowNodeTypeEnum.answerNode, name: 'Answer' })
    );
    const edge = {
      source: 'start',
      target: 'answer',
      sourceHandle: 'source',
      targetHandle: 'target'
    };
    if (!connectInBatch) {
      expect(editor.dispatch({ type: 'addNode', node }).ok).toBe(true);
    }
    const result = editor.dispatch([
      ...(connectInBatch ? [{ type: 'addNode' as const, node }] : []),
      { type: 'connectEdge', edge }
    ] satisfies readonly WorkflowCommand[]);

    expect(result.ok).toBe(true);
    expect(editor.getNode('start')?.issues).not.toContainEqual(
      expect.objectContaining({ code: 'isolated_node' })
    );
  });

  it('normalizes a legacy container reference before creating the savepoint', () => {
    const reference: [string, string] = ['start', 'userChatInput'];
    const editor = createContainerRuntime(reference);

    expect(
      editor
        .getNode('loop')
        ?.inputs.find((input) => input.key === NodeInputKeyEnum.loopRunInputArray)
    ).toMatchObject({ value: [reference], valueType: WorkflowIOValueTypeEnum.arrayString });
    expect(editor.getSavepoint()).toEqual({ contentRevision: 0, isDirty: false });
    expect(editor.getHistory().undoCount).toBe(0);
  });

  it('preserves Code inputs that share names with container fields', () => {
    const initial = createRuntime();
    const base = initial.getWorkflowData();
    initial.dispose();
    const reference: [string, string] = ['start', 'userChatInput'];
    const editor = createWorkflowEditor({
      ...base,
      nodes: [
        ...base.nodes,
        {
          nodeId: 'code',
          name: 'Code',
          flowNodeType: FlowNodeTypeEnum.code,
          inputs: [NodeInputKeyEnum.loopRunInputArray, NodeInputKeyEnum.childrenNodeIdList].map(
            (key) => ({
              key,
              label: key,
              canEdit: true,
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              valueType: WorkflowIOValueTypeEnum.string,
              value: reference
            })
          ),
          outputs: []
        }
      ]
    });

    const initialInputs = editor.getNode('code')?.inputs;
    expect(
      editor.dispatch({
        type: 'connectEdge',
        edge: { source: 'answer', target: 'code', sourceHandle: 'source', targetHandle: 'target' }
      }).ok
    ).toBe(true);
    expect(initialInputs?.map((input) => input.valueType)).toEqual(['string', 'string']);
    expect(
      editor
        .getWorkflowData()
        .nodes.find((node) => node.nodeId === 'code')
        ?.inputs.map((input) => input.value)
    ).toEqual([reference, reference]);
  });

  it('preserves a two-string literal when loading a container input', () => {
    const value: [string, string] = ['first', 'second'];
    const editor = createContainerRuntime(value);

    expect(
      editor
        .getNode('loop')
        ?.inputs.find((input) => input.key === NodeInputKeyEnum.loopRunInputArray)
    ).toMatchObject({ value, valueType: WorkflowIOValueTypeEnum.arrayAny });
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

  it('derives loop start outputs in the mode change transaction', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'loop',
          flowNodeType: FlowNodeTypeEnum.loopRun,
          name: 'Loop',
          inputs: [
            {
              key: NodeInputKeyEnum.loopRunMode,
              label: 'Mode',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              value: LoopRunModeEnum.conditional
            }
          ],
          outputs: []
        },
        {
          nodeId: 'loopStart',
          flowNodeType: FlowNodeTypeEnum.loopRunStart,
          name: 'Loop start',
          parentNodeId: 'loop',
          inputs: [],
          outputs: [
            {
              id: NodeOutputKeyEnum.currentIteration,
              key: NodeOutputKeyEnum.currentIteration,
              label: 'Iteration',
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.number
            }
          ]
        }
      ],
      edges: [],
      chatConfig: {}
    });

    const changed = editor.dispatch({
      type: 'updateField',
      nodeId: 'loop',
      fieldKey: NodeInputKeyEnum.loopRunMode,
      value: LoopRunModeEnum.array
    });
    const outputKeys = () => editor.getNode('loopStart')?.outputs.map((output) => output.key);

    expect(changed.ok).toBe(true);
    expect(outputKeys()).toEqual([NodeOutputKeyEnum.currentIndex, NodeOutputKeyEnum.currentItem]);
    expect(editor.getHistory().undoCount).toBe(1);
    expect(changed.change?.affectedRecords.structure).toBe(true);

    expect(editor.undo().ok).toBe(true);
    expect(outputKeys()).toEqual([NodeOutputKeyEnum.currentIteration]);
    expect(editor.redo().ok).toBe(true);
    expect(outputKeys()).toEqual([NodeOutputKeyEnum.currentIndex, NodeOutputKeyEnum.currentItem]);
  });

  it('preserves stored edges when hydration derives away a stale loop output', () => {
    const staleEdge = {
      source: 'loopStart',
      target: 'answer',
      sourceHandle: getHandleId('loopStart', 'source', NodeOutputKeyEnum.currentIteration),
      targetHandle: getHandleId('answer', 'target', NodeInputKeyEnum.userChatInput)
    };
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'loop',
          flowNodeType: FlowNodeTypeEnum.loopRun,
          name: 'Loop',
          inputs: [
            {
              key: NodeInputKeyEnum.loopRunMode,
              label: 'Mode',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              value: LoopRunModeEnum.array
            }
          ],
          outputs: []
        },
        {
          nodeId: 'loopStart',
          flowNodeType: FlowNodeTypeEnum.loopRunStart,
          name: 'Loop start',
          parentNodeId: 'loop',
          inputs: [],
          outputs: [
            {
              id: NodeOutputKeyEnum.currentIteration,
              key: NodeOutputKeyEnum.currentIteration,
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.number
            }
          ]
        },
        {
          nodeId: 'answer',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          name: 'Answer',
          inputs: [
            {
              key: NodeInputKeyEnum.userChatInput,
              label: 'Input',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ],
          outputs: []
        }
      ],
      edges: [staleEdge],
      chatConfig: {}
    });

    expect(editor.getNode('loopStart')?.outputs.map((output) => output.key)).toEqual([
      NodeOutputKeyEnum.currentIndex,
      NodeOutputKeyEnum.currentItem
    ]);
    expect(editor.getWorkflow().edges).toHaveLength(1);
    expect(editor.getWorkflow().edges[0]).toMatchObject(staleEdge);
    expect(editor.getHistory().undoCount).toBe(0);
    expect(editor.getSavepoint().isDirty).toBe(false);
  });

  it('creates the conditional break node in the loop mode change transaction', () => {
    const editor = createWorkflowEditor(
      {
        nodes: [
          {
            nodeId: 'loop',
            flowNodeType: FlowNodeTypeEnum.loopRun,
            name: 'Loop',
            inputs: [
              {
                key: NodeInputKeyEnum.loopRunMode,
                label: 'Mode',
                renderTypeList: [FlowNodeInputTypeEnum.input],
                value: LoopRunModeEnum.array
              }
            ],
            outputs: []
          },
          {
            nodeId: 'loopStart',
            flowNodeType: FlowNodeTypeEnum.loopRunStart,
            name: 'Loop start',
            parentNodeId: 'loop',
            inputs: [],
            outputs: [
              {
                id: NodeOutputKeyEnum.currentItem,
                key: NodeOutputKeyEnum.currentItem,
                type: FlowNodeOutputTypeEnum.static,
                valueType: WorkflowIOValueTypeEnum.any
              }
            ]
          }
        ],
        edges: [],
        chatConfig: {}
      },
      {
        createLoopRunBreakNode: ({ parentNodeId, position }) => ({
          nodeId: 'loopBreak',
          flowNodeType: FlowNodeTypeEnum.loopRunBreak,
          name: 'Break',
          parentNodeId,
          position,
          inputs: [],
          outputs: []
        })
      }
    );

    const changed = editor.dispatch({
      type: 'updateField',
      nodeId: 'loop',
      fieldKey: NodeInputKeyEnum.loopRunMode,
      value: LoopRunModeEnum.conditional
    });

    expect(changed.ok, JSON.stringify(changed)).toBe(true);
    expect(editor.getNode('loopBreak')?.flowNodeType).toBe(FlowNodeTypeEnum.loopRunBreak);
    expect(editor.getNode('loopStart')?.outputs.map((output) => output.key)).toEqual([
      NodeOutputKeyEnum.currentIteration
    ]);
    const conditional = editor.getWorkflowData();
    expect(editor.getHistory().undoCount).toBe(1);
    expect(editor.undo().ok).toBe(true);
    expect(editor.getNode('loopBreak')).toBeUndefined();
    expect(editor.getNode('loopStart')?.outputs.map((output) => output.key)).toEqual([
      NodeOutputKeyEnum.currentIndex,
      NodeOutputKeyEnum.currentItem
    ]);

    // 历史版本可以包含尚未放置中断节点的条件循环，载入与重放均保持它原有的节点集合。
    const legacy = {
      ...conditional,
      nodes: conditional.nodes.filter((node) => node.nodeId !== 'loopBreak')
    };
    expect(editor.dispatch({ type: 'replaceDocument', document: legacy }).ok).toBe(true);
    expect(editor.getNode('loopBreak')).toBeUndefined();
    expect(editor.undo().ok).toBe(true);
    expect(editor.redo().ok).toBe(true);
    expect(editor.getNode('loopBreak')).toBeUndefined();
  });

  it('derives nested loop output types from changed source outputs in one transaction', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'start',
          flowNodeType: FlowNodeTypeEnum.workflowStart,
          name: 'Start',
          inputs: [],
          outputs: [
            {
              id: 'items',
              key: 'items',
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.arrayObject
            }
          ]
        },
        {
          nodeId: 'loopRun',
          flowNodeType: FlowNodeTypeEnum.loopRun,
          name: 'Array loop',
          inputs: [
            {
              key: NodeInputKeyEnum.loopRunMode,
              label: 'Mode',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              value: LoopRunModeEnum.array
            },
            {
              key: NodeInputKeyEnum.loopRunInputArray,
              label: 'Items',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              value: [['start', 'items']],
              valueType: WorkflowIOValueTypeEnum.arrayAny
            }
          ],
          outputs: []
        },
        {
          nodeId: 'loop',
          flowNodeType: FlowNodeTypeEnum.loop,
          name: 'Loop',
          inputs: [],
          outputs: [
            {
              id: NodeOutputKeyEnum.nestedArrayResult,
              key: NodeOutputKeyEnum.nestedArrayResult,
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.arrayAny
            }
          ]
        },
        {
          nodeId: 'loopStart',
          flowNodeType: FlowNodeTypeEnum.loopRunStart,
          name: 'Loop start',
          parentNodeId: 'loopRun',
          inputs: [],
          outputs: [
            {
              id: NodeOutputKeyEnum.currentItem,
              key: NodeOutputKeyEnum.currentItem,
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.any
            }
          ]
        },
        {
          nodeId: 'loopEnd',
          flowNodeType: FlowNodeTypeEnum.nestedEnd,
          name: 'Loop end',
          parentNodeId: 'loop',
          inputs: [
            {
              key: NodeInputKeyEnum.nestedEndInput,
              label: 'Result',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              value: ['loopStart', NodeOutputKeyEnum.currentItem]
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    });
    const getTypes = () => ({
      array: editor
        .getNode('loopRun')
        ?.inputs.find((input) => input.key === NodeInputKeyEnum.loopRunInputArray)?.valueType,
      item: editor
        .getNode('loopStart')
        ?.outputs.find((output) => output.key === NodeOutputKeyEnum.currentItem)?.valueType,
      result: editor
        .getNode('loop')
        ?.outputs.find((output) => output.key === NodeOutputKeyEnum.nestedArrayResult)?.valueType
    });

    expect(getTypes()).toEqual({
      array: WorkflowIOValueTypeEnum.arrayObject,
      item: WorkflowIOValueTypeEnum.object,
      result: WorkflowIOValueTypeEnum.arrayObject
    });
    expect(editor.getHistory().undoCount).toBe(0);
    expect(editor.getSavepoint().isDirty).toBe(false);

    const changed = editor.dispatch({
      type: 'updateNode',
      nodeId: 'start',
      patch: {
        outputs: [
          {
            id: 'items',
            key: 'items',
            type: FlowNodeOutputTypeEnum.static,
            valueType: WorkflowIOValueTypeEnum.arrayString
          }
        ]
      }
    });

    expect(changed.ok).toBe(true);
    expect(getTypes()).toEqual({
      array: WorkflowIOValueTypeEnum.arrayString,
      item: WorkflowIOValueTypeEnum.string,
      result: WorkflowIOValueTypeEnum.arrayString
    });
    expect(editor.getHistory().undoCount).toBe(1);
    expect(editor.undo().ok).toBe(true);
    expect(getTypes()).toEqual({
      array: WorkflowIOValueTypeEnum.arrayObject,
      item: WorkflowIOValueTypeEnum.object,
      result: WorkflowIOValueTypeEnum.arrayObject
    });
  });

  it('propagates a source type through 200 chained loop containers', () => {
    const count = 200;
    const resultKey = NodeOutputKeyEnum.nestedArrayResult;
    const itemKey = NodeOutputKeyEnum.nestedStartInput;
    const makeInput = (key: string, value: unknown) => ({
      key,
      label: key,
      value,
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    });
    const start = {
      nodeId: 'source',
      name: 'Source',
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      inputs: [],
      outputs: [{ key: resultKey, id: resultKey, valueType: WorkflowIOValueTypeEnum.arrayString }]
    };
    const nodes = [
      start,
      ...Array.from({ length: count }, (_, index) => {
        const parent = `loop-${index}`;
        return [
          {
            nodeId: parent,
            name: parent,
            flowNodeType: FlowNodeTypeEnum.loop,
            inputs: [
              makeInput(NodeInputKeyEnum.nestedInputArray, [
                [index === 0 ? start.nodeId : `loop-${index - 1}`, resultKey]
              ])
            ],
            outputs: [
              { key: resultKey, id: resultKey, valueType: WorkflowIOValueTypeEnum.arrayAny }
            ]
          },
          {
            nodeId: `${parent}-start`,
            name: 'Loop Start',
            flowNodeType: FlowNodeTypeEnum.nestedStart,
            parentNodeId: parent,
            inputs: [],
            outputs: []
          },
          {
            nodeId: `${parent}-end`,
            name: 'Loop End',
            flowNodeType: FlowNodeTypeEnum.nestedEnd,
            parentNodeId: parent,
            inputs: [makeInput(NodeInputKeyEnum.nestedEndInput, [`${parent}-start`, itemKey])],
            outputs: []
          }
        ];
      }).flat()
    ];
    const result = documentRules.applyPersistedDerivedFields({
      nodes: nodes.map((data) => ({ data })),
      chatConfig: {}
    });
    expect(result.nodes.at(-3)?.data.outputs[0].valueType).toBe(
      WorkflowIOValueTypeEnum.arrayString
    );
    expect(result.nodes[0].data).toBe(start);
  });

  it.each([
    { flowNodeType: FlowNodeTypeEnum.loop, outputKey: NodeOutputKeyEnum.nestedArrayResult },
    {
      flowNodeType: FlowNodeTypeEnum.parallelRun,
      outputKey: NodeOutputKeyEnum.parallelSuccessResults
    }
  ])(
    'derives $flowNodeType result types from global variable references and chat config changes',
    ({ flowNodeType, outputKey }) => {
      const editor = createWorkflowEditor({
        nodes: [
          {
            nodeId: 'loop',
            flowNodeType,
            name: 'Loop',
            inputs: [],
            outputs: [
              {
                id: outputKey,
                key: outputKey,
                type: FlowNodeOutputTypeEnum.static,
                valueType: WorkflowIOValueTypeEnum.arrayAny
              }
            ]
          },
          {
            nodeId: 'loopEnd',
            flowNodeType: FlowNodeTypeEnum.nestedEnd,
            name: 'Loop end',
            parentNodeId: 'loop',
            inputs: [
              {
                key: NodeInputKeyEnum.nestedEndInput,
                label: 'Result',
                renderTypeList: [FlowNodeInputTypeEnum.reference],
                value: [VARIABLE_NODE_ID, 'result']
              }
            ],
            outputs: []
          }
        ],
        edges: [],
        chatConfig: {
          variables: [
            {
              key: 'result',
              label: 'Result',
              type: 'input',
              description: 'Loop result',
              valueType: WorkflowIOValueTypeEnum.object
            }
          ]
        }
      });
      const getResultType = () =>
        editor.getNode('loop')?.outputs.find((output) => output.key === outputKey)?.valueType;

      expect(getResultType()).toBe(WorkflowIOValueTypeEnum.arrayObject);
      const changed = editor.dispatch({
        type: 'updateChatConfig',
        chatConfig: {
          variables: [
            {
              key: 'result',
              label: 'Result',
              type: 'input',
              description: 'Loop result',
              valueType: WorkflowIOValueTypeEnum.string
            }
          ]
        }
      });

      expect(changed.ok).toBe(true);
      expect(getResultType()).toBe(WorkflowIOValueTypeEnum.arrayString);
      expect(editor.getHistory().undoCount).toBe(1);
      expect(editor.undo().ok).toBe(true);
      expect(getResultType()).toBe(WorkflowIOValueTypeEnum.arrayObject);

      editor.dispatch({
        type: 'updateField',
        nodeId: 'loopEnd',
        fieldKey: NodeInputKeyEnum.nestedEndInput,
        value: [VARIABLE_NODE_ID, 'missing']
      });
      expect(getResultType()).toBe(WorkflowIOValueTypeEnum.arrayAny);

      editor.dispatch({
        type: 'updateField',
        nodeId: 'loopEnd',
        fieldKey: NodeInputKeyEnum.nestedEndInput,
        value: []
      });
      expect(getResultType()).toBe(WorkflowIOValueTypeEnum.arrayAny);
    }
  );

  it('clears canvas measurements during hydration and rejects storing them', () => {
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

const LLM_MODELS = [{ modelId: 'llm-1', legacyModel: 'llm-1', type: ModelTypeEnum.llm }];

const createReasoningRuntime = ({
  modelValue,
  reasoning
}: {
  modelValue?: string;
  reasoning: boolean;
}) => {
  const invalidCondition = vi.fn<NonNullable<FlowNodeTemplateOutputItemType['invalidCondition']>>(
    ({ inputs, llmModelMap }) => {
      const model =
        inputs.find((item) => item.key === NodeInputKeyEnum.aiModelId)?.value ||
        inputs.find((item) => item.key === NodeInputKeyEnum.aiModel)?.value;
      return llmModelMap.byId[model]?.reasoning !== true;
    }
  );
  const environment: WorkflowEnvironment = {
    models: [
      {
        modelId: 'reasoning-model',
        model: 'reasoning-model',
        type: ModelTypeEnum.llm,
        config: {
          maxContext: 1,
          maxResponse: 1,
          quoteMaxToken: 1,
          reasoning
        }
      }
    ],
    sandbox: { configured: true, planSupported: true }
  };
  const editor = createWorkflowEditor(
    {
      nodes: [
        {
          nodeId: 'start',
          flowNodeType: FlowNodeTypeEnum.workflowStart,
          name: 'Start',
          inputs: [],
          outputs: [
            {
              id: 'source',
              key: 'source',
              type: FlowNodeOutputTypeEnum.source,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ]
        },
        {
          nodeId: 'source',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          name: 'Source',
          inputs: [
            {
              key: NodeInputKeyEnum.aiModelId,
              label: 'Model',
              renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
              valueType: WorkflowIOValueTypeEnum.string,
              value: modelValue
            }
          ],
          outputs: [
            {
              id: NodeOutputKeyEnum.reasoningText,
              key: NodeOutputKeyEnum.reasoningText,
              type: FlowNodeOutputTypeEnum.static,
              label: 'Reasoning',
              valueType: WorkflowIOValueTypeEnum.string,
              invalid: true,
              invalidCondition
            }
          ]
        },
        {
          nodeId: 'consumer',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Consumer',
          inputs: [
            {
              key: 'reasoning',
              label: 'Reasoning',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string,
              value: ['source', NodeOutputKeyEnum.reasoningText]
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'start',
          target: 'source',
          sourceHandle: 'source',
          targetHandle: 'target'
        },
        {
          source: 'source',
          target: 'consumer',
          sourceHandle: NodeOutputKeyEnum.reasoningText,
          targetHandle: 'target'
        }
      ],
      chatConfig: {}
    },
    { getEnvironment: () => environment }
  );
  return { editor, environment, invalidCondition };
};

describe('workflow environment facts', () => {
  it('invalidates changed source metadata candidates without touching unrelated roots', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'source',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Old source',
          inputs: [],
          outputs: [
            {
              id: 'out',
              key: 'out',
              type: FlowNodeOutputTypeEnum.source,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ]
        },
        {
          nodeId: 'consumer',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Consumer',
          inputs: [
            {
              key: 'value',
              label: 'Value',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ],
          outputs: []
        },
        {
          nodeId: 'unrelated',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Unrelated',
          inputs: [
            {
              key: 'value',
              label: 'Value',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'source',
          target: 'consumer',
          sourceHandle: 'out',
          targetHandle: 'target'
        }
      ],
      chatConfig: {}
    });
    const consumerQuery = { nodeId: 'consumer', fieldKey: 'value' };
    const unrelatedQuery = { nodeId: 'unrelated', fieldKey: 'value' };
    expect(editor.getField(consumerQuery)?.referenceOptions).toContainEqual(
      expect.objectContaining({ sourceLabel: 'Old source' })
    );
    expect(
      editor.getReferenceOptions({
        nodeId: 'consumer',
        valueType: WorkflowIOValueTypeEnum.string
      })
    ).toContainEqual(expect.objectContaining({ sourceLabel: 'Old source' }));
    const fieldListener = vi.fn();
    const unrelatedListener = vi.fn();
    const referenceListener = vi.fn();
    editor.subscribeField(consumerQuery, fieldListener);
    editor.subscribeField(unrelatedQuery, unrelatedListener);
    editor.subscribeReferenceOptions(referenceListener);

    const source = editor.getNode('source')!;
    const result = editor.dispatch({
      type: 'updateNode',
      nodeId: 'source',
      patch: { name: 'New source' }
    });

    expect(result.change?.affectedRecords.referenceOptions).toBe(true);
    expect(editor.getField(consumerQuery)?.referenceOptions).toContainEqual(
      expect.objectContaining({ sourceLabel: 'New source' })
    );
    expect(
      editor.getReferenceOptions({
        nodeId: 'consumer',
        valueType: WorkflowIOValueTypeEnum.string
      })
    ).toContainEqual(expect.objectContaining({ sourceLabel: 'New source' }));
    expect(fieldListener).toHaveBeenCalledOnce();
    expect(referenceListener).toHaveBeenCalledOnce();
    expect(unrelatedListener).not.toHaveBeenCalled();
    expect(result.change?.affectedRecords.nodeIds).not.toContain('unrelated');
    expect(source.name).toBe('Old source');

    fieldListener.mockClear();
    referenceListener.mockClear();
    expect(editor.undo().ok).toBe(true);
    expect(editor.getField(consumerQuery)?.referenceOptions).toContainEqual(
      expect.objectContaining({ sourceLabel: 'Old source' })
    );
    expect(fieldListener).toHaveBeenCalledOnce();
    expect(referenceListener).toHaveBeenCalledOnce();
  });

  it('refreshes empty candidates when chat config variables change', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'consumer',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Consumer',
          inputs: [
            {
              key: 'value',
              label: 'Value',
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
    const query = { nodeId: 'consumer', fieldKey: 'value' };
    editor.getField(query);
    const fieldListener = vi.fn();
    const referenceListener = vi.fn();
    editor.subscribeField(query, fieldListener);
    editor.subscribeReferenceOptions(referenceListener);

    const result = editor.dispatch({
      type: 'updateChatConfig',
      chatConfig: {
        variables: [
          {
            key: 'customerName',
            label: 'Customer name',
            type: 'input',
            valueType: WorkflowIOValueTypeEnum.string,
            description: 'Name used by the workflow'
          }
        ]
      }
    });

    expect(result.error).toBeUndefined();
    expect(result.change?.affectedRecords.referenceOptions).toBe(true);
    expect(editor.getWorkflowData().chatConfig.variables).toEqual([
      expect.objectContaining({ key: 'customerName' })
    ]);
    expect(editor.getField(query)?.referenceOptions).toContainEqual(
      expect.objectContaining({ reference: [VARIABLE_NODE_ID, 'customerName'] })
    );
    expect(fieldListener).toHaveBeenCalledOnce();
    expect(referenceListener).toHaveBeenCalledOnce();
  });

  it('refreshes cached candidates when mounted tools change', () => {
    const editor = createWorkflowEditor({
      nodes: [
        emptyNode({ nodeId: 'start', flowNodeType: FlowNodeTypeEnum.workflowStart, name: 'Start' }),
        emptyNode({ nodeId: 'agent', flowNodeType: FlowNodeTypeEnum.toolCall, name: 'Agent' }),
        {
          nodeId: 'tool',
          flowNodeType: FlowNodeTypeEnum.httpRequest468,
          name: 'Tool',
          inputs: [
            {
              key: 'city',
              label: 'City',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              valueType: WorkflowIOValueTypeEnum.string,
              canEdit: true,
              defaultToAgentGenerated: true
            }
          ],
          outputs: []
        },
        {
          nodeId: 'consumer',
          flowNodeType: FlowNodeTypeEnum.toolCall,
          name: 'Consumer',
          inputs: [
            {
              key: 'value',
              label: 'Value',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'start',
          target: 'tool',
          sourceHandle: 'source',
          targetHandle: 'target'
        },
        {
          source: 'tool',
          target: 'consumer',
          sourceHandle: 'source',
          targetHandle: 'target'
        }
      ],
      chatConfig: {}
    });
    const query = { nodeId: 'consumer', fieldKey: 'value' };
    expect(
      editor.getField(query)?.referenceOptions.some((option) => option.reference[0] === 'tool')
    ).toBe(false);
    const fieldListener = vi.fn();
    const referenceListener = vi.fn();
    editor.subscribeField(query, fieldListener);
    editor.subscribeReferenceOptions(referenceListener);

    editor.dispatch({
      type: 'connectEdge',
      edge: {
        source: 'agent',
        target: 'tool',
        sourceHandle: NodeOutputKeyEnum.selectedTools,
        targetHandle: NodeOutputKeyEnum.selectedTools
      },
      replaceTargetEdges: true
    });

    expect(editor.getWorkflowData().edges).toEqual([
      {
        source: 'tool',
        target: 'consumer',
        sourceHandle: 'source',
        targetHandle: 'target'
      },
      {
        source: 'agent',
        target: 'tool',
        sourceHandle: NodeOutputKeyEnum.selectedTools,
        targetHandle: NodeOutputKeyEnum.selectedTools
      }
    ]);

    expect(
      editor.getReferenceOptions({
        nodeId: 'consumer',
        valueType: WorkflowIOValueTypeEnum.string
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reference: ['tool', 'city'],
          sourceType: WorkflowIOValueTypeEnum.string
        })
      ])
    );
    expect(
      editor
        .getField(query)
        ?.referenceOptions.some(
          (option) => option.reference[0] === 'tool' && option.reference[1] === 'city'
        )
    ).toBe(true);
    expect(fieldListener).toHaveBeenCalledOnce();
    expect(referenceListener).toHaveBeenCalledOnce();
  });

  it('rejects target-edge replacement for ordinary connections without removing edges', () => {
    const editor = createRuntime();
    const beforeEdges = editor.getWorkflowData().edges;
    const beforeUndoCount = editor.getHistory().undoCount;
    const result = editor.dispatch({
      type: 'connectEdge',
      edge: {
        source: 'start',
        target: 'answer',
        sourceHandle: 'source',
        targetHandle: 'target'
      },
      replaceTargetEdges: true
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('invalid_command');
    expect(editor.getWorkflowData().edges).toEqual(beforeEdges);
    expect(editor.getHistory().undoCount).toBe(beforeUndoCount);
  });

  it('keeps existing target edges when a tool connection is rejected', () => {
    const existingEdge = {
      source: 'start',
      target: 'answer',
      sourceHandle: 'source',
      targetHandle: 'target'
    };
    const editor = createWorkflowEditor({
      nodes: [
        emptyNode({ nodeId: 'start', flowNodeType: FlowNodeTypeEnum.workflowStart, name: 'Start' }),
        emptyNode({ nodeId: 'agent', flowNodeType: FlowNodeTypeEnum.toolCall, name: 'Agent' }),
        emptyNode({
          nodeId: 'existingAgent',
          flowNodeType: FlowNodeTypeEnum.toolCall,
          name: 'Existing agent'
        }),
        emptyNode({ nodeId: 'answer', flowNodeType: FlowNodeTypeEnum.answerNode, name: 'Answer' })
      ],
      edges: [
        existingEdge,
        {
          source: 'existingAgent',
          target: 'answer',
          sourceHandle: NodeOutputKeyEnum.selectedTools,
          targetHandle: NodeOutputKeyEnum.selectedTools
        }
      ],
      chatConfig: {}
    });

    const rejected = editor.dispatch({
      type: 'connectEdge',
      edge: {
        source: 'agent',
        target: 'answer',
        sourceHandle: NodeOutputKeyEnum.selectedTools,
        targetHandle: NodeOutputKeyEnum.selectedTools
      },
      replaceTargetEdges: true
    });

    expect(rejected.ok).toBe(false);
    expect(editor.getWorkflowData().edges).toHaveLength(2);
    expect(editor.getWorkflowData().edges).toContainEqual(existingEdge);
  });

  it.each([
    { name: 'supported', modelValue: 'reasoning-model', reasoning: true, invalid: false },
    { name: 'unsupported', modelValue: 'reasoning-model', reasoning: false, invalid: true },
    { name: 'empty model', modelValue: undefined, reasoning: true, invalid: true }
  ])('$name reasoning output has one Runtime validity result', (fixture) => {
    const { editor } = createReasoningRuntime(fixture);
    const output = editor
      .getNode('source')
      ?.outputs.find((item) => item.key === NodeOutputKeyEnum.reasoningText);
    const field = editor.getField({ nodeId: 'consumer', fieldKey: 'reasoning' });
    const options = editor.getReferenceOptions({
      nodeId: 'consumer',
      valueType: WorkflowIOValueTypeEnum.string
    });

    expect(output?.invalid).toBe(fixture.invalid);
    expect(field?.references).toEqual([
      expect.objectContaining({ code: fixture.invalid ? 'invalid_reference' : 'valid' })
    ]);
    expect(
      options.some(
        (option) =>
          option.reference[0] === 'source' &&
          option.reference[1] === NodeOutputKeyEnum.reasoningText
      )
    ).toBe(!fixture.invalid);
    expect(editor.getNode('consumer')?.issues.map((issue) => issue.code)).toEqual(
      fixture.invalid ? ['invalid_reference'] : []
    );
  });

  it('updates Runtime invalid and all readers when the model catalog changes', () => {
    const { editor, environment } = createReasoningRuntime({
      modelValue: 'reasoning-model',
      reasoning: false
    });
    const beforeHistory = editor.getHistory();
    const beforeSavepoint = editor.getSavepoint();
    const beforeWorkflow = editor.getWorkflow();

    environment.models![0].config = {
      ...environment.models![0].config!,
      reasoning: true
    };
    const update = editor.refreshIssues(['source']);
    const output = editor
      .getNode('source')
      ?.outputs.find((item) => item.key === NodeOutputKeyEnum.reasoningText);

    expect(update.nodeIds).toEqual(['source', 'consumer']);
    expect(output?.invalid).toBe(false);
    expect(editor.getField({ nodeId: 'consumer', fieldKey: 'reasoning' })?.references).toEqual([
      expect.objectContaining({ code: 'valid' })
    ]);
    expect(
      editor.getReferenceOptions({
        nodeId: 'consumer',
        valueType: WorkflowIOValueTypeEnum.string
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reference: ['source', NodeOutputKeyEnum.reasoningText] })
      ])
    );
    expect(editor.getWorkflow()).not.toBe(beforeWorkflow);
    expect(editor.getHistory()).toEqual(beforeHistory);
    expect(editor.getSavepoint()).toEqual(beforeSavepoint);
  });

  it('indexes and publishes live model-driven output validity during semantic dispatch', () => {
    const { editor, environment } = createReasoningRuntime({
      modelValue: 'reasoning-model',
      reasoning: false
    });
    const changes: WorkflowChange[] = [];
    const sourceNodeListener = vi.fn();
    const sourceFieldListener = vi.fn();
    editor.subscribe((change) => changes.push(change));
    editor.subscribeNode('source', sourceNodeListener);
    editor.subscribeField(
      { nodeId: 'source', fieldKey: NodeOutputKeyEnum.reasoningText, kind: 'output' },
      sourceFieldListener
    );

    environment.models![0].config = {
      ...environment.models![0].config!,
      reasoning: true
    };
    const result = editor.dispatch({
      type: 'updateNode',
      nodeId: 'consumer',
      patch: { name: 'Updated consumer' }
    });
    const workflowOutput = editor
      .getWorkflow()
      .nodes.find((node) => node.nodeId === 'source')
      ?.outputs.find((output) => output.id === NodeOutputKeyEnum.reasoningText);
    const indexedOutput = editor
      .getNode('source')
      ?.outputs.find((output) => output.id === NodeOutputKeyEnum.reasoningText);

    expect(result.ok).toBe(true);
    expect(workflowOutput?.invalid).toBe(false);
    expect(indexedOutput?.invalid).toBe(false);
    expect(result.change?.changedRecords.nodeIds).toContain('source');
    expect(result.change?.changedRecords.fieldIds).toContainEqual({
      nodeId: 'source',
      key: NodeOutputKeyEnum.reasoningText,
      kind: 'output'
    });
    expect(changes).toHaveLength(1);
    expect(sourceNodeListener).toHaveBeenCalledTimes(1);
    expect(sourceFieldListener).toHaveBeenCalledTimes(1);
  });

  it('reuses untouched output validity and still notices in-place model changes after a no-op', () => {
    const { editor, environment, invalidCondition } = createReasoningRuntime({
      modelValue: 'reasoning-model',
      reasoning: false
    });
    expect(invalidCondition).toHaveBeenCalledOnce();
    const renameConsumer = (name: string) =>
      ({ type: 'updateNode', nodeId: 'consumer', patch: { name } }) satisfies WorkflowCommand;

    expect(editor.dispatch(renameConsumer('Changed')).change).toBeDefined();
    expect(invalidCondition).toHaveBeenCalledOnce();

    Object.assign(environment.models![0].config!, { reasoning: true });
    const result = editor.dispatch([renameConsumer('Temporary'), renameConsumer('Changed')]);
    expect(result).toEqual({ ok: true });
    expect(invalidCondition).toHaveBeenCalledOnce();
    expect(editor.getNode('source')?.outputs[0].invalid).toBe(true);

    expect(editor.dispatch(renameConsumer('Committed')).change).toBeDefined();
    expect(invalidCondition).toHaveBeenCalledTimes(2);
    expect(editor.getNode('source')?.outputs[0].invalid).toBe(false);
  });

  it('ignores Runtime output flags while preserving node and edge order on replacement', () => {
    const { editor } = createReasoningRuntime({ modelValue: 'reasoning-model', reasoning: true });
    const document = editor.getWorkflowData();
    const runtimeOnly = {
      ...document,
      nodes: document.nodes.map((node) => ({
        ...node,
        outputs: node.outputs.map((output) => ({
          ...output,
          invalid: true,
          invalidCondition: () => true
        }))
      }))
    };
    expect(editor.dispatch({ type: 'replaceDocument', document: runtimeOnly })).toEqual({
      ok: true
    });
    expect(editor.getNode('source')?.outputs[0].invalid).toBe(false);

    for (const reordered of [
      { ...document, nodes: [...document.nodes].reverse() },
      { ...document, edges: [...document.edges].reverse() }
    ]) {
      expect(
        editor.dispatch({ type: 'replaceDocument', document: reordered }).change
      ).toBeDefined();
      expect(editor.getWorkflowData()).toEqual(reordered);
      expect(editor.undo().ok).toBe(true);
      expect(editor.getWorkflowData()).toEqual(document);
    }
  });

  it('refreshes committed output records after a failed replacement', () => {
    const { editor, environment } = createReasoningRuntime({
      modelValue: 'reasoning-model',
      reasoning: false
    });
    const document = editor.getWorkflowData();
    const snapshot = editor.getWorkflow();
    Object.assign(environment.models![0].config!, { reasoning: true });
    const rebuild = vi.spyOn(documentRules, 'buildGraphIndex').mockImplementationOnce(() => {
      throw new Error('injected replacement failure');
    });

    try {
      const result = editor.dispatch({
        type: 'replaceDocument',
        document: { ...document, chatConfig: { welcomeText: 'Replacement' } }
      });
      expect(result.ok).toBe(false);
      expect(editor.getWorkflow()).toBe(snapshot);
      expect(editor.getNode('source')?.outputs[0].invalid).toBe(true);
    } finally {
      rebuild.mockRestore();
    }

    expect(
      editor.dispatch({ type: 'updateNode', nodeId: 'consumer', patch: { name: 'Updated' } }).ok
    ).toBe(true);
    expect(editor.getNode('source')?.outputs[0].invalid).toBe(false);
  });

  it('updates indexed output validity when the selected model changes', () => {
    const { editor, environment } = createReasoningRuntime({
      modelValue: 'reasoning-model',
      reasoning: false
    });
    const unsupportedModel = environment.models![0]!;
    environment.models = [
      unsupportedModel,
      {
        ...unsupportedModel,
        modelId: 'supported-reasoning-model',
        model: 'supported-reasoning-model',
        config: { ...unsupportedModel.config!, reasoning: true }
      }
    ];
    const selectModel = (modelValue: string) => {
      const inputs = editor
        .getNode('source')!
        .inputs.map((input) =>
          input.key === NodeInputKeyEnum.aiModelId ? { ...input, value: modelValue } : input
        );
      return editor.dispatch({
        type: 'updateNode',
        nodeId: 'source',
        patch: { inputs }
      });
    };
    const getReasoningOutput = (node: { outputs: readonly { id: string; invalid?: boolean }[] }) =>
      node.outputs.find((output) => output.id === NodeOutputKeyEnum.reasoningText);

    expect(selectModel('supported-reasoning-model').ok).toBe(true);
    expect(
      getReasoningOutput(editor.getWorkflow().nodes.find((node) => node.nodeId === 'source')!)
    ).toMatchObject({ invalid: false });
    expect(getReasoningOutput(editor.getNode('source')!)).toMatchObject({ invalid: false });
    expect(editor.getField({ nodeId: 'consumer', fieldKey: 'reasoning' })?.references).toEqual([
      expect.objectContaining({ code: 'valid' })
    ]);

    expect(selectModel('reasoning-model').ok).toBe(true);
    expect(getReasoningOutput(editor.getNode('source')!)).toMatchObject({ invalid: true });
    expect(editor.getField({ nodeId: 'consumer', fieldKey: 'reasoning' })?.references).toEqual([
      expect.objectContaining({ code: 'invalid_reference' })
    ]);
  });

  it('refreshes empty candidates and subscriptions when model validity changes', () => {
    const { editor, environment } = createReasoningRuntime({
      modelValue: 'reasoning-model',
      reasoning: false
    });
    const fieldQuery = { nodeId: 'consumer', fieldKey: 'reasoning' };
    const fieldListener = vi.fn();
    const referenceListener = vi.fn();
    editor.subscribeField(fieldQuery, fieldListener);
    editor.subscribeReferenceOptions(referenceListener);

    const consumer = editor.getNode('consumer')!;
    editor.dispatch({
      type: 'updateNode',
      nodeId: 'consumer',
      patch: {
        inputs: consumer.inputs.map((input) => ({ ...input, value: undefined }))
      }
    });
    expect(
      editor
        .getField(fieldQuery)
        ?.referenceOptions.some((option) => option.reference[0] === 'source')
    ).toBe(false);

    const unsupportedModel = environment.models![0]!;
    environment.models = [
      unsupportedModel,
      {
        ...unsupportedModel,
        modelId: 'supported-reasoning-model',
        model: 'supported-reasoning-model',
        config: { ...unsupportedModel.config!, reasoning: true }
      }
    ];
    const selectModel = (modelValue: string) => {
      const node = editor.getNode('source')!;
      return editor.dispatch({
        type: 'updateNode',
        nodeId: 'source',
        patch: {
          inputs: node.inputs.map((input) =>
            input.key === NodeInputKeyEnum.aiModelId ? { ...input, value: modelValue } : input
          )
        }
      });
    };

    fieldListener.mockClear();
    referenceListener.mockClear();
    expect(selectModel('supported-reasoning-model').ok).toBe(true);
    expect(
      editor
        .getField(fieldQuery)
        ?.referenceOptions.some(
          (option) =>
            option.reference[0] === 'source' &&
            option.reference[1] === NodeOutputKeyEnum.reasoningText
        )
    ).toBe(true);
    expect(fieldListener).toHaveBeenCalledOnce();
    expect(referenceListener).toHaveBeenCalledOnce();

    fieldListener.mockClear();
    referenceListener.mockClear();
    expect(selectModel('reasoning-model').ok).toBe(true);
    expect(
      editor
        .getField(fieldQuery)
        ?.referenceOptions.some(
          (option) =>
            option.reference[0] === 'source' &&
            option.reference[1] === NodeOutputKeyEnum.reasoningText
        )
    ).toBe(false);
    expect(fieldListener).toHaveBeenCalledOnce();
    expect(referenceListener).toHaveBeenCalledOnce();
  });

  it('recomputes Runtime invalid after semantic history replay', () => {
    const { editor, environment } = createReasoningRuntime({
      modelValue: 'reasoning-model',
      reasoning: false
    });

    editor.dispatch({ type: 'updateNode', nodeId: 'source', patch: { name: 'Renamed' } });
    environment.models![0].config = {
      ...environment.models![0].config!,
      reasoning: true
    };
    editor.refreshIssues('all');
    expect(
      editor
        .getNode('source')
        ?.outputs.find((output) => output.id === NodeOutputKeyEnum.reasoningText)?.invalid
    ).toBe(false);

    expect(editor.undo().ok).toBe(true);
    expect(
      editor
        .getWorkflow()
        .nodes.find((node) => node.nodeId === 'source')
        ?.outputs.find((output) => output.id === NodeOutputKeyEnum.reasoningText)?.invalid
    ).toBe(false);
    expect(editor.getNode('source')?.name).toBe('Source');
    expect(
      editor.getNode('source')?.inputs.find((input) => input.key === NodeInputKeyEnum.aiModelId)
        ?.value
    ).toBe('reasoning-model');
    expect(editor.redo().ok).toBe(true);
    expect(
      editor
        .getNode('source')
        ?.outputs.find((output) => output.id === NodeOutputKeyEnum.reasoningText)?.invalid
    ).toBe(false);
  });

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
    const workflowAfterRefresh = editor.getWorkflow();
    expect(workflowAfterRefresh).not.toBe(workflowBeforeRefresh);
    expect(workflowAfterRefresh.nodes.find((node) => node.nodeId === 'chat')?.issues).toEqual(
      editor.getNode('chat')?.issues
    );
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

  it('invalidates workflow snapshot when only config issues change', () => {
    const environment: { models: WorkflowEnvironment['models'] } = { models: LLM_MODELS };
    const editor = createWorkflowEditor(
      createEnvironmentFixture({ questionGuide: { open: true, modelId: 'gone' } }),
      {
        getEnvironment: () => ({
          models: environment.models,
          sandbox: { configured: true, planSupported: true }
        })
      }
    );
    const before = editor.getWorkflow();
    environment.models = [{ modelId: 'gone', model: 'gone', type: ModelTypeEnum.llm }];

    expect(editor.refreshIssues('all').nodeIds).toEqual([]);
    expect(editor.getWorkflow()).not.toBe(before);
    expect(editor.getWorkflowIssues().chatConfigIssues).toEqual([]);
  });
});

describe('workflow reference option cache invalidation', () => {
  it('refreshes candidates for a non-empty downstream reference after source rename', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'source',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Old source',
          inputs: [],
          outputs: [
            {
              id: 'out',
              key: 'out',
              type: FlowNodeOutputTypeEnum.source,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ]
        },
        {
          nodeId: 'consumer',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Consumer',
          inputs: [
            {
              key: 'value',
              label: 'Value',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string,
              value: ['source', 'out']
            }
          ],
          outputs: []
        }
      ],
      edges: [
        { source: 'source', target: 'consumer', sourceHandle: 'out', targetHandle: 'target' }
      ],
      chatConfig: {}
    });
    const query = { nodeId: 'consumer', fieldKey: 'value' };
    const listener = vi.fn();
    editor.getField(query);
    editor.subscribeField(query, listener);

    editor.dispatch({ type: 'updateNode', nodeId: 'source', patch: { name: 'New source' } });

    expect(listener).toHaveBeenCalledOnce();
    expect(editor.getField(query)?.referenceOptions).toContainEqual(
      expect.objectContaining({ reference: ['source', 'out'], sourceLabel: 'New source' })
    );
    expect(editor.undo().ok).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(editor.getField(query)?.referenceOptions).toContainEqual(
      expect.objectContaining({ reference: ['source', 'out'], sourceLabel: 'Old source' })
    );
    expect(editor.redo().ok).toBe(true);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(editor.getField(query)?.referenceOptions).toContainEqual(
      expect.objectContaining({ reference: ['source', 'out'], sourceLabel: 'New source' })
    );
  });
});
