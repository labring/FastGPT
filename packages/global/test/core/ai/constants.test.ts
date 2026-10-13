import { describe, expect, it } from 'vitest';
import { defaultSTTModels, ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

describe('defaultSTTModels', () => {
  it('uses the supported OpenAI speech-to-text model by default', () => {
    expect(defaultSTTModels).toEqual([
      expect.objectContaining({
        type: ModelTypeEnum.stt,
        provider: 'OpenAI',
        model: 'gpt-transcribe',
        name: 'gpt-transcribe',
        scope: ModelScopeEnum.system
      })
    ]);
  });
});
