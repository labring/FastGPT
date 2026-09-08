import { describe, expect, it } from 'vitest';
import { ModelTypeEnum, ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { TTSTypeEnum } from '@/web/core/app/constants';
import { getTtsInitialization } from '@/components/core/app/TTSSelect.utils';
import type { MyTTSModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';

const models: MyTTSModelItemType[] = [
  {
    modelId: 'tts',
    model: 'tts-name',
    name: 'TTS',
    isActive: true,
    isCustom: false,
    provider: 'OpenAI',
    type: ModelTypeEnum.tts,
    scope: ModelScopeEnum.system,
    config: {
      voices: [
        { label: 'First', value: 'first' },
        { label: 'Second', value: 'second' }
      ]
    }
  }
];
describe('getTtsInitialization', () => {
  it('initializes empty model selection and its voice, without changing explicit off/browser modes', () => {
    expect(getTtsInitialization({ models })).toMatchObject({
      type: TTSTypeEnum.model,
      modelId: 'tts',
      voice: 'first'
    });
    expect(
      getTtsInitialization({
        value: { type: TTSTypeEnum.model, modelId: '', voice: 'second' },
        models
      })
    ).toMatchObject({ modelId: 'tts', voice: 'second' });
    for (const type of [TTSTypeEnum.none, TTSTypeEnum.web]) {
      expect(getTtsInitialization({ value: { type }, models })).toBeUndefined();
    }
  });
  it('preserves configured or unavailable models and never invents an ID', () => {
    expect(
      getTtsInitialization({ value: { type: TTSTypeEnum.model, modelId: 'missing' }, models })
    ).toBeUndefined();
    expect(
      getTtsInitialization({ value: { type: TTSTypeEnum.model, modelId: 'tts' }, models })
    ).toBeUndefined();
    expect(
      getTtsInitialization({ value: { type: TTSTypeEnum.model }, models: [] })
    ).toBeUndefined();
    expect(
      getTtsInitialization({
        value: { type: TTSTypeEnum.model },
        models: [{ ...models[0], isActive: false }]
      })
    ).toBeUndefined();
  });
  it('writes legacy normalization rather than displaying an unstored replacement', () => {
    expect(
      getTtsInitialization({ value: { type: TTSTypeEnum.model, model: 'tts-name' }, models })
    ).toEqual({ type: TTSTypeEnum.model, model: undefined, modelId: 'tts', voice: 'first' });
  });
  it('supports models without a voice list', () => {
    expect(
      getTtsInitialization({ models: [{ ...models[0], config: { voices: [] } }] })
    ).toMatchObject({ modelId: 'tts', voice: undefined });
  });
});
