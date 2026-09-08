import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TTSTypeEnum } from '@/web/core/app/constants';
import type { AppTTSConfigType } from '@fastgpt/global/core/app/type';

const mocks = vi.hoisted(() => ({
  effects: [] as (() => void)[],
  status: 'active' as 'active' | 'disabled' | 'deleted',
  prime: vi.fn()
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (fn: () => void) => {
    mocks.effects.push(fn);
  }
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { model: string }) =>
      params?.model ? `${key}:${params.model}` : key,
    i18n: { language: 'en' }
  })
}));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  useUserModelStore: () => ({
    defaultModelIds: { tts: 'tts' },
    getModelProvider: () => ({ avatar: '' })
  })
}));
vi.mock('@/web/core/ai/model/useUserModelLists', () => ({
  useUserModelLists: () => ({
    ttsModelList: [
      {
        modelId: 'tts',
        model: 'tts-name',
        name: 'Default TTS',
        type: 'tts',
        provider: 'OpenAI',
        isActive: true,
        config: { voices: [{ label: 'First voice', value: 'first' }] }
      }
    ]
  })
}));
vi.mock('@/web/core/ai/model/useModelDetail', () => ({
  useModelDetail: ({ modelId }: { modelId?: string }) => ({
    detail: modelId ? { modelId, name: 'Default TTS', status: mocks.status } : undefined,
    loading: false,
    error: false,
    setFromCatalog: mocks.prime
  })
}));
vi.mock('@chakra-ui/react', () => {
  const Element = ({ children, color }: { children: React.ReactNode; color?: string }) =>
    React.createElement('div', { 'data-color': color }, children);
  return {
    Box: Element,
    Flex: Element,
    HStack: Element,
    Button: Element,
    useDisclosure: () => ({ isOpen: true, onOpen: vi.fn(), onClose: vi.fn() })
  };
});
vi.mock('use-context-selector', () => ({
  useContextSelector: (_: unknown, select: (value: { appId: string }) => unknown) =>
    select({ appId: 'app' })
}));
vi.mock('@/pageComponents/app/detail/context', () => ({ AppContext: {} }));
vi.mock('@/web/common/utils/voice', () => ({
  useAudioPlay: () => ({
    playAudioByText: vi.fn(),
    cancelAudio: vi.fn(),
    audioLoading: false,
    audioPlaying: false
  })
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/MySelect/MultipleRowSelect', () => ({
  default: ({ label }: { label: React.ReactNode }) => label
}));
vi.mock('@/components/core/app/AppConfigItem', () => ({
  default: ({ action }: { action: React.ReactNode }) => action,
  AppConfigItemAction: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/components/core/app/Tip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Image/MyImage', () => ({ default: () => null }));
vi.mock('@/components/Slider', () => ({ default: () => null }));
import TTSSelect from '@/components/core/app/TTSSelect';

describe('TTSSelect actual selection and display', () => {
  beforeEach(() => {
    mocks.effects = [];
    mocks.status = 'active';
    mocks.prime.mockClear();
  });
  it('writes the default selection before it can appear as the current model', () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      React.createElement(TTSSelect, { value: { type: TTSTypeEnum.model, modelId: '' }, onChange })
    );
    expect(html).toContain('common:not_model_config');
    expect(html).not.toContain('Default TTS');
    mocks.effects.forEach((effect) => effect());
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'tts', voice: 'first' })
    );
    const selected = onChange.mock.calls[0][0] as AppTTSConfigType;
    expect(
      renderToStaticMarkup(React.createElement(TTSSelect, { value: selected, onChange }))
    ).toContain('Default TTS');
  });
  it.each(['disabled', 'deleted'] as const)(
    'displays %s in red without replacing the selection',
    (status) => {
      mocks.status = status;
      const onChange = vi.fn();
      const html = renderToStaticMarkup(
        React.createElement(TTSSelect, {
          value: { type: TTSTypeEnum.model, modelId: 'missing' },
          onChange
        })
      );
      expect(html).toContain('data-color="red.500"');
      expect(html).toContain(
        status === 'disabled' ? 'common:model_disabled' : 'common:model_delisted'
      );
      mocks.effects.forEach((effect) => effect());
      expect(onChange).not.toHaveBeenCalled();
    }
  );
  it.each([TTSTypeEnum.none, TTSTypeEnum.web])('keeps an explicitly selected %s mode', (type) => {
    const onChange = vi.fn();
    renderToStaticMarkup(React.createElement(TTSSelect, { value: { type }, onChange }));
    mocks.effects.forEach((effect) => effect());
    expect(onChange).not.toHaveBeenCalled();
  });
});
