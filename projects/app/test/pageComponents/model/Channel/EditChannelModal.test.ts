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
  loadingProviders: false,
  loadingModels: false,
  useModelConfigCalls: [] as { channelType: string; language?: string; manual?: boolean }[],
  modalIsLoading: undefined as boolean | undefined,
  providerSelectLoading: undefined as boolean | undefined,
  multipleSelect: undefined as
    | undefined
    | {
        isLoading?: boolean;
        list: { label: string; value: string }[];
      },
  options: [] as { label: string; value: number; icon?: string }[],
  protocol: undefined as
    | undefined
    | {
        value: ChatUpstreamProtocol;
        list: { label: string; value: ChatUpstreamProtocol }[];
        onChange: (value: ChatUpstreamProtocol) => void;
      },
  modelMapping: undefined as
    | undefined
    | {
        value?: Record<string, string>;
        modelOptions?: { label: string; value: string; icon?: string }[];
        onChange?: (value: Record<string, string>) => void;
        onValidationChange?: (state: { hasDuplicateKey: boolean; duplicateKeys: string[] }) => void;
      },
  secretKey: undefined as
    | undefined
    | {
        value: string;
        isConfigured: boolean;
        onChange?: (value: string) => void;
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
  useModelConfig: (params: { channelType: string; language?: string; manual?: boolean }) => {
    mocks.useModelConfigCalls.push(params);
    return { models: [], getModelProvider: () => undefined, loading: mocks.loadingModels };
  }
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (request: (...args: any[]) => Promise<unknown>) => ({
    data: request === getChannelProviders ? mocks.metadata : undefined,
    runAsync: request === getChannelProviders ? vi.fn() : request,
    loading: request === getChannelProviders ? mocks.loadingProviders : false
  })
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({
    children,
    footer,
    isLoading
  }: {
    children: React.ReactNode;
    isLoading?: boolean;
    footer: React.ReactElement<{
      children: React.ReactElement<{ onClick: () => Promise<void> }>[];
    }>;
  }) => {
    mocks.modalIsLoading = isLoading;
    mocks.submit = footer.props.children[1].props.onClick;
    return children;
  }
}));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({
  default: (
    props: { list: typeof mocks.options; isLoading?: boolean } | NonNullable<typeof mocks.protocol>
  ) => {
    if ('value' in props) {
      // provider 的值也是 number，按选项类型区分新增的协议下拉框。
      if (typeof props.value === 'string') mocks.protocol = props;
      else {
        mocks.options = props.list as typeof mocks.options;
        mocks.providerSelectLoading = (props as { isLoading?: boolean }).isLoading;
      }
    } else {
      mocks.options = props.list;
      mocks.providerSelectLoading = props.isLoading;
    }
    return null;
  }
}));
vi.mock('@fastgpt/web/components/common/MySelect/MultipleSelect', () => ({
  default: (props: NonNullable<typeof mocks.multipleSelect>) => {
    mocks.multipleSelect = props;
    return null;
  }
}));
vi.mock('@/pageComponents/model/Channel/ModelMappingInput', () => ({
  default: (props: NonNullable<typeof mocks.modelMapping>) => {
    mocks.modelMapping = props;
    return null;
  }
}));
vi.mock('@/components/common/secret/SecretValueInput', () => ({
  default: (props: NonNullable<typeof mocks.secretKey>) => {
    mocks.secretKey = props;
    return null;
  }
}));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({
  default: ({ label }: { label?: string }) =>
    React.createElement('span', { 'data-question-tip': label })
}));
vi.mock('@fastgpt/web/components/common/String/CopyBox', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));

import EditChannelModal from '@/pageComponents/model/Channel/EditChannelModal';

