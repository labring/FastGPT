import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postSystemModel: vi.fn(),
  putReplaceSystemModelChannels: vi.fn(),
  putSystemModel: vi.fn()
}));

vi.mock('@/web/core/ai/config', () => mocks);

import {
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

  it('uses only channel replacement and PUT update for an existing model', async () => {
    const modelId = '68ad85a7463006c963799a05';

    await submitUpdatedSystemModel({ modelId, modelData, channelIds: [2, 7] });

    expect(mocks.postSystemModel).not.toHaveBeenCalled();
    expect(mocks.putReplaceSystemModelChannels).toHaveBeenCalledWith({
      modelId,
      channelIds: [2, 7]
    });
    expect(mocks.putSystemModel).toHaveBeenCalledWith({
      modelId,
      modelData: expect.not.objectContaining({ model: expect.anything() })
    });
    expect(mocks.putReplaceSystemModelChannels.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.putSystemModel.mock.invocationCallOrder[0]
    );
  });
});
