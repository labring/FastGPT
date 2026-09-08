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
    mocks.setFromCatalog.mockClear();
    selector.props.onSelect(['chosen']);
    expect(mocks.setFromCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'chosen' })
    );
    expect(mocks.setFromCatalog.mock.invocationCallOrder[0]).toBeLessThan(
      onChange.mock.invocationCallOrder[0]
    );
  });

  it('refreshes details only when a successfully loaded catalog is missing the current model', () => {
    mocks.open = true;
    AIModelSelector({ modelType: ModelTypeEnum.llm, value: 'missing' });
    mocks.effects.forEach((fn) => fn());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.setFromCatalog).not.toHaveBeenCalled();
  });
});
