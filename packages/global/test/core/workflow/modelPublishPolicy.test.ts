import { describe, expect, it } from 'vitest';
import { formatModels } from '../../../core/workflow/utils';
import { ModelTypeEnum } from '../../../core/ai/constants';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../../core/workflow/node/constant';
import { NodeInputKeyEnum } from '../../../core/workflow/constants';

const models = [
  { modelId: 'llm-first', model: 'llm-first', type: ModelTypeEnum.llm },
  { modelId: 'llm-default', model: 'llm-default', type: ModelTypeEnum.llm },
  { modelId: 'rerank-default', model: 'rerank-default', type: ModelTypeEnum.rerank },
  { modelId: 'tts-default', model: 'tts-default', type: ModelTypeEnum.tts }
];
const defaultModelIds = { llm: 'llm-default', rerank: 'rerank-default', tts: 'tts-default' };

describe.each(['rerank', 'query', 'guide', 'tts'] as const)(
  'formatModels publishing %s',
  (feature) => {
    const expectedDefault =
      feature === 'rerank'
        ? defaultModelIds.rerank
        : feature === 'tts'
          ? defaultModelIds.tts
          : defaultModelIds.llm;
    const prepare = (enabled: boolean, value?: unknown) => {
      const params: Parameters<typeof formatModels>[0] = {
        nodes: [],
        chatConfig: {},
        models,
        defaultModelIds,
        modelReferencePolicy: 'validate'
      };
      if (feature === 'guide')
        params.chatConfig = { questionGuide: { open: enabled, modelId: value as string } };
      else if (feature === 'tts')
        params.chatConfig = {
          ttsConfig: { type: enabled ? 'model' : 'none', modelId: value as string }
        };
      else {
        params.nodes = [
          {
            nodeId: 'search',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            name: 'Search',
            outputs: [],
            inputs: [
              {
                key:
                  feature === 'rerank'
                    ? NodeInputKeyEnum.datasetSearchUsingReRank
                    : NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
                label: 'Enabled',
                value: enabled,
                renderTypeList: [FlowNodeInputTypeEnum.hidden]
              },
              {
                key:
                  feature === 'rerank'
                    ? NodeInputKeyEnum.datasetSearchRerankModelId
                    : NodeInputKeyEnum.datasetSearchExtensionModelId,
                label: 'Model',
                value,
                renderTypeList: [FlowNodeInputTypeEnum.hidden]
              }
            ]
          }
        ];
      }
      const read = () =>
        feature === 'guide'
          ? params.chatConfig?.questionGuide?.modelId
          : feature === 'tts'
            ? params.chatConfig?.ttsConfig?.modelId
            : params.nodes?.[0].inputs[1]?.value;
      return { params, read };
    };

    it.each([undefined, null, '', '   '])(
      'materializes a usable default for empty enabled values (%s)',
      (value) => {
        const { params, read } = prepare(true, value);
        formatModels(params);
        expect(read()).toBe(expectedDefault);
      }
    );
    it('preserves a valid explicitly configured model', () => {
      const selected = feature === 'query' || feature === 'guide' ? 'llm-first' : expectedDefault;
      const { params, read } = prepare(true, selected);
      formatModels(params);
      expect(read()).toBe(selected);
    });
    it('rejects an existing model of the wrong type instead of using a default', () => {
      const wrongTypeId =
        feature === 'query' || feature === 'guide' ? 'rerank-default' : 'llm-default';
      const { params } = prepare(true, wrongTypeId);
      expect(() => formatModels(params)).toThrow('模型不可用');
    });
    it.each(['deleted-id', 'disabled-id', 'wrong-type-id'])(
      'rejects a nonempty unavailable model (%s)',
      (value) => {
        const { params } = prepare(true, value);
        expect(() => formatModels(params)).toThrow('模型不可用');
      }
    );
    it.each([undefined, '', 'deleted-id'])(
      'does not check disabled features or replace their values (%s)',
      (value) => {
        const { params } = prepare(false, value);
        params.models = [];
        const before = structuredClone({ nodes: params.nodes, chatConfig: params.chatConfig });
        expect(() => formatModels(params)).not.toThrow();
        expect({ nodes: params.nodes, chatConfig: params.chatConfig }).toEqual(before);
      }
    );
    it('fails when an enabled feature has neither a selected model nor a usable default', () => {
      const { params } = prepare(true);
      params.models = [];
      expect(() => formatModels(params)).toThrow('未配置');
    });
  }
);

describe('formatModels missing optional model slots', () => {
  it('adds missing model inputs and nested Agent defaults', () => {
    const nodes: NonNullable<Parameters<typeof formatModels>[0]['nodes']> = [
      {
        nodeId: 'search',
        name: 'Search',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        outputs: [],
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSearchUsingReRank,
            label: '',
            value: true,
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          },
          {
            key: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
            label: '',
            value: true,
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          }
        ]
      },
      {
        nodeId: 'agent',
        name: 'Agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        outputs: [],
        inputs: [
          {
            key: NodeInputKeyEnum.datasetParams,
            label: '',
            value: { usingReRank: true, datasetSearchUsingExtensionQuery: true },
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          }
        ]
      }
    ];
    const chatConfig = { questionGuide: { open: true }, ttsConfig: { type: 'model' as const } };
    formatModels({ nodes, chatConfig, models, defaultModelIds, modelReferencePolicy: 'validate' });
    expect(nodes[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchRerankModelId,
          value: defaultModelIds.rerank
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchExtensionModelId,
          value: defaultModelIds.llm
        })
      ])
    );
    expect(nodes[1].inputs[0].value).toMatchObject({
      rerankModelId: defaultModelIds.rerank,
      datasetSearchExtensionModelId: defaultModelIds.llm
    });
    expect(chatConfig.questionGuide).toHaveProperty('modelId', defaultModelIds.llm);
    expect(chatConfig.ttsConfig).toHaveProperty('modelId', defaultModelIds.tts);
  });
});
