import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';

const mocks = vi.hoisted(() => ({
  getTestModel: vi.fn(),
  postTestDraftModel: vi.fn(),
  toast: vi.fn(),
  translate: vi.fn((key: string, _values?: Record<string, string>) => key),
  setTestingChannelIds: vi.fn<(value: ReadonlySet<number>) => void>()
}));

vi.mock('@/web/core/ai/config', () => ({
  getTestModel: mocks.getTestModel,
  postTestDraftModel: mocks.postTestDraftModel,
  postSystemModel: vi.fn(),
  putReplaceSystemModelChannels: vi.fn(),
  putSystemModel: vi.fn()
}));

// 这里只隔离 React 调度；草稿规范化、异步请求编排及 in-flight Set 均运行真实实现。
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: <T>(value: T) => ({ current: value }),
  useState: (value: ReadonlySet<number>) => [value, mocks.setTestingChannelIds]
}));

vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));

vi.mock('@fastgpt/web/i18n/useClientTranslation', () => ({
  useClientTranslation: () => ({ t: mocks.translate })
}));

import { useModelChannelTest } from '@/pageComponents/account/model/useModelChannelTest';

describe('useModelChannelTest', () => {
  const channels = [
    { id: 1, name: 'Primary channel' },
    { id: 2, name: 'Secondary channel' }
  ];

  /** 构造完整草稿，保证测试检查请求参数而不只检查模型标识。 */
  const createDraft = (): SystemModelDocumentDataType => ({
    type: ModelTypeEnum.llm,
    scope: ModelScopeEnum.system,
    model: 'initial-model',
    name: 'Initial alias',
    provider: 'OpenAI',
    isActive: false,
    config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
  });

  /** 手动完成请求，精确验证重叠请求的去重与完成顺序，不依赖计时器。 */
  const deferredRequest = () => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTestModel.mockReset().mockResolvedValue(undefined);
    mocks.postTestDraftModel.mockReset().mockResolvedValue(undefined);
  });

  it('reads the complete latest draft on every click and never calls the installed endpoint', async () => {
    let draft = createDraft();
    const getModelData = vi.fn(() => draft);
    const { testModelChannel, testingChannelIds } = useModelChannelTest({
      target: { source: 'draft', getModelData },
      channels
    });

    expect(testingChannelIds.size).toBe(0);
    expect(getModelData).not.toHaveBeenCalled();

    draft = {
      ...draft,
      model: '  edited-model  ',
      name: '',
      provider: 'Custom provider',
      requestUrl: 'https://draft.example.com/v1',
      requestAuth: 'draft-token',
      priceTiers: [{ inputPrice: 0, outputPrice: 5 }],
      config: { maxContext: 32000, maxResponse: 4000, quoteMaxToken: 24000, vision: true }
    };
    await testModelChannel(1);

    expect(mocks.postTestDraftModel).toHaveBeenLastCalledWith({
      modelData: { ...draft, model: 'edited-model', name: 'edited-model' },
      channelId: 1
    });
    expect(draft.model).toBe('  edited-model  ');
    expect(draft.name).toBe('');

    draft = { ...draft, model: 'second-edit', name: 'New alias' };
    await testModelChannel(2);

    expect(getModelData).toHaveBeenCalledTimes(2);
    expect(mocks.postTestDraftModel).toHaveBeenLastCalledWith({ modelData: draft, channelId: 2 });
    expect(mocks.getTestModel).not.toHaveBeenCalled();
  });

  it('uses the stable persisted ID only for an explicitly installed target', async () => {
    const { testModelChannel } = useModelChannelTest({
      target: { source: 'installed', modelId: 'persisted-model-id', model: 'installed-model' },
      channels
    });

    await testModelChannel(1);

    expect(mocks.getTestModel).toHaveBeenCalledExactlyOnceWith({
      modelId: 'persisted-model-id',
      channelId: 1
    });
    expect(mocks.postTestDraftModel).not.toHaveBeenCalled();
    expect(mocks.translate).toHaveBeenCalledWith('config_model:model_channel_test_success', {
      model: 'installed-model',
      channel: 'Primary channel'
    });
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'success',
      title: 'config_model:model_channel_test_success'
    });
    expect(mocks.setTestingChannelIds.mock.calls.map(([ids]) => [...ids])).toEqual([[1], []]);
  });

  it('does nothing while there is no test target', async () => {
    await useModelChannelTest({ channels }).testModelChannel(1);

    expect(mocks.getTestModel).not.toHaveBeenCalled();
    expect(mocks.postTestDraftModel).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.setTestingChannelIds).not.toHaveBeenCalled();
  });

  it.each(['missing draft', 'empty model', 'whitespace model'])(
    'rejects %s without falling back to a saved model',
    async (scenario) => {
      const draft = (() => {
        if (scenario === 'missing draft') return undefined;
        return { ...createDraft(), model: scenario === 'empty model' ? '' : '  \t ' };
      })();
      const { testModelChannel } = useModelChannelTest({
        target: { source: 'draft', getModelData: () => draft },
        channels
      });

      await testModelChannel(1);

      expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
        status: 'warning',
        title: 'config_model:fill_model_id_before_test'
      });
      expect(mocks.getTestModel).not.toHaveBeenCalled();
      expect(mocks.postTestDraftModel).not.toHaveBeenCalled();
      expect(mocks.setTestingChannelIds).not.toHaveBeenCalled();
    }
  );

  it.each([null, {}, 'voice'])(
    'rejects invalid JSON voice value %j without an unhandled error',
    async (voices) => {
      const draft = {
        ...createDraft(),
        type: ModelTypeEnum.tts,
        config: { voices }
      } as unknown as SystemModelDocumentDataType;
      const { testModelChannel } = useModelChannelTest({
        target: { source: 'draft', getModelData: () => draft },
        channels
      });
      await expect(testModelChannel(1)).resolves.toBeUndefined();
      expect(mocks.toast).toHaveBeenCalledWith({
        status: 'warning',
        title: 'config_model:fill_voice_before_test'
      });
      expect(mocks.postTestDraftModel).not.toHaveBeenCalled();
    }
  );

  it('rejects empty TTS voices but accepts the newly entered draft voice on a subsequent click', async () => {
    let draft: SystemModelDocumentDataType = {
      type: ModelTypeEnum.tts,
      scope: ModelScopeEnum.system,
      provider: 'Custom provider',
      model: 'draft-tts',
      name: 'TTS draft',
      config: { voices: [] }
    };
    const { testModelChannel } = useModelChannelTest({
      target: { source: 'draft', getModelData: () => draft },
      channels
    });

    await testModelChannel(1);

    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'warning',
      title: 'config_model:fill_voice_before_test'
    });
    expect(mocks.postTestDraftModel).not.toHaveBeenCalled();
    expect(mocks.setTestingChannelIds).not.toHaveBeenCalled();

    draft = { ...draft, config: { voices: [{ label: 'New voice', value: 'new-voice' }] } };
    await testModelChannel(1);

    expect(mocks.postTestDraftModel).toHaveBeenCalledExactlyOnceWith({
      modelData: draft,
      channelId: 1
    });
    expect(mocks.getTestModel).not.toHaveBeenCalled();
  });

  it('deduplicates a channel in flight while other channels progress and cleans up after errors', async () => {
    const first = deferredRequest();
    const second = deferredRequest();
    mocks.postTestDraftModel.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const getModelData = vi.fn(createDraft);
    const { testModelChannel } = useModelChannelTest({
      target: { source: 'draft', getModelData },
      channels
    });

    const firstRun = testModelChannel(1);
    await testModelChannel(1);
    const secondRun = testModelChannel(2);

    expect(getModelData).toHaveBeenCalledTimes(2);
    expect(mocks.postTestDraftModel).toHaveBeenCalledTimes(2);
    expect(mocks.setTestingChannelIds.mock.calls.map(([ids]) => [...ids])).toEqual([[1], [1, 2]]);

    second.resolve();
    await secondRun;
    expect(mocks.setTestingChannelIds).toHaveBeenLastCalledWith(new Set([1]));

    first.reject(new Error('channel unavailable'));
    await expect(firstRun).resolves.toBeUndefined();

    expect(mocks.translate).toHaveBeenCalledWith('config_model:model_channel_test_failed', {
      model: 'initial-model',
      channel: 'Primary channel',
      reason: 'channel unavailable'
    });
    expect(mocks.toast).toHaveBeenLastCalledWith({
      status: 'error',
      title: 'config_model:model_channel_test_failed'
    });
    expect(mocks.setTestingChannelIds).toHaveBeenLastCalledWith(new Set());

    await testModelChannel(1);
    expect(mocks.postTestDraftModel).toHaveBeenCalledTimes(3);
    expect(mocks.setTestingChannelIds).toHaveBeenLastCalledWith(new Set());
  });

  it('uses an empty channel label when channel metadata is unavailable', async () => {
    await useModelChannelTest({
      target: { source: 'installed', modelId: 'persisted-model-id', model: 'installed-model' },
      channels: []
    }).testModelChannel(99);

    expect(mocks.getTestModel).toHaveBeenCalledExactlyOnceWith({
      modelId: 'persisted-model-id',
      channelId: 99
    });
    expect(mocks.translate).toHaveBeenCalledWith('config_model:model_channel_test_success', {
      model: 'installed-model',
      channel: ''
    });
  });
});