describe('EditChannelModal channel metadata', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.stubGlobal('React', React);
    vi.clearAllMocks();
    mocks.loadingProviders = false;
    mocks.loadingModels = false;
    mocks.useModelConfigCalls = [];
    mocks.modalIsLoading = undefined;
    mocks.providerSelectLoading = undefined;
    mocks.multipleSelect = undefined;
    mocks.protocol = undefined;
    mocks.modelMapping = undefined;
    mocks.secretKey = undefined;
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

  const render = ({
    channelType,
    config = {},
    compact = false
  }: {
    channelType: 'system' | 'team';
    config?: Partial<ChannelInfoType>;
    compact?: boolean;
  }) =>
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
      const html = render({ channelType });
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
    render({ channelType: 'team' });
    expect(mocks.options[0].label).toBe('Upstream');

    mocks.metadata = {};
    const html = render({ channelType: 'team' });
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
    render({ channelType: 'team' });
    expect(mocks.options.map(({ value }) => value)).toEqual([23, 8, 1, 2, 99]);
    expect(mocks.metadata[23].order).toBe(0);
  });

  it.each([1, 3, 4])('defaults new type %s channels to auto in both layouts', (type) => {
    for (const compact of [false, true]) {
      const html = render({ channelType: 'team', config: { type }, compact });
      expect(html).toContain('config_model:chat_upstream_protocol');
      expect(mocks.protocol?.value).toBe('auto');
      expect(mocks.protocol?.list.map(({ value }) => value)).toEqual([
        'auto',
        'responses',
        'chat_completions'
      ]);
    }
  });

  it('hides the protocol selector for other channel types', async () => {
    render({ channelType: 'team', config: { name: 'test-channel', type: 14, models: ['claude'] } });
    expect(mocks.protocol).toBeUndefined();
    await mocks.submit();
    expect(postCreateChannel).toHaveBeenCalledWith(expect.objectContaining({ configs: {} }));
  });

  it('defaults an unconfigured existing channel to auto and preserves explicit values', () => {
    render({ channelType: 'system', config: { id: 12 } });
    expect(mocks.protocol?.value).toBe('auto');
    expect(mocks.protocol?.list.map(({ value }) => value)).toEqual([
      'auto',
      'responses',
      'chat_completions'
    ]);
    render({
      channelType: 'system',
      config: { id: 12, configs: { chat_upstream_protocol: 'auto' } }
    });
    expect(mocks.protocol?.value).toBe('auto');
    expect(mocks.protocol?.list.map(({ value }) => value)).toEqual([
      'auto',
      'responses',
      'chat_completions'
    ]);
    render({
      channelType: 'system',
      config: { id: 12, configs: { chat_upstream_protocol: 'responses' } }
    });
    expect(mocks.protocol?.value).toBe('responses');
    render({
      channelType: 'system',
      config: { id: 12, configs: { chat_upstream_protocol: 'chat_completions' } }
    });
    expect(mocks.protocol?.value).toBe('chat_completions');
  });

  it('sends the selected protocol and retains other configs on update', async () => {
    render({
      channelType: 'system',
      config: {
        name: 'test-channel',
        id: 12,
        models: ['gpt-5.4-nano'],
        configs: { responses_first_event_timeout: 10 }
      }
    });
    mocks.protocol?.onChange('chat_completions');
    await mocks.submit();
    expect(putChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        configs: { chat_upstream_protocol: 'chat_completions', responses_first_event_timeout: 10 }
      })
    );
  });

  it('submits auto by default for a newly created channel', async () => {
    render({ channelType: 'team', config: { name: 'test-channel', models: ['gpt-5.4-nano'] } });
    await mocks.submit();
    expect(postCreateChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        configs: { chat_upstream_protocol: 'auto' }
      })
    );
  });

  it('stores model_mapping as an object, scopes keyOptions to selected models, and blocks duplicate keys', async () => {
    render({
      channelType: 'team',
      config: {
        name: 'mapping-channel',
        models: ['gpt-4o', 'qwen-plus'],
        model_mapping: { 'gpt-4o': 'gpt-4o-upstream' }
      }
    });
    expect(mocks.modelMapping?.value).toEqual({ 'gpt-4o': 'gpt-4o-upstream' });
    expect(mocks.modelMapping?.modelOptions?.map(({ value }) => value)).toEqual([
      'gpt-4o',
      'qwen-plus'
    ]);

    mocks.modelMapping?.onChange?.({ 'gpt-4o': 'gpt-4o-v2', 'qwen-plus': 'qwen-upstream' });
    mocks.modelMapping?.onValidationChange?.({
      hasDuplicateKey: true,
      duplicateKeys: ['gpt-4o']
    });
    await expect(mocks.submit()).rejects.toBe('config_model:mapping_key_duplicate');
    expect(postCreateChannel).not.toHaveBeenCalled();

    mocks.modelMapping?.onValidationChange?.({
      hasDuplicateKey: false,
      duplicateKeys: []
    });
    await mocks.submit();
    expect(postCreateChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        model_mapping: { 'gpt-4o': 'gpt-4o-v2', 'qwen-plus': 'qwen-upstream' }
      })
    );
  });

  it('uses a single mapping input with upstream model ID tooltip in single-model compact create', () => {
    const html = render({
      channelType: 'team',
      config: {
        name: 'compact-channel',
        models: ['gpt-5.4-nano'],
        model_mapping: { 'gpt-5.4-nano': 'upstream-nano' }
      },
      compact: true
    });
    expect(mocks.modelMapping).toBeUndefined();
    expect(html).toContain('config_model:compact_mapping_tip');
    expect(html).toContain('value="upstream-nano"');
  });

  it('uses SecretValueInput for configured keys and preserves untouched key on update', async () => {
    render({
      channelType: 'system',
      config: {
        id: 12,
        name: 'keyed-channel',
        models: ['gpt-4o'],
        key: '',
        keyConfigured: true
      }
    });
    expect(mocks.secretKey?.isConfigured).toBe(true);
    expect(mocks.secretKey?.value).toBe('');

    await mocks.submit();
    expect(putChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 12,
        key: undefined
      })
    );
    expect(vi.mocked(putChannel).mock.calls[0]?.[0]).not.toHaveProperty('keyConfigured');

    mocks.secretKey?.onChange?.('sk-new-secret');
    await mocks.submit();
    expect(putChannel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 12,
        key: 'sk-new-secret'
      })
    );

    render({
      channelType: 'team',
      config: {
        id: 13,
        name: 'unkeyed-channel',
        models: ['gpt-4o'],
        key: '',
        keyConfigured: false
      }
    });
    expect(mocks.secretKey?.isConfigured).toBe(false);
  });

  it('keeps provider and model loading inside their own selects without modal-level loading', () => {
    mocks.loadingProviders = true;
    mocks.loadingModels = true;
    render({
      channelType: 'system',
      config: { id: 12, name: 'existing', models: ['gpt-4o'] }
    });
    expect(mocks.modalIsLoading).toBeUndefined();
    expect(mocks.providerSelectLoading).toBe(true);
    expect(mocks.multipleSelect?.isLoading).toBe(true);
    expect(mocks.multipleSelect?.list.map(({ value }) => value)).toEqual(['gpt-4o']);
    expect(mocks.useModelConfigCalls.at(-1)?.manual).toBe(false);

    render({
      channelType: 'team',
      config: { name: 'compact', models: ['gpt-5.4-nano'] },
      compact: true
    });
    expect(mocks.modalIsLoading).toBeUndefined();
    expect(mocks.providerSelectLoading).toBe(true);
    expect(mocks.useModelConfigCalls.at(-1)?.manual).toBe(true);
  });
});
