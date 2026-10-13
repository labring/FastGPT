import { describe, expect, it } from 'vitest';
import { findSpeechVoice, hasModelTTSConfig } from '@/web/common/utils/voice';

const voice = (lang: string) => ({ lang });

describe('findSpeechVoice', () => {
  it('prefers an exact regional voice for each supported locale', () => {
    const voices = [voice('en-GB'), voice('en-US'), voice('zh-TW'), voice('ko-KR')];

    expect(findSpeechVoice(voices, 'en')).toEqual(voices[1]);
    expect(findSpeechVoice(voices, 'zh-Hant')).toEqual(voices[2]);
    expect(findSpeechVoice(voices, 'ko-KR')).toEqual(voices[3]);
  });

  it('falls back to the generic language voice', () => {
    const voices = [voice('en-AU'), voice('zh'), voice('ko')];

    expect(findSpeechVoice(voices, 'en-US')).toEqual(voices[0]);
    expect(findSpeechVoice(voices, 'zh-CN')).toEqual(voices[1]);
    expect(findSpeechVoice(voices, 'ko-KR')).toEqual(voices[2]);
  });

  it('returns undefined when no matching voice exists', () => {
    expect(findSpeechVoice([voice('fr-FR')], 'ko-KR')).toBeUndefined();
  });
});

describe('hasModelTTSConfig', () => {
  it('accepts canonical modelId-only TTS configuration', () => {
    expect(hasModelTTSConfig({ type: 'model', modelId: 'tts-model-id', voice: 'alloy' })).toBe(
      true
    );
  });

  it('keeps legacy model configuration compatible during migration', () => {
    expect(hasModelTTSConfig({ type: 'model', model: 'legacy-tts', voice: 'alloy' })).toBe(true);
  });

  it('rejects incomplete or non-model TTS configuration', () => {
    expect(hasModelTTSConfig({ type: 'model', voice: 'alloy' })).toBe(false);
    expect(hasModelTTSConfig({ type: 'web' })).toBe(false);
    expect(hasModelTTSConfig()).toBe(false);
  });
});
