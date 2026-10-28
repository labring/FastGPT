import AIModelSelector from '@/components/Select/AIModelSelector';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  open: false,
  loading: false,
  error: false,
  effects: [] as (() => void)[],
  refs: [] as { current: unknown }[],
  refIndex: 0,
  lists: vi.fn(),
  detail: vi.fn(),
  refresh: vi.fn(),
  setFromCatalog: vi.fn()
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: () => [
    mocks.open,
    (value: boolean) => {
      mocks.open = value;
    }
  ],
  useMemo: (fn: () => unknown) => fn(),
  useRef: (initial: unknown) => {
    const index = mocks.refIndex++;
    return mocks.refs[index] ?? (mocks.refs[index] = { current: initial });
  },
  useEffect: (fn: () => void) => {
    mocks.effects.push(fn);
  }
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));
vi.mock('@/web/core/ai/model/useModelList', () => ({ useModelList: mocks.lists }));
vi.mock('@/web/core/ai/model/useModelSummary', () => ({ useModelSummary: mocks.detail }));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  useUserModelStore: (selector: (state: unknown) => unknown) =>
    selector({
      defaultModelIds: { llm: 'chosen' },
      getModelProvider: () => ({ name: 'Provider' }),
      getModelProviders: () => []
    })
}));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_: unknown, select: (value: { appId?: string }) => unknown) => select({})
}));
vi.mock('@/pageComponents/app/detail/context', () => ({ AppContext: {} }));

