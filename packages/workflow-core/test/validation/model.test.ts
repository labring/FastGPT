import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { WorkflowModelCheckData } from '@fastgpt/global/core/workflow/model/type';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { describe, expect, it } from 'vitest';
import { createWorkflowDocument } from '../../src/domain/document';
import { checkWorkflowModels } from '../../src/validation/model';

describe('checkWorkflowModels', () => {
  const modelData: WorkflowModelCheckData = {
    references: [
      { modelId: 'llm-id', type: ModelTypeEnum.llm, legacyModel: 'gpt-4o' },
      { modelId: 'team-llm-id', type: ModelTypeEnum.llm },
      { modelId: 'rerank-id', type: ModelTypeEnum.rerank, legacyModel: 'rerank' },
      { modelId: 'tts-id', type: ModelTypeEnum.tts, legacyModel: 'tts' }
    ],
    defaultModelIds: { [ModelTypeEnum.llm]: 'llm-id', [ModelTypeEnum.tts]: 'tts-id' }
  };
  const makeInput = (
    key: string,
    overrides: Partial<FlowNodeInputItemType> = {}
  ): FlowNodeInputItemType => ({
    key,
    label: key,
    renderTypeList: [FlowNodeInputTypeEnum.hidden],
    ...overrides
  });
  const makeDocument = (
    inputs: FlowNodeInputItemType[],
    flowNodeType = FlowNodeTypeEnum.chatNode
  ) =>
    createWorkflowDocument({
      nodes: [{ nodeId: 'node', name: '', flowNodeType, inputs, outputs: [] }]
    });
  const check = (document: ReturnType<typeof makeDocument>) =>
    checkWorkflowModels({ document, modelData, templates: moduleTemplatesFlat });

  it.each([
    [NodeInputKeyEnum.aiModelId, { value: 'llm-id' }],
    [NodeInputKeyEnum.aiModelId, { defaultValue: 'llm-id' }],
    [NodeInputKeyEnum.aiModelId, { value: 'team-llm-id' }],
    [NodeInputKeyEnum.aiModel, { value: 'gpt-4o' }],
    [NodeInputKeyEnum.aiModel, { defaultValue: 'gpt-4o' }]
  ])('accepts available model references: %s %j', (key, overrides) => {
    expect(check(makeDocument([makeInput(key, overrides)]))).toEqual([]);
  });

  it.each(['missing-id', 'rerank-id', 'gpt-4o', 'team-model-name'])(
    'rejects unavailable or wrong-type stable IDs without repairing from legacy: %s',
    (value) => {
      expect(
        check(
          makeDocument([
            makeInput(NodeInputKeyEnum.aiModelId, { value }),
            makeInput(NodeInputKeyEnum.aiModel, { value: 'gpt-4o' })
          ])
        )
      ).toEqual([
        {
          code: WorkflowDiagnosticCodeEnum.modelUnavailable,
          severity: 'error',
          nodeId: 'node',
          inputKey: NodeInputKeyEnum.aiModelId,
          path: ['nodes', 0, 'inputs', 0, 'value'],
          params: { type: ModelTypeEnum.llm, model: value, slotKey: NodeInputKeyEnum.aiModelId }
        }
      ]);
    }
  );

  it.each([undefined, null, '', '   '])('requires non-optional empty models (%s)', (value) => {
    expect(check(makeDocument([makeInput(NodeInputKeyEnum.aiModelId, { value })]))).toEqual([
      expect.objectContaining({
        code: WorkflowDiagnosticCodeEnum.modelRequired,
        inputKey: NodeInputKeyEnum.aiModelId
      })
    ]);
  });

  it('uses injected templates to identify deleted slots without materializing model defaults', () => {
    const document = makeDocument([]);
    expect(check(document)).toEqual([
      expect.objectContaining({
        code: WorkflowDiagnosticCodeEnum.modelRequired,
        inputKey: NodeInputKeyEnum.aiModelId
      })
    ]);
    expect(checkWorkflowModels({ document, modelData, templates: [] })).toEqual([]);
    expect(document.nodes[0].inputs).toEqual([]);
  });

  it('checks every duplicate model slot and preserves the original document and directory', () => {
    const document = makeDocument([
      makeInput(NodeInputKeyEnum.aiModelId, { value: 'missing-first' }),
      makeInput(NodeInputKeyEnum.aiModelId, { value: 'llm-id' }),
      makeInput(NodeInputKeyEnum.aiModelId, { value: 'missing-last' })
    ]);
    const before = JSON.stringify({ document, modelData, templates: moduleTemplatesFlat });
    expect(check(document).map((item) => item.params?.model)).toEqual([
      'missing-first',
      'missing-last'
    ]);
    expect(JSON.stringify({ document, modelData, templates: moduleTemplatesFlat })).toBe(before);
  });

  it.each([
    { value: '{{start.model}}' },
    { value: ['start', 'model'], renderTypeList: [FlowNodeInputTypeEnum.reference] }
  ])('defers dynamic system models to execution: %j', (overrides) => {
    expect(check(makeDocument([makeInput(NodeInputKeyEnum.aiModelId, overrides)]))).toEqual([]);
  });

  it.each([
    { value: undefined, required: false },
    { value: [], required: false },
    { value: undefined, required: true }
  ])(
    'requires an empty dynamic system model after reference normalization: %j',
    ({ value, required }) => {
      const document = makeDocument([
        makeInput(NodeInputKeyEnum.aiModelId, {
          selectedType: FlowNodeInputTypeEnum.reference,
          renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel, FlowNodeInputTypeEnum.reference],
          value,
          required
        })
      ]);
      expect(check(document)).toEqual([
        expect.objectContaining({ code: WorkflowDiagnosticCodeEnum.modelRequired })
      ]);
    }
  );

  it.each([
    { defaultValue: 'gpt-4o', expected: [] },
    { value: 'llm-id', expected: [] },
    { value: '', expected: [] },
    { value: '', required: true, expected: [WorkflowDiagnosticCodeEnum.modelRequired] },
    { value: 'missing-id', expected: [WorkflowDiagnosticCodeEnum.modelUnavailable] },
    { value: '{{start.model}}', expected: [] },
    { value: ['start', 'model'], selectedType: FlowNodeInputTypeEnum.reference, expected: [] }
  ])('checks custom tool selectors and legacy defaults: %j', ({ expected, ...overrides }) => {
    const document = makeDocument(
      [
        makeInput('customModel', {
          renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel, FlowNodeInputTypeEnum.reference],
          ...overrides
        }),
        makeInput(NodeInputKeyEnum.aiModel, { value: 'ordinary tool parameter' })
      ],
      FlowNodeTypeEnum.pluginInput
    );
    expect(check(document).map((item) => item.code)).toEqual(expected);
  });

  it.each([FlowNodeTypeEnum.workflowStart, FlowNodeTypeEnum.pluginInput, FlowNodeTypeEnum.comment])(
    'skips system model rules on %s',
    (flowNodeType) => {
      expect(
        check(
          makeDocument([makeInput(NodeInputKeyEnum.aiModelId, { value: 'missing' })], flowNodeType)
        )
      ).toEqual([]);
    }
  );

  it.each([
    { flag: false, expected: [] },
    { flag: undefined, expected: [] },
    { flag: true, expected: [WorkflowDiagnosticCodeEnum.modelUnavailable] },
    { flag: true, datasets: [], expected: [] },
    {
      flag: true,
      datasets: [{ datasetId: 'dataset' }],
      expected: [WorkflowDiagnosticCodeEnum.modelUnavailable]
    },
    {
      flag: true,
      datasets: ['start', 'datasets'],
      reference: true,
      expected: [WorkflowDiagnosticCodeEnum.modelUnavailable]
    }
  ])('only checks enabled dataset model features with selected datasets: %j', (item) => {
    const inputs = [
      makeInput(NodeInputKeyEnum.datasetSearchUsingReRank, {
        value: item.flag,
        defaultValue: true
      }),
      makeInput(NodeInputKeyEnum.datasetSearchRerankModelId, { value: 'missing-rerank' })
    ];
    if ('datasets' in item) {
      inputs.push(
        makeInput(NodeInputKeyEnum.datasetSelectList, {
          value: item.datasets,
          renderTypeList: [
            item.reference ? FlowNodeInputTypeEnum.reference : FlowNodeInputTypeEnum.selectDataset
          ]
        })
      );
    }
    expect(
      check(makeDocument(inputs, FlowNodeTypeEnum.datasetSearchNode)).map((issue) => issue.code)
    ).toEqual(item.expected);
  });

  it('keeps Web defaults for auxiliary slots but requires the enabled deep-search model', () => {
    const inputs = [
      makeInput(NodeInputKeyEnum.datasetSearchUsingReRank, { value: true }),
      makeInput(NodeInputKeyEnum.datasetSearchUsingExtensionQuery, { value: true }),
      makeInput(NodeInputKeyEnum.datasetSearchExtensionModelId, { defaultValue: 'stale-default' }),
      makeInput(NodeInputKeyEnum.datasetSearchExtensionModel, { value: 'stale-legacy' }),
      makeInput(NodeInputKeyEnum.datasetDeepSearch, { value: true }),
      makeInput(NodeInputKeyEnum.datasetDeepSearchModelId)
    ];
    expect(check(makeDocument(inputs, FlowNodeTypeEnum.datasetSearchNode))).toEqual([
      expect.objectContaining({
        code: WorkflowDiagnosticCodeEnum.modelRequired,
        inputKey: NodeInputKeyEnum.datasetDeepSearchModelId
      })
    ]);
    inputs.find((item) => item.key === NodeInputKeyEnum.datasetDeepSearchModelId)!.value = 'llm-id';
    expect(check(makeDocument(inputs, FlowNodeTypeEnum.datasetSearchNode))).toEqual([]);
    inputs.find((item) => item.key === NodeInputKeyEnum.datasetSearchExtensionModelId)!.value =
      'missing';
    expect(check(makeDocument(inputs, FlowNodeTypeEnum.datasetSearchNode))).toEqual([
      expect.objectContaining({
        code: WorkflowDiagnosticCodeEnum.modelUnavailable,
        inputKey: NodeInputKeyEnum.datasetSearchExtensionModelId
      })
    ]);
  });

  it.each([undefined, [], {}, { datasets: [] }, { datasets: [{ datasetId: 'dataset' }] }])(
    'checks nested Agent dataset models only when enabled with datasets: %j',
    (params) => {
      const datasetParams =
        params && !Array.isArray(params)
          ? {
              ...params,
              [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]: true,
              [NodeInputKeyEnum.datasetSearchExtensionModelId]: 'missing-extension',
              [NodeInputKeyEnum.datasetSearchUsingReRank]: true,
              [NodeInputKeyEnum.datasetSearchRerankModelId]: 'missing-rerank'
            }
          : params;
      const document = makeDocument(
        [
          makeInput(NodeInputKeyEnum.aiModelId, { value: 'llm-id' }),
          makeInput(NodeInputKeyEnum.datasetParams, { value: datasetParams })
        ],
        FlowNodeTypeEnum.agent
      );
      const issues = check(document);
      if (
        params &&
        'datasets' in params &&
        Array.isArray(params.datasets) &&
        params.datasets.length > 0
      ) {
        expect(issues.map((item) => [item.inputKey, item.path])).toEqual([
          [
            NodeInputKeyEnum.datasetParams,
            ['nodes', 0, 'inputs', 1, 'value', NodeInputKeyEnum.datasetSearchRerankModelId]
          ],
          [
            NodeInputKeyEnum.datasetParams,
            ['nodes', 0, 'inputs', 1, 'value', NodeInputKeyEnum.datasetSearchExtensionModelId]
          ]
        ]);
      } else {
        expect(issues).toEqual([]);
      }
    }
  );

  it('checks chat features by model type, explicit defaults and strict stable-ID precedence', () => {
    const document = createWorkflowDocument({
      chatConfig: { questionGuide: { open: true }, ttsConfig: { type: 'model' } }
    });
    expect(check(document)).toEqual([]);
    expect(
      checkWorkflowModels({
        document,
        templates: moduleTemplatesFlat,
        modelData: { ...modelData, defaultModelIds: {} }
      })
    ).toEqual([
      expect.objectContaining({
        code: WorkflowDiagnosticCodeEnum.modelRequired,
        path: ['chatConfig', 'questionGuide']
      }),
      expect.objectContaining({
        code: WorkflowDiagnosticCodeEnum.modelRequired,
        path: ['chatConfig', 'ttsConfig']
      })
    ]);
    document.chatConfig.questionGuide = { open: true, modelId: 'missing', model: 'gpt-4o' };
    document.chatConfig.ttsConfig = { type: 'model', modelId: 'llm-id' };
    expect(check(document).map((item) => item.code)).toEqual([
      WorkflowDiagnosticCodeEnum.modelUnavailable,
      WorkflowDiagnosticCodeEnum.modelUnavailable
    ]);
    document.chatConfig.questionGuide = { open: true, model: 'gpt-4o' };
    document.chatConfig.ttsConfig = { type: 'model', modelId: 'tts-id' };
    expect(check(document)).toEqual([]);
    document.chatConfig.questionGuide = { open: false, modelId: 'missing' };
    document.chatConfig.ttsConfig = { type: 'web', modelId: 'missing' };
    expect(check(document)).toEqual([]);
    document.chatConfig.questionGuide = { open: true, modelId: '{{start.model}}' };
    expect(check(document)).toEqual([]);
  });
});
