import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { filterSensitiveNodesData } from '@/web/core/workflow/utils';

const createInput = (key: string, value: unknown, extra: Record<string, unknown> = {}) =>
  ({
    key,
    label: key,
    renderTypeList: [FlowNodeInputTypeEnum.input],
    value,
    ...extra
  }) as any;

const createNode = (flowNodeType: FlowNodeTypeEnum, inputs: any[], nodeId = flowNodeType): any => ({
  nodeId,
  name: flowNodeType,
  flowNodeType,
  inputs,
  outputs: []
});

describe('filterSensitiveNodesData', () => {
  it('clears agent tools, skills and datasets while keeping other dataset params', () => {
    const nodes = [
      createNode(FlowNodeTypeEnum.agent, [
        createInput(NodeInputKeyEnum.selectedTools, [{ id: 'tool-1', name: 'Tool' }]),
        createInput(NodeInputKeyEnum.skills, [{ skillId: 'skill-1', name: 'Skill' }]),
        createInput(NodeInputKeyEnum.datasetSelectList, [
          { datasetId: 'dataset-1', name: 'Dataset' }
        ]),
        createInput(NodeInputKeyEnum.datasetParams, {
          datasets: [{ datasetId: 'dataset-2', name: 'Dataset 2' }],
          similarity: 0.6,
          limit: 4000,
          searchMode: 'embedding'
        })
      ])
    ];

    const result = filterSensitiveNodesData(nodes);
    const inputs = new Map(result[0].inputs.map((input) => [input.key, input]));

    expect(inputs.get(NodeInputKeyEnum.selectedTools)?.value).toEqual([]);
    expect(inputs.get(NodeInputKeyEnum.skills)?.value).toEqual([]);
    expect(inputs.get(NodeInputKeyEnum.datasetSelectList)?.value).toEqual([]);
    expect(inputs.get(NodeInputKeyEnum.datasetParams)?.value).toEqual({
      datasets: [],
      similarity: 0.6,
      limit: 4000,
      searchMode: 'embedding'
    });
  });

  it('removes only the dataset search token from the agent prompt', () => {
    const prompt = 'Use {{@dataset_search@}} and {{@mcp-app/tool@}}; retry {{@dataset_search@}}.';
    const nodes = [
      createNode(FlowNodeTypeEnum.agent, [createInput(NodeInputKeyEnum.aiSystemPrompt, prompt)])
    ];

    const result = filterSensitiveNodesData(nodes);

    expect(result[0].inputs[0].value).toBe('Use  and {{@mcp-app/tool@}}; retry .');
  });

  it('keeps reference inputs untouched', () => {
    const referenceValue = ['source-node', 'datasets'];
    const nodes = [
      createNode(FlowNodeTypeEnum.agent, [
        createInput(NodeInputKeyEnum.datasetSelectList, referenceValue, {
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference
        }),
        createInput(NodeInputKeyEnum.aiSystemPrompt, referenceValue, {
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference
        })
      ])
    ];

    const result = filterSensitiveNodesData(nodes);

    expect(result[0].inputs[0].value).toEqual(referenceValue);
    expect(result[0].inputs[1].value).toEqual(referenceValue);
  });

  it('keeps existing dataset search node and system secret behavior', () => {
    const nodes = [
      createNode(FlowNodeTypeEnum.datasetSearchNode, [
        createInput(NodeInputKeyEnum.datasetSelectList, [{ datasetId: 'dataset-1' }])
      ]),
      createNode(FlowNodeTypeEnum.chatNode, [
        createInput(NodeInputKeyEnum.systemInputConfig, { type: 'manual', value: 'secret' })
      ])
    ];

    const result = filterSensitiveNodesData(nodes);

    expect(result[0].inputs[0].value).toEqual([]);
    expect(result[1].inputs[0].value).toBeUndefined();
  });

  it('does not change non-agent node resource inputs', () => {
    const nodes = [
      createNode(FlowNodeTypeEnum.chatNode, [
        createInput(NodeInputKeyEnum.datasetSelectList, [{ datasetId: 'dataset-1' }]),
        createInput(NodeInputKeyEnum.datasetParams, {
          datasets: [{ datasetId: 'dataset-2' }],
          similarity: 0.4
        })
      ])
    ];

    const result = filterSensitiveNodesData(nodes);

    expect(result[0].inputs[0].value).toEqual([{ datasetId: 'dataset-1' }]);
    expect(result[0].inputs[1].value).toEqual({
      datasets: [{ datasetId: 'dataset-2' }],
      similarity: 0.4
    });
  });

  it('does not mutate the original nodes', () => {
    const nodes = [
      createNode(FlowNodeTypeEnum.agent, [
        createInput(NodeInputKeyEnum.skills, [{ skillId: 'skill-1' }])
      ])
    ];

    const result = filterSensitiveNodesData(nodes);

    expect(result).not.toBe(nodes);
    expect(nodes[0].inputs[0].value).toEqual([{ skillId: 'skill-1' }]);
  });
});
