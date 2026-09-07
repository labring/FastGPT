import { describe, expect, it } from 'vitest';
import { filterModelMultimodalSettings } from '@/components/core/ai/SettingLLMModel/utils';

describe('filterModelMultimodalSettings', () => {
  it('clears unsupported options without mutating the original settings', () => {
    const settings = {
      modelId: 'model-id',
      aiChatVision: true,
      aiChatAudio: true,
      aiChatVideo: true,
      aiChatExtractFiles: true
    };
    expect(filterModelMultimodalSettings({ settings, support: { vision: true } })).toEqual({
      ...settings,
      aiChatAudio: false,
      aiChatVideo: false
    });
    expect(settings.aiChatAudio).toBe(true);
    expect(settings.aiChatVideo).toBe(true);
  });

  it('does not restore cleared options when switching back to a capable model', () => {
    const settings = filterModelMultimodalSettings({
      settings: { aiChatVision: true, aiChatAudio: true, aiChatVideo: true },
      support: { vision: true }
    });
    expect(
      filterModelMultimodalSettings({
        settings,
        support: { vision: true, audio: true, video: true }
      })
    ).toEqual(settings);
  });

  it.each([undefined, false])('does not enable unselected options (%s)', (value) => {
    expect(
      filterModelMultimodalSettings({
        settings: {
          aiChatVision: value,
          aiChatAudio: value,
          aiChatVideo: value,
          aiChatExtractFiles: false
        },
        support: { vision: true, audio: true, video: true }
      })
    ).toEqual({
      aiChatVision: false,
      aiChatAudio: false,
      aiChatVideo: false,
      aiChatExtractFiles: false
    });
  });

  it('clears all media options for a text-only model but preserves URL extraction', () => {
    expect(
      filterModelMultimodalSettings({
        settings: {
          aiChatVision: true,
          aiChatAudio: true,
          aiChatVideo: true,
          aiChatExtractFiles: true
        },
        support: { vision: false, audio: false, video: false }
      })
    ).toEqual({
      aiChatVision: false,
      aiChatAudio: false,
      aiChatVideo: false,
      aiChatExtractFiles: true
    });
  });
});
