import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { MyLLMModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import {
  getModelDefault,
  getModelDetail,
  getModelList,
  peekModelCatalog
} from '@/web/core/ai/model/modelData';
import { getModelSummary } from '@/web/core/ai/model/useModelSummary';
import { getWorkflowModelCheckData } from '@/web/core/workflow/modelData';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), summary: vi.fn(), member: 'member' }));
vi.mock('@/web/core/ai/model/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/web/core/ai/model/catalogApi')>();
  return {
    ...actual,
    getUserModelCatalog: mocks.catalog,
    getUserModelSummaries: mocks.summary
  };
});
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: Object.assign(vi.fn(), {
    getState: () => ({ userInfo: { team: { teamId: 'team', tmbId: mocks.member } } })
  })
}));

const makeModel = (modelId: string, vision = false): MyLLMModelItemType => ({
  modelId,
  model: `legacy-${modelId}`,
  name: modelId,
  provider: 'p',
  type: ModelTypeEnum.llm,
  scope: 'system',
  isActive: true,
  isCustom: false,
  config: { maxContext: 4096, maxResponse: 1024, quoteMaxToken: 2000, vision }
});
const models = [
  makeModel('first'),
  makeModel('system'),
  makeModel('business'),
  makeModel('vision', true)
];
const response = () => ({
  version: 'v1',
  data: { models, providers: [], defaultModelIds: { llm: 'system' } }
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', {
    length: 0,
    setItem: vi.fn(),
    getItem: () => null,
    removeItem: vi.fn(),
    key: () => null
  });
  useUserModelStore.getState().clearAllPersistedCaches();
  mocks.member = 'member';
  mocks.catalog.mockResolvedValue(response());
  mocks.summary.mockImplementation(async ({ modelIds }) => ({
    models: modelIds.map((modelId: string) => ({ modelId, status: 'deleted' }))
  }));
});

describe('getWorkflowModelCheckData', () => {
  it.each([undefined, 'missing-static-model'])(
    'excludes expressions from catalog and summary requests while retaining static ID %s',
    async (staticModelId) => {
      const data = await getWorkflowModelCheckData({
        appId: 'app-1',
        nodes: [
          {
            data: {
              id: 'agent',
              nodeId: 'agent',
              name: 'Agent',
              flowNodeType: FlowNodeTypeEnum.agent,
              inputs: [
                {
                  key: NodeInputKeyEnum.aiModelId,
                  value: '{{selectedModel}}',
                  renderTypeList: [FlowNodeInputTypeEnum.hidden]
                },
                {
                  key: NodeInputKeyEnum.datasetParams,
                  renderTypeList: [FlowNodeInputTypeEnum.hidden],
                  value: {
                    datasets: [{ datasetId: 'dataset-id' }],
                    usingReRank: true,
                    rerankModelId: '{{rerankModelId}}',
                    datasetSearchUsingExtensionQuery: true,
                    datasetSearchExtensionModelId: '{{extensionModelId}}'
                  }
                },
                ...(staticModelId
                  ? [
                      {
                        key: 'customModel',
                        value: staticModelId,
                        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
                      }
                    ]
                  : [])
              ],
              outputs: []
            }
          }
        ],
        chatConfig: {
          questionGuide: { open: true, modelId: '{{guideModelId}}' },
          ttsConfig: { type: 'model', modelId: '{{ttsModelId}}' }
        }
      });

      expect(data).toEqual({ references: [], defaultModelIds: {} });
      if (staticModelId) {
        expect(mocks.catalog).toHaveBeenCalledOnce();
        expect(mocks.summary).toHaveBeenCalledExactlyOnceWith({
          appId: 'app-1',
          modelIds: [staticModelId]
        });
      } else {
        expect(mocks.catalog).not.toHaveBeenCalled();
        expect(mocks.summary).not.toHaveBeenCalled();
      }
    }
  );
});

