import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
const mocks = vi.hoisted(() => ({
  open: false,
  loading: false,
  error: false,
  effects: [] as (() => void)[],
  lists: vi.fn(),
  detail: vi.fn(),
  refresh: vi.fn()
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
  useRef: () => ({ current: undefined }),
  useEffect: (fn: () => void) => {
    mocks.effects.push(fn);
  }
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));
vi.mock('@/web/core/ai/model/useUserModelLists', () => ({ useUserModelLists: mocks.lists }));
vi.mock('@/web/core/ai/model/useModelDetail', () => ({ useModelDetail: mocks.detail }));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  useUserModelStore: (selector: (state: unknown) => unknown) =>
    selector({
      defaultModelIds: { llm: 'chosen' },
      getModelProvider: () => ({ name: 'Provider' }),
      getModelProviders: () => []
    })
}));
import AIModelSelector from '@/components/Select/AIModelSelector';

describe('AIModelSelector lazy directory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.open = false;
    mocks.loading = false;
    mocks.error = false;
    mocks.effects = [];
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
      refresh: mocks.refresh
    });
  });
  it('does not enable catalog loading until open, and resets it on close', () => {
    const props = { modelType: ModelTypeEnum.llm, value: 'chosen' };
    let selector = AIModelSelector(props);
    expect(mocks.lists).toHaveBeenLastCalledWith({ outLinkAuthData: undefined, enabled: false });
    expect(mocks.detail).toHaveBeenLastCalledWith({
      modelId: 'chosen',
      outLinkAuthData: undefined
    });
    selector.props.onOpenFunc();
    mocks.loading = true;
    selector = AIModelSelector(props);
    expect(mocks.lists).toHaveBeenLastCalledWith({ outLinkAuthData: undefined, enabled: true });
    expect(selector.props.ButtonProps.isLoading).toBe(true);
    expect(selector.props.list).toEqual([]);
    selector.props.onCloseFunc();
    AIModelSelector(props);
    expect(mocks.lists).toHaveBeenLastCalledWith({ outLinkAuthData: undefined, enabled: false });
  });
  it('does not auto-select from cached data while closed and writes a selection only after open validation', () => {
    const onChange = vi.fn();
    const props = { modelType: ModelTypeEnum.llm, value: '', autoSelectDefault: true, onChange };
    AIModelSelector(props);
    mocks.effects.forEach((fn) => fn());
    expect(onChange).not.toHaveBeenCalled();
    mocks.effects = [];
    mocks.open = true;
    AIModelSelector(props);
    mocks.effects.forEach((fn) => fn());
    expect(onChange).toHaveBeenCalledWith('chosen');
  });
  it('shows a retryable catalog error without selecting a model or exposing stale choices', () => {
    mocks.open = true;
    mocks.error = true;
    const onChange = vi.fn();
    const selector = AIModelSelector({
      modelType: ModelTypeEnum.llm,
      value: '',
      autoSelectDefault: true,
      onChange
    });
    mocks.effects.forEach((fn) => fn());
    expect(onChange).not.toHaveBeenCalled();
    expect(selector.props.list).toEqual([]);
    expect(selector.props.emptyTip).toBe('common:model_detail_load_failed');
  });
});
