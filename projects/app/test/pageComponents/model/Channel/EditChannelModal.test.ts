import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultChannel,
  type ChannelInfoType,
  type ChatUpstreamProtocol
} from '@fastgpt/global/core/ai/model/channel';
import type { ProviderMetasResponse } from '@fastgpt/global/openapi/core/ai/model/channel/api';
import { getChannelProviders, postCreateChannel, putChannel } from '@/web/core/ai/model/channel';

const mocks = vi.hoisted(() => ({
  metadata: {} as ProviderMetasResponse,
  language: 'zh-CN',
  options: [] as { label: string; value: number; icon?: string }[],
  protocol: undefined as
    | undefined
    | {
        value: ChatUpstreamProtocol;
        list: { label: string; value: ChatUpstreamProtocol }[];
        onChange: (value: ChatUpstreamProtocol) => void;
      },
  submit: async () => {}
}));
vi.mock('@/web/core/ai/model/channel', () => ({
  getChannelProviders: vi.fn(),
  postCreateChannel: vi.fn().mockResolvedValue({ id: 12 }),
  putChannel: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key, i18n: { language: mocks.language } })
}));
vi.mock('@/web/core/ai/model/useModelConfig', () => ({
  useModelConfig: () => ({ models: [], getModelProvider: () => undefined, loading: false })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (request: (...args: any[]) => Promise<unknown>) => ({
    data: request === getChannelProviders ? mocks.metadata : undefined,
    runAsync: request === getChannelProviders ? vi.fn() : request,
    loading: false
  })
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({
    children,
    footer
  }: {
    children: React.ReactNode;
    footer: React.ReactElement<{
      children: React.ReactElement<{ onClick: () => Promise<void> }>[];
    }>;
  }) => {
    mocks.submit = footer.props.children[1].props.onClick;
    return children;
  }
}));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({
  default: (props: { list: typeof mocks.options } | NonNullable<typeof mocks.protocol>) => {
    if ('value' in props) {
      // provider 的值也是 number，按选项类型区分新增的协议下拉框。
      if (typeof props.value === 'string') mocks.protocol = props;
      else mocks.options = props.list as typeof mocks.options;
    } else mocks.options = props.list;
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
    vi.clearAllMocks();
    mocks.protocol = undefined;
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

  const render = (
    channelType: 'system' | 'team',
    config: Partial<ChannelInfoType> = {},
    compact = false
  ) =>
    renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(EditChannelModal, {
          defaultConfig: { ...defaultChannel, type: 1, ...config },
          ...(compact ? { fixedModel: { model: 'gpt-5.4-nano' } } : {}),
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

  it.each([1, 3, 4])('defaults new type %s channels to Responses in both layouts', (type) => {
    for (const compact of [false, true]) {
      const html = render('team', { type }, compact);
      expect(html).toContain('config_model:chat_upstream_protocol');
      expect(mocks.protocol?.value).toBe('responses');
      expect(mocks.protocol?.list.map(({ value }) => value)).toEqual([
        'responses',
        'chat_completions'
      ]);
    }
  });

  it('hides the protocol selector for other channel types', async () => {
    render('team', { name: 'test-channel', type: 14, models: ['claude'] });
    expect(mocks.protocol).toBeUndefined();
    await mocks.submit();
    expect(postCreateChannel).toHaveBeenCalledWith(expect.objectContaining({ configs: {} }));
  });

  it('defaults an unconfigured existing channel to Responses and preserves explicit values', () => {
    render('system', { id: 12 });
    expect(mocks.protocol?.value).toBe('responses');
    expect(mocks.protocol?.list.map(({ value }) => value)).toEqual([
      'responses',
      'chat_completions'
    ]);
    render('system', { id: 12, configs: { chat_upstream_protocol: 'auto' } });
    expect(mocks.protocol?.value).toBe('auto');
    expect(mocks.protocol?.list.map(({ value }) => value)).toEqual([
      'responses',
      'chat_completions',
      'auto'
    ]);
    render('system', { id: 12, configs: { chat_upstream_protocol: 'chat_completions' } });
    expect(mocks.protocol?.value).toBe('chat_completions');
  });

  it('sends the selected protocol and retains other configs on update', async () => {
    render('system', {
      name: 'test-channel',
      id: 12,
      models: ['gpt-5.4-nano'],
      configs: { responses_first_event_timeout: 10 }
    });
    mocks.protocol?.onChange('chat_completions');
    await mocks.submit();
    expect(putChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        configs: { chat_upstream_protocol: 'chat_completions', responses_first_event_timeout: 10 }
      })
    );
  });

  it('submits Responses by default for a newly created channel', async () => {
    render('team', { name: 'test-channel', models: ['gpt-5.4-nano'] });
    await mocks.submit();
    expect(postCreateChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        configs: { chat_upstream_protocol: 'responses' }
      })
    );
  });
});