describe('AIModelSelector lazy directory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.open = false;
    mocks.loading = false;
    mocks.error = false;
    mocks.effects = [];
    mocks.refs = [];
    mocks.refIndex = 0;
    mocks.lists.mockImplementation(() => ({
      modelList: [
        {
          modelId: 'chosen',
          model: 'provider-model',
          name: 'Chosen',
          type: 'llm',
          provider: 'p',
          config: {}
        }
      ],
      loading: mocks.loading,
      error: mocks.error
    }));
    mocks.detail.mockReturnValue({
      detail: { modelId: 'chosen', name: 'Chosen', status: 'active' },
      loading: false,
      error: false,
      refresh: mocks.refresh,
      setFromCatalog: mocks.setFromCatalog
    });
  });
  it('does not enable catalog loading until open, and resets it on close', () => {
    const props = { modelType: ModelTypeEnum.llm, value: 'chosen' };
    let selector = AIModelSelector(props);
    expect(mocks.lists).toHaveBeenLastCalledWith({
      outLinkAuthData: undefined,
      modelType: ModelTypeEnum.llm,
      vision: undefined,
      excludeHidden: undefined,
      enabled: false
    });
    expect(mocks.detail).toHaveBeenLastCalledWith({
      modelId: 'chosen',
      appId: undefined,
      outLinkAuthData: undefined
    });
    selector.props.onOpenFunc();
    expect(mocks.refresh).not.toHaveBeenCalled();
    mocks.loading = true;
    selector = AIModelSelector(props);
    expect(mocks.lists).toHaveBeenLastCalledWith({
      outLinkAuthData: undefined,
      modelType: ModelTypeEnum.llm,
      vision: undefined,
      excludeHidden: undefined,
      enabled: true
    });
    expect(selector.props.isLoading).toBe(true);
    expect(selector.props.ButtonProps.isLoading).toBeUndefined();
    expect(selector.props.ButtonProps.isDisabled).toBe(false);
    expect(selector.props.ButtonProps.loadingText).toBeUndefined();
    expect(selector.props.label.props.detail).toMatchObject({ modelId: 'chosen', name: 'Chosen' });
    expect(selector.props.label.props.loading).toBe(false);
    expect(selector.props.list).toEqual([]);
    selector.props.onCloseFunc();
    AIModelSelector(props);
    expect(mocks.lists).toHaveBeenLastCalledWith({
      outLinkAuthData: undefined,
      modelType: ModelTypeEnum.llm,
      vision: undefined,
      excludeHidden: undefined,
      enabled: false
    });
  });
  it('does not assign a default while closed or after opening', () => {
    const onChange = vi.fn();
    const props = { modelType: ModelTypeEnum.llm, value: '', onChange };
    AIModelSelector(props);
    mocks.effects.forEach((fn) => fn());
    expect(onChange).not.toHaveBeenCalled();
    mocks.effects = [];
    mocks.open = true;
    AIModelSelector(props);
    mocks.effects.forEach((fn) => fn());
    expect(onChange).not.toHaveBeenCalled();
  });
  it('shows a retryable catalog error without selecting a model or exposing stale choices', () => {
    mocks.open = true;
    mocks.error = true;
    const onChange = vi.fn();
    const selector = AIModelSelector({
      modelType: ModelTypeEnum.llm,
      value: '',
      onChange
    });
    mocks.effects.forEach((fn) => fn());
    expect(onChange).not.toHaveBeenCalled();
    expect(selector.props.list).toEqual([]);
    expect(selector.props.emptyTip).toBe('common:model_detail_load_failed');
  });

  it('never fills a cleared selection across repeated open cycles', () => {
    const onChange = vi.fn();
    const render = (value: string, open: boolean) => {
      mocks.refIndex = 0;
      mocks.effects = [];
      mocks.open = open;
      AIModelSelector({ modelType: ModelTypeEnum.llm, value, onChange });
      mocks.effects.forEach((effect) => effect());
    };
    render('chosen', true);
    render('', true);
    expect(onChange).not.toHaveBeenCalled();
    render('', false);
    render('', true);
    expect(onChange).not.toHaveBeenCalled();
    render('', true);
    expect(onChange).not.toHaveBeenCalled();
    render('', false);
    render('', true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reuses the loaded catalog for the current model and primes it before selection', () => {
    mocks.open = true;
    const onChange = vi.fn();
    const selector = AIModelSelector({ modelType: ModelTypeEnum.llm, value: 'chosen', onChange });
    mocks.effects.forEach((fn) => fn());
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.setFromCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'chosen', name: 'Chosen' })
    );
  });

  it('emits only when a real model changes, never on provider navigation', () => {
    mocks.open = true;
    // 11 个模型以上走分组：左列是提供商，右列才是模型
    mocks.lists.mockImplementation(() => ({
      modelList: Array.from({ length: 11 }, (_, index) => ({
        modelId: `model-${index}`,
        model: `m-${index}`,
        name: `Model ${index}`,
        type: 'llm',
        provider: index % 2 === 0 ? 'p-a' : 'p-b',
        config: {}
      })),
      loading: false,
      error: false
    }));
    const onChange = vi.fn();
    const selector = AIModelSelector({
      modelType: ModelTypeEnum.llm,
      value: 'model-0',
      onChange
    });

    // 点击另一个提供商：只是导航，右列仍是上一次的模型，不能回调
    selector.props.onSelect(['p-b', 'model-0']);
    expect(onChange).not.toHaveBeenCalled();

    // 右列还没选中任何模型
    selector.props.onSelect(['p-b', undefined]);
    expect(onChange).not.toHaveBeenCalled();

    // 重选当前模型同样不应产生 update 请求（例如点了同一个已被高亮的项）
    selector.props.onSelect(['p-a', 'model-0']);
    expect(onChange).not.toHaveBeenCalled();

    // 真正切到另一个模型才回调
    selector.props.onSelect(['p-b', 'model-1']);
    expect(onChange).toHaveBeenCalledWith('model-1');
  });

  it('does not emit when the same model is reselected in a flat list', () => {
    mocks.open = true;
    const onChange = vi.fn();
    const selector = AIModelSelector({
      modelType: ModelTypeEnum.llm,
      value: 'chosen',
      onChange
    });

    selector.props.onSelect(['chosen']);
    expect(onChange).not.toHaveBeenCalled();
    expect(mocks.setFromCatalog).not.toHaveBeenCalled();
  });

  it('hides TTS models without an available voice when requested', () => {
    mocks.open = true;
    mocks.lists.mockImplementation(() => ({
      modelList: [
        { modelId: 'empty', type: 'tts', provider: 'p', config: { voices: [] } },
        {
          modelId: 'blank',
          type: 'tts',
          provider: 'p',
          config: { voices: [{ label: 'Blank', value: '  ' }] }
        },
        {
          modelId: 'ready',
          type: 'tts',
          provider: 'p',
          config: { voices: [{ label: 'Voice', value: 'voice' }] }
        }
      ],
      loading: false,
      error: false
    }));

    const selector = AIModelSelector({
      modelType: ModelTypeEnum.tts,
      value: '',
      requireTtsVoice: true
    });
    expect(selector.props.list.map((item: { value: string }) => item.value)).toEqual(['ready']);
  });

  it('keeps the existing detail when a successfully loaded catalog is missing the current model', () => {
    mocks.open = true;
    AIModelSelector({ modelType: ModelTypeEnum.llm, value: 'missing' });
    mocks.effects.forEach((fn) => fn());
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.setFromCatalog).not.toHaveBeenCalled();
  });
});
