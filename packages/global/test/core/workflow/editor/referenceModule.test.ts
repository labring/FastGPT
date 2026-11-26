import { describe, expect, it, vi } from 'vitest';
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
import { createWorkflowEditor } from '@fastgpt/global/common/workflow/editor/runtime/runtime';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { isWorkflowErrorBranchReachable } from '@fastgpt/global/common/workflow/reference';
import * as workflowReference from '@fastgpt/global/common/workflow/reference';

type ContainerNodeInfo = { parentNodeId: string; name: string };

const containerSource = (nodeId: string, info: ContainerNodeInfo) => ({
  nodeId,
  ...info,
  flowNodeType: FlowNodeTypeEnum.textEditor,
  inputs: [],
  outputs: [
    {
      id: 'output',
      key: 'output',
      type: FlowNodeOutputTypeEnum.source,
      valueType: WorkflowIOValueTypeEnum.string
    }
  ]
});

const containerEnd = (
  nodeId: string,
  { value, ...info }: ContainerNodeInfo & { value: string[] }
) => ({
  nodeId,
  ...info,
  flowNodeType: FlowNodeTypeEnum.nestedEnd,
  inputs: [
    {
      key: NodeInputKeyEnum.nestedEndInput,
      label: '',
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference,
      valueType: WorkflowIOValueTypeEnum.any,
      value
    }
  ],
  outputs: []
});