describe('getModelSummary', () => {
  it('does not load catalog for display, and does not request empty IDs', async () => {
    expect(await getModelSummary({ modelId: '' })).toBeUndefined();
    expect(mocks.summary).not.toHaveBeenCalled();
    expect(await getModelSummary({ modelId: 'missing' })).toEqual({
      modelId: 'missing',
      status: 'deleted'
    });
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it('prefers catalog over summary cache and requests only cache misses', async () => {
    await getModelSummary({ modelId: 'system' });
    await getModelDetail({ modelId: 'system' });
    expect(await getModelSummary({ modelId: 'system' })).toMatchObject({
      name: 'system',
      status: 'active'
    });
    expect(mocks.summary).toHaveBeenCalledTimes(1);
    await getModelSummary({ modelId: 'unavailable' });
    expect(mocks.summary).toHaveBeenCalledTimes(2);
  });
});

describe('catalog consumers', () => {
  it('deduplicates cold detail/default/list requests and reuses verified data', async () => {
    const [detail, selected, list] = await Promise.all([
      getModelDetail({ modelId: 'first', modelType: ModelTypeEnum.llm }),
      getModelDefault({ modelType: ModelTypeEnum.llm }),
      getModelList({ modelType: ModelTypeEnum.llm })
    ]);
    expect(detail?.modelId).toBe('first');
    expect(selected?.modelId).toBe('system');
    expect(list).toHaveLength(4);
    expect(mocks.catalog).toHaveBeenCalledTimes(1);
    await getModelDetail({ modelId: 'business' });
    expect(mocks.catalog).toHaveBeenCalledTimes(1);
  });

  it('does not request absent references, and never replaces an invalid ID with legacy/default', async () => {
    expect(await getModelDetail({})).toBeUndefined();
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(await getModelDetail({ modelId: 'missing', model: 'legacy-first' })).toBeUndefined();
    expect((await getModelDetail({ model: 'legacy-first' }))?.modelId).toBe('first');
    expect(await getModelDetail({ modelId: 'legacy-first' })).toBeUndefined();
    expect(
      await getModelDetail({ modelId: 'legacy-first', model: 'legacy-first' })
    ).toBeUndefined();
    expect(
      await getModelDetail({ modelId: 'first', modelType: ModelTypeEnum.tts })
    ).toBeUndefined();
  });

  it('uses business then effective default then a matching candidate', async () => {
    expect(
      (await getModelDefault({ modelType: ModelTypeEnum.llm, businessDefaultModelId: 'business' }))
        ?.modelId
    ).toBe('business');
    expect(
      (await getModelDefault({ modelType: ModelTypeEnum.llm, businessDefaultModelId: 'missing' }))
        ?.modelId
    ).toBe('system');
    expect(
      (
        await getModelDefault({
          modelType: ModelTypeEnum.llm,
          vision: true,
          businessDefaultModelId: 'business'
        })
      )?.modelId
    ).toBe('vision');
    expect(await getModelDefault({ modelType: ModelTypeEnum.tts })).toBeUndefined();
    expect(
      await getModelDefault({ modelType: ModelTypeEnum.llm, defaultKey: 'chatTitleLLM' })
    ).toBeUndefined();
  });

  it('does not fall back to a vision model when no dataset image default is configured', async () => {
    mocks.catalog.mockResolvedValueOnce({
      version: 'v2',
      data: {
        models,
        providers: [],
        defaultModelIds: {}
      }
    });

    expect(
      await getModelDefault({
        modelType: ModelTypeEnum.llm,
        defaultKey: 'datasetImageLLM',
        vision: true
      })
    ).toBeUndefined();
  });

  it('skips an unavailable cached or system default model before using the first candidate', async () => {
    const unavailableDefaults = models.map((model) =>
      model.modelId === 'business' || model.modelId === 'system'
        ? { ...model, isActive: false }
        : model
    );
    mocks.catalog.mockResolvedValueOnce({
      version: 'v2',
      data: {
        models: unavailableDefaults,
        providers: [],
        defaultModelIds: { llm: 'system' }
      }
    });

    expect(
      await getModelDefault({
        modelType: ModelTypeEnum.llm,
        businessDefaultModelId: 'business'
      })
    ).toMatchObject({ modelId: 'first' });
  });

  it('never resolves legacy model names or system default fallbacks to team models', async () => {
    const teamModel: MyLLMModelItemType = {
      ...makeModel('team-only'),
      scope: 'team' as any
    };
    mocks.catalog.mockResolvedValueOnce({
      version: 'v-team',
      data: {
        models: [teamModel],
        providers: [],
        defaultModelIds: { llm: 'team-only' }
      }
    });

    expect(await getModelDetail({ model: 'legacy-team-only' })).toBeUndefined();
    expect((await getModelDetail({ modelId: 'team-only' }))?.modelId).toBe('team-only');
    expect(await getModelDefault({ modelType: ModelTypeEnum.llm })).toBeUndefined();
    expect(
      (await getModelDefault({ modelType: ModelTypeEnum.llm, businessDefaultModelId: 'team-only' }))
        ?.modelId
    ).toBe('team-only');
  });

  it('propagates network failure and retries instead of treating it as an empty catalog', async () => {
    mocks.catalog.mockRejectedValueOnce(new Error('offline'));
    await expect(getModelDetail({ modelId: 'first' })).rejects.toThrow('offline');
    expect(peekModelCatalog()).toBeUndefined();
    expect((await getModelDetail({ modelId: 'first' }))?.modelId).toBe('first');
  });

  it('hides previous identity and rejects late member responses', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    mocks.catalog.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    const pending = getModelDetail({ modelId: 'first' });
    mocks.member = 'new-member';
    expect(peekModelCatalog()).toBeUndefined();
    resolve(response());
    await expect(pending).rejects.toThrow('identity changed');
    await getModelDetail({ modelId: 'first' });
    expect(mocks.catalog).toHaveBeenCalledTimes(2);
  });

  it('revalidates changed outlink credentials instead of sharing the old catalog', async () => {
    await getModelDetail({
      modelId: 'first',
      outLinkAuthData: { shareId: 'share', outLinkUid: 'a' }
    });
    const next = { shareId: 'share', outLinkUid: 'b' };
    expect(peekModelCatalog({ outLinkAuthData: next })).toBeUndefined();
    await getModelDetail({ modelId: 'first', outLinkAuthData: next });
    expect(mocks.catalog).toHaveBeenCalledTimes(2);
  });

  it('keeps app baseline references separate from empty chat model defaults', async () => {
    const { getWorkflowModelCheckData } = await import('@/web/core/workflow/modelData');
    const { checkWorkflowChatConfigModelIssues } = await import('@/web/core/workflow/check/check');
    const { FlowNodeInputTypeEnum, FlowNodeTypeEnum } =
      await import('@fastgpt/global/core/workflow/node/constant');
    const { NodeInputKeyEnum } = await import('@fastgpt/global/core/workflow/constants');

    mocks.catalog.mockResolvedValueOnce({
      version: 'v-empty-system',
      data: {
        models: [],
        providers: [],
        defaultModelIds: {}
      }
    });
    mocks.summary.mockResolvedValueOnce({
      models: [{ modelId: 'baseline-team-llm', status: 'active', type: ModelTypeEnum.llm }]
    });

    const chatConfig = {
      questionGuide: { open: true }
    };
    const loadedModels = await getWorkflowModelCheckData({
      appId: 'app-1',
      nodes: [
        {
          data: {
            nodeId: 'chat-node',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            name: 'Chat',
            inputs: [
              {
                key: NodeInputKeyEnum.aiModelId,
                label: 'model',
                value: 'baseline-team-llm',
                renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
              }
            ],
            outputs: []
          } as any
        }
      ],
      chatConfig
    });

    expect(loadedModels).toEqual({
      references: [{ modelId: 'baseline-team-llm', type: ModelTypeEnum.llm }],
      defaultModelIds: {}
    });
    expect(
      checkWorkflowChatConfigModelIssues({
        chatConfig,
        modelData: loadedModels
      })
    ).toEqual([expect.objectContaining({ code: 'model_required' })]);
  });
});
