import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

const mocks = vi.hoisted(() => ({
  authChatTargetCrud: vi.fn(),
  authTargetModelResource: vi.fn(),
  getTTSModelData: vi.fn(),
  text2Speech: vi.fn(),
  jsonRes: vi.fn()
}));

vi.mock('@/service/support/permission/auth/chat', () => ({
  authChatTargetCrud: mocks.authChatTargetCrud
}));
vi.mock('@fastgpt/service/support/permission/app/resource', () => ({
  authTargetModelResource: mocks.authTargetModelResource
}));
vi.mock('@fastgpt/service/core/ai/model', () => ({
  getModelHandle: async () => ({ getTTSModelData: mocks.getTTSModelData })
}));
vi.mock('@fastgpt/service/core/ai/audio/speech', () => ({ text2Speech: mocks.text2Speech }));
vi.mock('@fastgpt/service/common/response', () => ({ jsonRes: mocks.jsonRes }));
vi.mock('@/service/support/wallet/usage/push', () => ({ pushAudioSpeechUsage: vi.fn() }));

import handler from '@/pages/api/core/chat/record/getSpeech';

describe('getSpeech model resource permission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authChatTargetCrud.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      authType: 'token',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '65f000000000000000000071'
    });
    mocks.authTargetModelResource.mockRejectedValue(ERROR_ENUM.unAuthModel);
    mocks.getTTSModelData.mockReturnValue({
      modelId: 'model-id',
      config: { voices: [{ label: 'Voice', value: 'voice-id' }] }
    });
  });

  it('rejects a model that is not declared by the published App version', async () => {
    await handler(
      {
        body: {
          appId: '65f000000000000000000071',
          ttsConfig: { type: 'model', modelId: 'model-id', voice: 'voice-id' },
          input: 'hello'
        }
      } as any,
      { end: vi.fn() } as any
    );

    expect(mocks.jsonRes).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ error: ERROR_ENUM.unAuthModel })
    );
    expect(mocks.text2Speech).not.toHaveBeenCalled();
  });
});
