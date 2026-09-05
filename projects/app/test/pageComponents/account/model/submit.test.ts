import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postSystemModel: vi.fn(),
  putReplaceSystemModelChannels: vi.fn(),
  putSystemModel: vi.fn()
}));

vi.mock('@/web/core/ai/config', () => mocks);

import {
  prepareDraftSystemModelForTest,
  submitCreatedSystemModel,
  submitUpdatedSystemModel
} from '@/pageComponents/account/model/submit';

const modelData = {
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'controller-test-model',
  name: 'Controller test model',
  scope: ModelScopeEnum.system,
  isActive: false,
  config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
};

describe('admin model submit controllers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.postSystemModel.mockResolvedValue({ modelId: '68ad85a7463006c963799a05' });
    mocks.putReplaceSystemModelChannels.mockResolvedValue(undefined);
    mocks.putSystemModel.mockResolvedValue(undefined);
  });

  it('uses only POST create for a new model and sends no modelId', async () => {
    await submitCreatedSystemModel({ modelData, channelIds: [] });

    expect(mocks.postSystemModel).toHaveBeenCalledWith({ modelData, channelIds: [] });
    expect(mocks.putSystemModel).not.toHaveBeenCalled();
    expect(mocks.putReplaceSystemModelChannels).not.toHaveBeenCalled();
    expect(mocks.postSystemModel.mock.calls[0]?.[0].modelData).not.toHaveProperty('modelId');
  });

  it('preserves the complete current draft when preparing a channel test', () => {
    const draft = {
      type: ModelTypeEnum.tts,
      provider: 'Custom provider',
      model: '  draft-tts  ',
      name: 'Draft alias',
      scope: ModelScopeEnum.system,
      isActive: false,
      requestUrl: 'https://draft.example.com/audio',
      requestAuth: 'draft-secret',
      config: { voices: [{ label: 'Alloy', value: 'alloy' }] }
    } as const;

    expect(prepareDraftSystemModelForTest(draft)).toEqual({
      ...draft,
      model: 'draft-tts'
    });
  });

  it('submits config and channels together without a separate external mutation', async () => {
    const modelId = '68ad85a7463006c963799a05';

    await submitUpdatedSystemModel({ modelId, modelData, channelIds: [2, 7] });

    expect(mocks.postSystemModel).not.toHaveBeenCalled();
    expect(mocks.putReplaceSystemModelChannels).not.toHaveBeenCalled();
    expect(mocks.putSystemModel).toHaveBeenCalledWith({
      modelId,
      channelIds: [2, 7],
      modelData: expect.not.objectContaining({ model: expect.anything() })
    });
  });

  it('rejects an invalid edited alias before sending any mutation', async () => {
    await expect(
      submitUpdatedSystemModel({
        modelId: '68ad85a7463006c963799a05',
        modelData: { ...modelData, name: '   ' },
        channelIds: [2]
      })
    ).rejects.toBeDefined();
    expect(mocks.putSystemModel).not.toHaveBeenCalled();
    expect(mocks.putReplaceSystemModelChannels).not.toHaveBeenCalled();
  });
});