describe('workflow reference reachability', () => {
  it.each([false, true])(
    'ignores imported cross-container edges for references (catch=%s)',
    (isCatch) => {
      const source = {
        nodeId: 'source',
        name: 'Source',
        flowNodeType: FlowNodeTypeEnum.textEditor,
        catchError: isCatch,
        inputs: [],
        outputs: [
          {
            id: 'result',
            key: 'result',
            type: isCatch ? FlowNodeOutputTypeEnum.error : FlowNodeOutputTypeEnum.static,
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      };
      const scope = {
        nodeId: 'loop',
        name: 'Loop',
        flowNodeType: FlowNodeTypeEnum.loopRun,
        inputs: [],
        outputs: []
      };
      const consumer = {
        nodeId: 'inside',
        parentNodeId: scope.nodeId,
        name: 'Inside',
        flowNodeType: FlowNodeTypeEnum.textEditor,
        inputs: [
          {
            key: 'input',
            label: 'Input',
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.string,
            value: ['source', 'result']
          }
        ],
        outputs: []
      };
      const edges = [
        {
          source: 'source',
          target: 'inside',
          sourceHandle: isCatch ? 'source-source_catch-right' : 'source-source-right',
          targetHandle: 'inside-target-left'
        }
      ];
      const nodes = [source, scope, consumer];
      const editor = createWorkflowEditor({ nodes, edges, chatConfig: {} });

      expect(
        workflowReference.getWorkflowReferenceSourceNodes({
          nodeId: 'inside',
          edges,
          getNodeById: (nodeId) => nodes.find((node) => node.nodeId === nodeId)
        })
      ).toEqual([]);
      expect(editor.getField({ nodeId: 'inside', fieldKey: 'input' })).toMatchObject({
        references: [{ code: 'unreachable_reference' }],
        referenceOptions: expect.not.arrayContaining([
          expect.objectContaining({ reference: ['source', 'result'] })
        ])
      });
      expect(editor.getWorkflowData().edges).toEqual(edges);
    }
  );

  it.each([false, true])(
    'requires an in-scope tool mount for HTTP parameter outputs (same scope=%s)',
    (sameScope) => {
      const reference = ['http', 'customParam'] as [string, string];
      const snapshot = { reference, outputLabel: 'Saved parameter' };
      const editor = createWorkflowEditor({
        nodes: [
          {
            nodeId: 'loop',
            name: 'Loop',
            flowNodeType: FlowNodeTypeEnum.loopRun,
            inputs: [],
            outputs: []
          },
          {
            nodeId: 'agent',
            name: 'Agent',
            flowNodeType: FlowNodeTypeEnum.agent,
            parentNodeId: sameScope ? undefined : 'loop',
            inputs: [],
            outputs: []
          },
          {
            nodeId: 'http',
            name: 'HTTP',
            flowNodeType: FlowNodeTypeEnum.httpRequest468,
            inputs: [
              {
                key: 'customParam',
                label: 'Parameter',
                renderTypeList: [FlowNodeInputTypeEnum.input],
                canEdit: true,
                canAgentGenerated: true,
                defaultToAgentGenerated: true,
                valueType: WorkflowIOValueTypeEnum.string
              }
            ],
            outputs: []
          },
          {
            nodeId: 'consumer',
            name: 'Consumer',
            flowNodeType: FlowNodeTypeEnum.textEditor,
            inputs: [
              {
                key: 'input',
                label: 'Input',
                renderTypeList: [FlowNodeInputTypeEnum.reference],
                value: reference
              }
            ],
            outputs: []
          }
        ],
        edges: [
          {
            source: 'agent',
            target: 'http',
            sourceHandle: NodeOutputKeyEnum.selectedTools,
            targetHandle: NodeOutputKeyEnum.selectedTools
          },
          {
            source: 'http',
            target: 'consumer',
            sourceHandle: 'http-source-right',
            targetHandle: 'consumer-target-left'
          }
        ],
        chatConfig: {},
        referenceSnapshots: [snapshot]
      });

      expect(editor.getGraphQueries().isMountedTool('http')).toBe(sameScope);
      const field = editor.getField({ nodeId: 'consumer', fieldKey: 'input' });
      expect(field?.references[0]?.code).toBe(sameScope ? 'valid' : 'invalid_reference');
      expect(field?.referenceOptions.some((item) => item.reference[1] === 'customParam')).toBe(
        sameScope
      );
      expect(editor.getWorkflowData().referenceSnapshots).toEqual(sameScope ? [] : [snapshot]);
    }
  );

  it('validates immediate upstream references without building every ancestor list', () => {
    const count = 120;
    const nodes = Array.from({ length: count }, (_, index) => ({
      nodeId: `node-${index}`,
      name: `Node ${index}`,
      flowNodeType: index === 0 ? FlowNodeTypeEnum.workflowStart : FlowNodeTypeEnum.textEditor,
      inputs:
        index === 0
          ? []
          : [
              {
                key: 'input',
                label: 'Input',
                renderTypeList: [FlowNodeInputTypeEnum.reference],
                valueType: WorkflowIOValueTypeEnum.string,
                value: [`node-${index - 1}`, 'result']
              }
            ],
      outputs: [
        {
          id: 'result',
          key: 'result',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    }));
    const edges = nodes.slice(1).map(({ nodeId }, index) => ({
      source: nodes[index].nodeId,
      target: nodeId,
      sourceHandle: `${nodes[index].nodeId}-source-right`,
      targetHandle: `${nodeId}-target-left`
    }));
    const edgeChecks = vi.spyOn(workflowReference, 'isWorkflowEdgeSourceHandleValid');
    try {
      const editor = createWorkflowEditor({ nodes, edges, chatConfig: {}, referenceSnapshots: [] });
      expect(editor.getWorkflowIssues().issues).toEqual([]);
      // 可达性和字段校验都可以扫描紧邻的边，开销随节点数线性增长。
      expect(edgeChecks.mock.calls.length).toBeLessThanOrEqual(count * 4);
      expect(
        editor.getGraphQueries().getSourceNodeIds({ nodeId: `node-${count - 1}` })
      ).toHaveLength(count - 1);
    } finally {
      edgeChecks.mockRestore();
    }
  });

  it('validates reserved field names as ordinary inputs on a Code node', () => {
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
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ]
        },
        {
          nodeId: 'code',
          flowNodeType: FlowNodeTypeEnum.code,
          name: 'Code',
          inputs: [NodeInputKeyEnum.updateList, NodeInputKeyEnum.agents].map((key) => ({
            key,
            label: key,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            valueType: WorkflowIOValueTypeEnum.string,
            value: ['start', 'text']
          })),
          outputs: []
        }
      ],
      edges: [{ source: 'start', target: 'code', sourceHandle: 'source', targetHandle: 'target' }],
      chatConfig: {}
    });

    expect(
      editor.getField({ nodeId: 'code', fieldKey: NodeInputKeyEnum.updateList })?.references
    ).toEqual([expect.objectContaining({ code: 'valid', reference: ['start', 'text'] })]);
    expect(editor.getNode('code')?.issues).not.toContainEqual(
      expect.objectContaining({ code: 'invalid_reference' })
    );

    const onStructure = vi.fn();
    const unsubscribe = editor.subscribeWorkflow(onStructure);
    editor.getFieldHandle({ nodeId: 'code', fieldKey: NodeInputKeyEnum.agents })?.setValue([]);
    expect(
      editor.getNode('code')?.inputs.find(({ key }) => key === NodeInputKeyEnum.agents)?.value
    ).toEqual([]);
    expect(onStructure).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('keeps strict string references and allows all types for interpolation fields', () => {
    const editor = createWorkflowEditor({
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
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.string
            },
            {
              id: 'count',
              key: 'count',
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.number
            },
            {
              id: 'object',
              key: 'object',
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.object
            },
            {
              id: 'array',
              key: 'array',
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.arrayString
            }
          ]
        },
        {
          nodeId: 'reference',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Reference',
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
          nodeId: 'interpolation',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Interpolation',
          inputs: [
            {
              key: 'value',
              label: 'Value',
              renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.input,
              valueType: WorkflowIOValueTypeEnum.string,
              value: '{{$source.count$}}'
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'source',
          target: 'reference',
          sourceHandle: 'source',
          targetHandle: 'target'
        },
        {
          source: 'source',
          target: 'interpolation',
          sourceHandle: 'source',
          targetHandle: 'target'
        }
      ],
      chatConfig: {}
    });
    const referenceQuery = { nodeId: 'reference', fieldKey: 'value' };
    const interpolationQuery = { nodeId: 'interpolation', fieldKey: 'value' };

    const referenceOptions = editor
      .getField(referenceQuery)
      ?.referenceOptions.filter(({ reference }) => reference[0] !== 'VARIABLE_NODE_ID')
      .map(({ reference }) => reference);
    expect(referenceOptions).toEqual([['source', 'text']]);
    const interpolationOptions = editor
      .getField(interpolationQuery)
      ?.referenceOptions.filter(({ reference }) => reference[0] !== 'VARIABLE_NODE_ID')
      .map(({ reference }) => reference);
    expect(interpolationOptions).toEqual([
      ['source', 'text'],
      ['source', 'count'],
      ['source', 'object'],
      ['source', 'array']
    ]);
    expect(editor.getField(interpolationQuery)?.references).toEqual([
      expect.objectContaining({ code: 'valid', reference: ['source', 'count'] })
    ]);
    expect(editor.getNode('interpolation')?.issues.map(({ code }) => code)).not.toContain(
      'invalid_reference_type'
    );

    const interpolation = editor.getNode('interpolation')!;
    editor.dispatch({
      type: 'updateNode',
      nodeId: 'interpolation',
      patch: {
        inputs: interpolation.inputs.map((input) =>
          input.key === 'value'
            ? { ...input, selectedType: FlowNodeInputTypeEnum.reference }
            : input
        )
      }
    });
    expect(
      editor
        .getField(interpolationQuery)
        ?.referenceOptions.filter(({ reference }) => reference[0] !== 'VARIABLE_NODE_ID')
        .map(({ reference }) => reference)
    ).toEqual([['source', 'text']]);
  });

  it('keeps duplicate update-list references when their target types differ', () => {
    const editor = createWorkflowEditor({
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
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.string
            },
            {
              id: 'count',
              key: 'count',
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.number
            }
          ]
        },
        {
          nodeId: 'update',
          flowNodeType: FlowNodeTypeEnum.variableUpdate,
          name: 'Update variables',
          inputs: [
            {
              key: NodeInputKeyEnum.updateList,
              label: 'Update list',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              selectedType: FlowNodeInputTypeEnum.input,
              valueType: WorkflowIOValueTypeEnum.any,
              value: [
                {
                  variable: ['source', 'text'],
                  value: ['source', 'count'],
                  valueType: WorkflowIOValueTypeEnum.string,
                  renderType: FlowNodeInputTypeEnum.reference
                },
                {
                  variable: ['source', 'count'],
                  value: ['source', 'count'],
                  valueType: WorkflowIOValueTypeEnum.number,
                  renderType: FlowNodeInputTypeEnum.reference
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
          sourceHandle: 'source',
          targetHandle: 'target'
        }
      ],
      chatConfig: {}
    });

    const repeatedReferences = editor
      .getField({ nodeId: 'update', fieldKey: NodeInputKeyEnum.updateList })
      ?.references.filter(
        (reference) => reference.reference[0] === 'source' && reference.reference[1] === 'count'
      );
    expect(repeatedReferences?.map(({ code }) => code)).toContain('invalid_reference_type');
    expect(repeatedReferences?.map(({ code }) => code)).toContain('valid');
    editor.dispose();
  });

  it('refreshes container references without exposing an unconnected sibling', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'parallel',
          flowNodeType: FlowNodeTypeEnum.parallelRun,
          name: 'Parallel',
          inputs: [],
          outputs: []
        },
        containerEnd('end', { parentNodeId: 'parallel', name: 'End', value: [] })
      ],
      edges: [],
      chatConfig: {}
    });
    const query = { nodeId: 'end', fieldKey: NodeInputKeyEnum.nestedEndInput };
    const fieldListener = vi.fn();
    editor.subscribeField(query, fieldListener);

    expect(editor.getField(query)?.referenceOptions).not.toContainEqual(
      expect.objectContaining({ reference: ['source', 'output'] })
    );
    editor.dispatch({
      type: 'addNode',
      node: containerSource('source', { parentNodeId: 'parallel', name: 'Source' })
    });

    expect(editor.getField(query)?.referenceOptions).not.toContainEqual(
      expect.objectContaining({ reference: ['source', 'output'] })
    );
    expect(fieldListener).toHaveBeenCalledOnce();
    editor.dispatch({
      type: 'updateField',
      nodeId: 'end',
      fieldKey: NodeInputKeyEnum.nestedEndInput,
      value: ['source', 'output']
    });
    expect(editor.getField(query)?.references).toEqual([
      expect.objectContaining({ code: 'unreachable_reference' })
    ]);

    editor.dispatch({ type: 'removeNodes', nodeIds: ['source'] });
    expect(editor.getField(query)?.referenceOptions).not.toContainEqual(
      expect.objectContaining({ reference: ['source', 'output'] })
    );
    expect(editor.getField(query)?.references).toEqual([
      expect.objectContaining({ code: 'invalid_reference' })
    ]);
  });

  it('only exposes connected container sources and invalidates them after disconnect', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'left',
          flowNodeType: FlowNodeTypeEnum.parallelRun,
          name: 'Left',
          inputs: [],
          outputs: []
        },
        containerSource('leftSource', { parentNodeId: 'left', name: 'Left source' }),
        containerEnd('leftEnd', {
          parentNodeId: 'left',
          name: 'Left end',
          value: ['leftSource', 'output']
        }),
        {
          nodeId: 'leftConsumer',
          parentNodeId: 'left',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Left consumer',
          inputs: [
            {
              key: 'value',
              label: 'Value',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string,
              value: ['leftSource', 'output']
            }
          ],
          outputs: []
        },
        {
          nodeId: 'right',
          flowNodeType: FlowNodeTypeEnum.parallelRun,
          name: 'Right',
          inputs: [],
          outputs: []
        },
        containerSource('rightSource', { parentNodeId: 'right', name: 'Right source' }),
        containerEnd('rightEnd', {
          parentNodeId: 'right',
          name: 'Right end',
          value: ['rightSource', 'output']
        })
      ],
      edges: [],
      chatConfig: {}
    });

    const endQuery = { nodeId: 'leftEnd', fieldKey: NodeInputKeyEnum.nestedEndInput };
    const endListener = vi.fn();
    editor.subscribeField(endQuery, endListener);
    expect(editor.getField(endQuery)?.references).toEqual([
      expect.objectContaining({ code: 'unreachable_reference' })
    ]);
    expect(editor.getField({ nodeId: 'leftConsumer', fieldKey: 'value' })?.references).toEqual([
      expect.objectContaining({ code: 'unreachable_reference' })
    ]);
    expect(editor.getReferenceOptions({ nodeId: 'leftEnd' })).not.toContainEqual(
      expect.objectContaining({ reference: ['leftSource', 'output'] })
    );

    const edge = {
      source: 'leftSource',
      target: 'leftEnd',
      sourceHandle: 'output',
      targetHandle: 'target'
    };
    editor.dispatch({ type: 'connectEdge', edge });
    expect(
      editor.getReferenceOptions({
        nodeId: 'leftEnd',
        valueType: WorkflowIOValueTypeEnum.string
      })
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ reference: ['leftSource', 'output'] })])
    );
    expect(editor.getField(endQuery)?.references).toEqual([
      expect.objectContaining({ code: 'valid' })
    ]);
    expect(
      editor
        .getReferenceOptions({
          nodeId: 'leftEnd',
          valueType: WorkflowIOValueTypeEnum.string
        })
        .some((option) => option.reference[0] === 'rightSource')
    ).toBe(false);

    const listenerCallsBeforeDisconnect = endListener.mock.calls.length;
    editor.dispatch({ type: 'disconnectEdge', edge });
    expect(endListener).toHaveBeenCalledTimes(listenerCallsBeforeDisconnect + 1);
    expect(editor.getField(endQuery)?.references).toEqual([
      expect.objectContaining({ code: 'unreachable_reference' })
    ]);
    expect(editor.getReferenceOptions({ nodeId: 'leftEnd' })).not.toContainEqual(
      expect.objectContaining({ reference: ['leftSource', 'output'] })
    );
  });

  it('requires the catch port for an error output reference', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'source',
          flowNodeType: FlowNodeTypeEnum.code,
          name: 'Source',
          catchError: true,
          inputs: [],
          outputs: [
            {
              id: '__error',
              key: '__error',
              type: FlowNodeOutputTypeEnum.error,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ]
        },
        {
          nodeId: 'target',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Target',
          inputs: [
            {
              key: 'value',
              label: 'Value',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string,
              value: ['source', '__error']
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'source',
          target: 'target',
          sourceHandle: 'source-source-right',
          targetHandle: 'target-target-left'
        }
      ],
      chatConfig: {}
    });
    const query = { nodeId: 'target', fieldKey: 'value' };

    expect(editor.getField(query)?.references).toEqual([
      expect.objectContaining({ code: 'unreachable_reference' })
    ]);
    expect(editor.getReferenceOptions({ nodeId: 'target' })).not.toContainEqual(
      expect.objectContaining({ reference: ['source', '__error'] })
    );

    editor.dispatch({
      type: 'connectEdge',
      edge: {
        source: 'source',
        target: 'target',
        sourceHandle: 'source-source_catch-right',
        targetHandle: 'target-target-left'
      }
    });
    expect(editor.getField(query)?.references).toEqual([
      expect.objectContaining({ code: 'valid' })
    ]);
    expect(editor.getReferenceOptions({ nodeId: 'target' })).toContainEqual(
      expect.objectContaining({ reference: ['source', '__error'] })
    );
    editor.dispose();
  });

  it('exposes direct child errors only to LoopRun output declarations', () => {
    const value = ['child', 'caught'];
    const input = {
      key: 'result',
      label: 'Result',
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      value
    };
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'loop',
          flowNodeType: FlowNodeTypeEnum.loopRun,
          name: 'Loop',
          inputs: [
            { ...input, canEdit: true },
            { ...input, key: 'ordinary' }
          ],
          outputs: []
        },
        {
          nodeId: 'child',
          parentNodeId: 'loop',
          flowNodeType: FlowNodeTypeEnum.code,
          name: 'Child',
          catchError: true,
          inputs: [],
          outputs: [{ id: 'caught', key: 'caught', type: FlowNodeOutputTypeEnum.error }]
        }
      ],
      edges: [],
      chatConfig: {}
    });
    expect(editor.getField({ nodeId: 'loop', fieldKey: 'result' })?.references).toMatchObject([
      { code: 'valid', reference: value }
    ]);
    expect(editor.getField({ nodeId: 'loop', fieldKey: 'ordinary' })?.references).toMatchObject([
      { code: 'unreachable_reference', reference: value }
    ]);
    expect(editor.getReferenceOptions({ nodeId: 'loop', includeChildren: true })).toContainEqual(
      expect.objectContaining({ reference: value })
    );
    expect(editor.getReferenceOptions({ nodeId: 'loop' })).not.toContainEqual(
      expect.objectContaining({ reference: value })
    );
    editor.dispose();
  });

  it('does not expose a selected tool caller or the target itself as a reference source', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'upstream',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Upstream',
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
          nodeId: 'caller',
          flowNodeType: FlowNodeTypeEnum.toolCall,
          name: 'Caller',
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
          nodeId: 'tool',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Tool',
          inputs: [
            {
              key: 'value',
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ],
          outputs: []
        },
        {
          nodeId: 'self',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Self',
          inputs: [
            {
              key: 'value',
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string,
              value: ['self', 'out']
            }
          ],
          outputs: [
            {
              id: 'out',
              key: 'out',
              type: FlowNodeOutputTypeEnum.source,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ]
        }
      ],
      edges: [
        { source: 'upstream', target: 'caller', sourceHandle: 'out', targetHandle: 'target' },
        {
          source: 'caller',
          target: 'tool',
          sourceHandle: 'source',
          targetHandle: NodeOutputKeyEnum.selectedTools
        },
        { source: 'self', target: 'self', sourceHandle: 'out', targetHandle: 'target' }
      ],
      chatConfig: {}
    });

    const toolReferences = editor
      .getReferenceOptions({ nodeId: 'tool' })
      .map(({ reference }) => reference);
    expect(toolReferences).not.toContainEqual(['caller', 'out']);
    expect(toolReferences).toContainEqual(['upstream', 'out']);
    expect(editor.getGraphQueries().getSourceNodeIds({ nodeId: 'tool' })).not.toContain('caller');
    expect(editor.getGraphQueries().getSourceNodeIds({ nodeId: 'self' })).not.toContain('self');
    expect(editor.getField({ nodeId: 'self', fieldKey: 'value' })?.references).toEqual([
      expect.objectContaining({ code: 'unreachable_reference' })
    ]);
  });

  it('enforces value types for secret references', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'source',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Source',
          inputs: [],
          outputs: [
            {
              id: 'count',
              key: 'count',
              type: FlowNodeOutputTypeEnum.source,
              valueType: WorkflowIOValueTypeEnum.number
            }
          ]
        },
        {
          nodeId: 'http',
          flowNodeType: FlowNodeTypeEnum.httpRequest468,
          name: 'HTTP',
          inputs: [
            {
              key: NodeInputKeyEnum.headerSecret,
              label: 'Headers',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.object,
              value: { Authorization: { ref: ['source', 'count'] } }
            }
          ],
          outputs: []
        }
      ],
      edges: [{ source: 'source', target: 'http', sourceHandle: 'count', targetHandle: 'target' }],
      chatConfig: {}
    });

    expect(
      editor.getField({ nodeId: 'http', fieldKey: NodeInputKeyEnum.headerSecret })?.references
    ).toEqual([expect.objectContaining({ code: 'invalid_reference_type' })]);
  });

  it.each(['token', 'count'])(
    'checks both credential types when %s is the first field using a shared reference',
    (firstKey) => {
      const fields = firstKey === 'token' ? ['token', 'count'] : ['count', 'token'];
      const editor = createWorkflowEditor({
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
            nodeId: 'tool',
            flowNodeType: FlowNodeTypeEnum.tool,
            name: 'Tool',
            inputs: [
              {
                key: NodeInputKeyEnum.systemInputConfig,
                label: 'Credentials',
                renderTypeList: [FlowNodeInputTypeEnum.hidden],
                inputList: [
                  { key: 'token', label: 'Token', inputType: 'input' },
                  { key: 'count', label: 'Count', inputType: 'numberInput' }
                ],
                value: {
                  type: SystemToolSecretInputTypeEnum.manual,
                  value: Object.fromEntries(fields.map((key) => [key, { ref: ['source', 'text'] }]))
                }
              }
            ],
            outputs: []
          }
        ],
        edges: [{ source: 'source', target: 'tool', sourceHandle: 'text', targetHandle: 'target' }],
        chatConfig: {}
      });

      expect(
        editor
          .getField({ nodeId: 'tool', fieldKey: NodeInputKeyEnum.systemInputConfig })
          ?.references.map(({ code }) => code)
          .sort()
      ).toEqual(['invalid_reference_type', 'valid']);
    }
  );

  it.each([
    { path: 'execution', reachable: true },
    { path: 'non-catch execution', reachable: false },
    { path: 'container entry', reachable: true },
    { path: 'selected tool', reachable: true },
    { path: 'non-catch selected tool', reachable: false },
    { path: 'container alias', reachable: false }
  ])('checks error reachability through $path in the field and selector', ({ path, reachable }) => {
    const mountedTool = path.endsWith('selected tool');
    const insideContainer = path === 'container entry' || path === 'container alias';
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'source',
          flowNodeType: FlowNodeTypeEnum.code,
          name: 'Source',
          catchError: true,
          inputs: [],
          outputs: [
            {
              id: '__error',
              key: '__error',
              type: FlowNodeOutputTypeEnum.error,
              valueType: WorkflowIOValueTypeEnum.string
            },
            {
              id: 'text',
              key: 'text',
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ]
        },
        {
          nodeId: 'relay',
          flowNodeType: insideContainer
            ? FlowNodeTypeEnum.parallelRun
            : mountedTool
              ? FlowNodeTypeEnum.toolCall
              : FlowNodeTypeEnum.textEditor,
          name: 'Relay',
          inputs:
            path === 'container alias'
              ? [
                  {
                    key: 'alias',
                    label: 'Alias',
                    renderTypeList: [FlowNodeInputTypeEnum.reference],
                    defaultValue: ['source', 'text']
                  }
                ]
              : [],
          outputs: []
        },
        {
          nodeId: 'target',
          ...(insideContainer ? { parentNodeId: 'relay' } : {}),
          flowNodeType: FlowNodeTypeEnum.code,
          name: 'Target',
          inputs: [
            {
              key: 'value',
              label: 'Value',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string,
              value: [
                ['source', '__error'],
                ['source', 'text']
              ]
            }
          ],
          outputs: []
        }
      ],
      edges:
        path === 'container alias'
          ? []
          : [
              {
                source: 'source',
                target: 'relay',
                sourceHandle: path.startsWith('non-catch')
                  ? 'source-source-right'
                  : 'source-source_catch-right',
                targetHandle: 'relay-target-left'
              },
              ...(!insideContainer
                ? [
                    {
                      source: 'relay',
                      target: 'target',
                      sourceHandle: mountedTool
                        ? NodeOutputKeyEnum.selectedTools
                        : 'relay-source-right',
                      targetHandle: mountedTool
                        ? NodeOutputKeyEnum.selectedTools
                        : 'target-target-left'
                    }
                  ]
                : [])
            ],
      chatConfig: {}
    });
    const query = { nodeId: 'target', fieldKey: 'value' };

    expect(editor.getField(query)?.references).toEqual([
      expect.objectContaining({
        reference: ['source', '__error'],
        code: reachable ? 'valid' : 'unreachable_reference'
      }),
      expect.objectContaining({ reference: ['source', 'text'], code: 'valid' })
    ]);
    const options = editor.getReferenceOptions({ nodeId: 'target' });
    expect(
      options.some(({ reference }) => reference[0] === 'source' && reference[1] === '__error')
    ).toBe(reachable);
    expect(options).toContainEqual(expect.objectContaining({ reference: ['source', 'text'] }));
    editor.dispose();
  });

  it('stops checking error reachability when malformed parent links cycle', () => {
    expect(
      isWorkflowErrorBranchReachable({
        sourceNodeId: 'source',
        targetNodeId: 'target',
        parentByNodeId: new Map([
          ['target', 'parent'],
          ['parent', 'target']
        ]),
        getIncomingEdges: () => []
      })
    ).toBe(false);
  });

  it('allows loop custom outputs to reference child nodes only', () => {
    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'loop',
          flowNodeType: FlowNodeTypeEnum.loopRun,
          name: 'Loop',
          inputs: [
            {
              key: NodeInputKeyEnum.loopCustomOutputs,
              label: 'Custom outputs',
              renderTypeList: [FlowNodeInputTypeEnum.addInputParam],
              valueType: WorkflowIOValueTypeEnum.dynamic,
              canEdit: true,
              value: []
            },
            {
              key: 'childOutput',
              label: 'Child output',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string,
              canEdit: true,
              value: ['child', 'output']
            },
            {
              key: NodeInputKeyEnum.loopRunInputArray,
              label: 'Loop input',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.arrayAny,
              value: ['child', 'output']
            },
            {
              key: NodeInputKeyEnum.childrenNodeIdList,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.arrayString,
              value: ['child']
            }
          ],
          outputs: []
        },
        containerSource('child', { parentNodeId: 'loop', name: 'Child' })
      ],
      edges: [],
      chatConfig: {}
    });

    expect(
      editor.getReferenceOptions({
        nodeId: 'loop',
        valueType: WorkflowIOValueTypeEnum.any,
        includeChildren: true
      })
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ reference: ['child', 'output'] })])
    );
    expect(
      editor.getField({ nodeId: 'loop', fieldKey: NodeInputKeyEnum.loopCustomOutputs })
        ?.referenceOptions
    ).toContainEqual(expect.objectContaining({ reference: ['child', 'output'] }));
    const loopOutputQuery = { nodeId: 'loop', fieldKey: NodeInputKeyEnum.loopCustomOutputs };
    const loopOutputListener = vi.fn();
    editor.subscribeField(loopOutputQuery, loopOutputListener);
    editor.dispatch({ type: 'updateNode', nodeId: 'child', patch: { name: 'Renamed child' } });
    expect(loopOutputListener).toHaveBeenCalledOnce();
    expect(editor.getField(loopOutputQuery)?.referenceOptions).toContainEqual(
      expect.objectContaining({ reference: ['child', 'output'], sourceLabel: 'Renamed child' })
    );
    expect(editor.getField({ nodeId: 'loop', fieldKey: 'childOutput' })?.references).toEqual([
      expect.objectContaining({ code: 'valid' })
    ]);
    expect(
      editor.getField({ nodeId: 'loop', fieldKey: NodeInputKeyEnum.loopRunInputArray })?.references
    ).toEqual([expect.objectContaining({ code: 'unreachable_reference' })]);
  });

  it('excludes pending tool callers even when a tool subflow container references the caller', () => {
    const rootSource = (nodeId: string, name: string) => ({
      nodeId,
      name,
      flowNodeType: FlowNodeTypeEnum.textEditor,
      inputs: [],
      outputs: [
        {
          id: 'output',
          key: 'output',
          type: FlowNodeOutputTypeEnum.source,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    });
    const editor = createWorkflowEditor({
      nodes: [
        rootSource('start', 'Start'),
        rootSource('caller', 'Caller'),
        rootSource('tool', 'Tool'),
        {
          nodeId: 'loop',
          flowNodeType: FlowNodeTypeEnum.loop,
          name: 'Loop',
          inputs: [
            {
              key: NodeInputKeyEnum.nestedInputArray,
              label: 'Loop input',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.arrayString,
              value: ['caller', 'output']
            },
            {
              key: NodeInputKeyEnum.childrenNodeIdList,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.arrayString,
              value: ['child']
            }
          ],
          outputs: []
        },
        {
          nodeId: 'child',
          parentNodeId: 'loop',
          flowNodeType: FlowNodeTypeEnum.answerNode,
          name: 'Child',
          inputs: [
            {
              key: 'refCaller',
              label: 'Ref caller',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.string,
              value: ['caller', 'output']
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'start',
          target: 'caller',
          sourceHandle: 'start-source-right',
          targetHandle: 'caller-target-left'
        },
        {
          source: 'caller',
          target: 'tool',
          sourceHandle: 'caller-source-right',
          targetHandle: NodeOutputKeyEnum.selectedTools
        },
        {
          source: 'tool',
          target: 'loop',
          sourceHandle: 'tool-source-right',
          targetHandle: 'loop-target-left'
        }
      ],
      chatConfig: {}
    });

    expect(
      editor
        .getReferenceOptions({ nodeId: 'child', valueType: WorkflowIOValueTypeEnum.any })
        .map((option) => option.reference[0])
    ).not.toContain('caller');
    expect(editor.getField({ nodeId: 'child', fieldKey: 'refCaller' })?.references).toEqual([
      expect.objectContaining({ code: 'unreachable_reference', reference: ['caller', 'output'] })
    ]);
  });
});
