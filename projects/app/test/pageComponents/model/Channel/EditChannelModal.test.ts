import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultChannel } from '@fastgpt/global/core/ai/model/channel';
import type { ProviderMetasResponse } from '@fastgpt/global/openapi/core/ai/model/channel/api';
import { getChannelProviders } from '@/web/core/ai/model/channel';

const mocks = vi.hoisted(() => ({
  metadata: {} as ProviderMetasResponse,
  language: 'zh-CN',
  options: [] as { label: string; value: number; icon?: string }[]
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key, i18n: { language: mocks.language } })
}));
vi.mock('@/web/core/ai/model/useModelConfig', () => ({
  useModelConfig: () => ({ models: [], getModelProvider: () => undefined, loading: false })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (request: unknown) => ({
    data: request === getChannelProviders ? mocks.metadata : undefined,
    runAsync: vi.fn(),
    loading: false
  })
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({
  default: ({ list }: { list: typeof mocks.options }) => {
    mocks.options = list;
    return null;
  }
}));
vi.mock('@fastgpt/web/components/common/MySelect/MultipleSelect', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Textarea/JsonEditor', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/String/CopyBox', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));

import EditChannelModal from '@/pageComponents/model/Channel/EditChannelModal';

describe('EditChannelModal channel metadata', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.stubGlobal('React', React);
    mocks.language = 'zh-CN';
    mocks.options = [];
    mocks.metadata = {
      1: {
        name: 'Upstream',
        displayName: { en: 'Display', 'zh-CN': '展示协议' },
        avatar: 'display.svg',
        website: 'https://provider.example.com',
        defaultBaseUrl: 'https://api.example.com',
        keyHelp: 'secret-format',
        canCreate: true
      },
      2: { name: 'Legacy', defaultBaseUrl: '', keyHelp: '', canCreate: false }
    };
  });

  const render = (channelType: 'system' | 'team') =>
    renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(EditChannelModal, {
          defaultConfig: { ...defaultChannel, type: 1 },
          channelType,
          onClose: vi.fn(),
          onSuccess: vi.fn()
        })
      )
    );

  it.each(['system', 'team'] as const)(
    'renders %s options and hints without initialization or model-config channel metadata',
    (channelType) => {
      const html = render(channelType);
      expect(mocks.options).toEqual([
        expect.objectContaining({ label: '展示协议', value: 1, icon: 'display.svg' })
      ]);
      expect(html).toContain('https://provider.example.com');
      expect(html).toContain('https://api.example.com');
      expect(html).toContain('secret-format');
    }
  );

  it('uses the protocol name when a translated name is absent and supports empty metadata', () => {
    mocks.metadata[1].displayName = undefined;
    render('team');
    expect(mocks.options[0].label).toBe('Upstream');

    mocks.metadata = {};
    const html = render('team');
    expect(mocks.options).toEqual([]);
    expect(html).toContain('https://api.openai.com/v1');
    expect(html).not.toContain('https://provider.example.com');
  });

  it('retains Plugin order independently of numeric channel IDs and appends unranked options', () => {
    mocks.metadata = {
      1: { ...mocks.metadata[1], order: 2 },
      2: { name: 'First unranked', defaultBaseUrl: '', keyHelp: '', canCreate: true },
      8: { name: 'Third', defaultBaseUrl: '', keyHelp: '', canCreate: true, order: 1 },
      23: { name: 'Second', defaultBaseUrl: '', keyHelp: '', canCreate: true, order: 0 },
      4: { name: 'Unsupported', defaultBaseUrl: '', keyHelp: '', canCreate: false, order: 0 },
      99: { name: 'Unranked', defaultBaseUrl: '', keyHelp: '', canCreate: true }
    };
    render('team');
    expect(mocks.options.map(({ value }) => value)).toEqual([23, 8, 1, 2, 99]);
    expect(mocks.metadata[23].order).toBe(0);
  });
});
