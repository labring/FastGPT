import { describe, expect, it, vi } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { createWorkflowEditor } from '@fastgpt/global/common/workflow/editor/runtime/runtime';

describe('workflow reference reachability', () => {
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
        {
          nodeId: 'end',
          parentNodeId: 'parallel',
          flowNodeType: FlowNodeTypeEnum.nestedEnd,
          name: 'End',
          inputs: [
            {
              key: NodeInputKeyEnum.nestedEndInput,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.any,
              value: []
            }
          ],
          outputs: []
        }
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
      node: {
        nodeId: 'source',
        parentNodeId: 'parallel',
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
      } as never
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
        {
          nodeId: 'leftSource',
          parentNodeId: 'left',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Left source',
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
          nodeId: 'leftEnd',
          parentNodeId: 'left',
          flowNodeType: FlowNodeTypeEnum.nestedEnd,
          name: 'Left end',
          inputs: [
            {
              key: NodeInputKeyEnum.nestedEndInput,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.any,
              value: ['leftSource', 'output']
            }
          ],
          outputs: []
        },
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
        {
          nodeId: 'rightSource',
          parentNodeId: 'right',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Right source',
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
          nodeId: 'rightEnd',
          parentNodeId: 'right',
          flowNodeType: FlowNodeTypeEnum.nestedEnd,
          name: 'Right end',
          inputs: [
            {
              key: NodeInputKeyEnum.nestedEndInput,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              valueType: WorkflowIOValueTypeEnum.any,
              value: ['rightSource', 'output']
            }
          ],
          outputs: []
        }
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

  it('allows an error output to reach through the catch branch', () => {
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
          nodeId: 'relay',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Relay',
          inputs: [],
          outputs: []
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
          target: 'relay',
          sourceHandle: 'source-source_catch-right',
          targetHandle: 'relay-target-left'
        },
        {
          source: 'relay',
          target: 'target',
          sourceHandle: 'relay-source-right',
          targetHandle: 'target-target-left'
        }
      ],
      chatConfig: {}
    });
    const query = { nodeId: 'target', fieldKey: 'value' };

    expect(editor.getField(query)?.references).toEqual([
      expect.objectContaining({ code: 'valid' })
    ]);
    expect(editor.getReferenceOptions({ nodeId: 'target' })).toContainEqual(
      expect.objectContaining({ reference: ['source', '__error'] })
    );
    editor.dispose();
  });

  it('does not treat a normal branch through a relay as catch reachability', () => {
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
          nodeId: 'relay',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Relay',
          inputs: [],
          outputs: []
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
          target: 'relay',
          sourceHandle: 'source-source-right',
          targetHandle: 'relay-target-left'
        },
        {
          source: 'relay',
          target: 'target',
          sourceHandle: 'relay-source-right',
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
    editor.dispose();
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
        {
          nodeId: 'child',
          parentNodeId: 'loop',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          name: 'Child',
          inputs: [],
          outputs: [
            {
              id: 'output',
              key: 'output',
              type: FlowNodeOutputTypeEnum.source,
              valueType: WorkflowIOValueTypeEnum.string
            }
          ]
        }
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
    expect(editor.getField({ nodeId: 'loop', fieldKey: 'childOutput' })?.references).toEqual([
      expect.objectContaining({ code: 'valid' })
    ]);
    expect(
      editor.getField({ nodeId: 'loop', fieldKey: NodeInputKeyEnum.loopRunInputArray })?.references
    ).toEqual([expect.objectContaining({ code: 'unreachable_reference' })]);
  });
});
