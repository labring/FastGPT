import { describe, expect, it } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  graphNode,
  graphEdge,
  graphReference,
  graphValues,
  runGraph
} from './testUtils/workflowGraph';

/** 使用真实暂停快照恢复节点入口和边状态，验证完整两轮执行。 */
const restoreGraph = (paused: Awaited<ReturnType<typeof runGraph>>) => {
  const interactive = paused.result.workflowInteractiveResponse;
  if (!interactive) throw new Error('workflow did not pause');
  return {
    nodes: paused.result.debugResponse.memoryNodes.map((node) => ({
      ...node,
      isEntry: interactive.entryNodeIds.includes(node.nodeId)
    })),
    edges: interactive.memoryEdges,
    overrides: { variableState: paused.variableState, lastInteractive: interactive }
  };
};

describe('interactive workflow output propagation', () => {
  it('pauses userSelect and resumes only the chosen branch with the selected data', async () => {
    const source = graphNode({
      id: 'source',
      type: FlowNodeTypeEnum.toolParams,
      params: { value: 0 },
      outputs: ['value'],
      isEntry: true
    });
    const select = graphNode({
      id: 'select',
      type: FlowNodeTypeEnum.userSelect,
      params: {
        userSelectOptions: [
          { key: 'yes', value: 'yes' },
          { key: 'no', value: 'no' }
        ]
      },
      outputs: [NodeOutputKeyEnum.selectResult]
    });
    const yes = graphNode({
      id: 'yes',
      type: FlowNodeTypeEnum.toolParams,
      inputs: [
        graphReference({ key: 'selected', from: ['select', NodeOutputKeyEnum.selectResult] }),
        graphReference({ key: 'upstream', from: ['source', 'value'] })
      ],
      outputs: ['selected', 'upstream']
    });
    const no = graphNode({
      id: 'no',
      type: FlowNodeTypeEnum.toolParams,
      inputs: [
        graphReference({ key: 'selected', from: ['select', NodeOutputKeyEnum.selectResult] })
      ],
      outputs: ['selected']
    });
    const paused = await runGraph({
      nodes: [source, select, yes, no],
      edges: [
        graphEdge({ source: 'source', target: 'select' }),
        graphEdge({ source: 'select', target: 'yes', handle: 'yes' }),
        graphEdge({ source: 'select', target: 'no', handle: 'no' })
      ]
    });
    expect(paused.result.workflowInteractiveResponse?.type).toBe('userSelect');
    expect(paused.responses.map((response) => response.nodeId)).not.toContain('yes');
    expect(paused.responses.map((response) => response.nodeId)).not.toContain('no');
    const restored = restoreGraph(paused);
    const resumed = await runGraph({
      ...restored,
      overrides: { ...restored.overrides, query: [{ text: { content: 'yes' } }] }
    });
    expect(graphValues(restored.nodes.find((node) => node.nodeId === 'yes')!)).toEqual({
      selected: 'yes',
      upstream: 0
    });
    expect(resumed.responses.map((response) => response.nodeId)).toEqual(['select', 'yes']);
    expect(resumed.result.workflowInteractiveResponse).toBeUndefined();
    expect(resumed.result.workflowRuntimeSummary.errorCount).toBe(0);
  });

  it('resumes formInput and forwards every submitted value, including a business error field', async () => {
    const submitted = {
      zero: 0,
      flag: false,
      empty: '',
      nested: { items: [0, false] },
      error: 'business field'
    };
    const form = graphNode({
      id: 'form',
      type: FlowNodeTypeEnum.formInput,
      params: { userInputForms: [] },
      outputs: [...Object.keys(submitted), NodeOutputKeyEnum.formInputResult],
      isEntry: true
    });
    const target = graphNode({
      id: 'target',
      type: FlowNodeTypeEnum.toolParams,
      inputs: [...Object.keys(submitted), NodeOutputKeyEnum.formInputResult].map((key) =>
        graphReference({ key, from: ['form', key] })
      ),
      outputs: [...Object.keys(submitted), NodeOutputKeyEnum.formInputResult]
    });
    const paused = await runGraph({
      nodes: [form, target],
      edges: [graphEdge({ source: 'form', target: 'target' })]
    });
    expect(paused.result.workflowInteractiveResponse?.type).toBe('userInput');
    expect(paused.responses.some((response) => response.nodeId === 'target')).toBe(false);
    const restored = restoreGraph(paused);
    const resumed = await runGraph({
      ...restored,
      overrides: {
        ...restored.overrides,
        query: [{ text: { content: JSON.stringify(submitted) } }]
      }
    });
    expect(graphValues(restored.nodes.find((node) => node.nodeId === 'target')!)).toEqual({
      ...submitted,
      [NodeOutputKeyEnum.formInputResult]: submitted
    });
    expect(resumed.result.workflowRuntimeSummary.errorCount).toBe(0);
    expect(Object.hasOwn(resumed.result, 'rawError')).toBe(false);
  });

  it.each([FlowNodeTypeEnum.userSelect, FlowNodeTypeEnum.formInput])(
    '%s forwards empty dynamic-option failures through its catch branch',
    async (type) => {
      const source = graphNode({
        id: 'source',
        type: FlowNodeTypeEnum.toolParams,
        params: { options: [] },
        outputs: ['options'],
        isEntry: true
      });
      const form = graphNode({
        id: 'form',
        type,
        catchError: true,
        outputs: [NodeOutputKeyEnum.errorText],
        ...(type === FlowNodeTypeEnum.userSelect
          ? {
              inputs: [
                graphReference({
                  key: NodeInputKeyEnum.userSelectOptions,
                  from: [['source', 'options']]
                })
              ]
            }
          : {
              params: {
                userInputForms: [
                  {
                    key: 'choice',
                    label: 'choice',
                    type: FlowNodeInputTypeEnum.select,
                    valueType: 'string',
                    value: '',
                    required: true,
                    listInputType: FlowNodeInputTypeEnum.reference,
                    listReference: [['source', 'options']]
                  }
                ]
              }
            })
      });
      const target = graphNode({
        id: 'target',
        type: FlowNodeTypeEnum.toolParams,
        inputs: [graphReference({ key: 'message', from: ['form', NodeOutputKeyEnum.errorText] })],
        outputs: ['message']
      });
      const { result, responses } = await runGraph({
        nodes: [source, form, target],
        edges: [
          graphEdge({ source: 'source', target: 'form' }),
          graphEdge({ source: 'form', target: 'target', error: true })
        ]
      });
      expect(graphValues(target).message).toBe(
        type === FlowNodeTypeEnum.userSelect
          ? 'workflow:user_select_no_available_options'
          : 'workflow:form_input_no_available_options'
      );
      expect(result.workflowInteractiveResponse).toBeUndefined();
      expect(result.workflowRuntimeSummary.errorCount).toBe(0);
      expect(responses.map((response) => response.nodeId)).toContain('target');
    }
  );
});
