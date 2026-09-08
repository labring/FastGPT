import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  member: 'a',
  effect: undefined as (() => void | (() => void)) | undefined,
  detail: vi.fn(),
  list: vi.fn(),
  default: vi.fn()
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useCallback: (fn: unknown) => fn,
  useState: (initial: unknown) => {
    const index = mocks.index++;
    if (!(index in mocks.states)) mocks.states[index] = initial;
    return [
      mocks.states[index],
      (value: unknown) => {
        mocks.states[index] = value;
      }
    ];
  },
  useEffect: (fn: () => void | (() => void)) => {
    mocks.effect = fn;
  }
}));
vi.mock('@/web/core/ai/model/modelData', () => ({
  getModelReadIdentity: () => ({ key: mocks.member }),
  getModelDetail: mocks.detail,
  getModelList: mocks.list,
  getModelDefault: mocks.default
}));
vi.mock('@/web/support/user/useUserStore', () => ({ useUserStore: () => mocks.member }));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({ useUserModelStore: () => undefined }));

import { useModelDetail } from '@/web/core/ai/model/useModelDetail';
import { useModelList } from '@/web/core/ai/model/useModelList';
import { useModelDefault } from '@/web/core/ai/model/useModelDefault';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.states = [];
  mocks.index = 0;
  mocks.member = 'a';
  mocks.effect = undefined;
  mocks.detail.mockResolvedValue({ modelId: 'selected', config: { maxContext: 8192 } });
  mocks.list.mockResolvedValue([{ modelId: 'selected' }]);
  mocks.default.mockResolvedValue({ modelId: 'default' });
});
const render = <T>(hook: () => T) => {
  mocks.index = 0;
  return hook();
};
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('business-local model readers', () => {
  it('forwards hidden-model filtering to detail and default readers', async () => {
    render(() => useModelDetail({ modelId: 'selected', excludeHidden: true }));
    mocks.effect?.();
    await flush();
    expect(mocks.detail).toHaveBeenCalledWith(expect.objectContaining({ excludeHidden: true }));
    render(() =>
      useModelDefault({ enabled: true, modelType: ModelTypeEnum.llm, excludeHidden: true })
    );
    mocks.effect?.();
    await flush();
    expect(mocks.default).toHaveBeenCalledWith(expect.objectContaining({ excludeHidden: true }));
  });

  it('loads model capabilities asynchronously without a parent list', async () => {
    const hook = () => useModelDetail({ modelId: 'selected', modelType: ModelTypeEnum.llm });
    expect(render(hook).loading).toBe(true);
    mocks.effect?.();
    await flush();
    expect(render(hook).model?.config).toEqual({ maxContext: 8192 });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('never reads catalog for a missing model reference', () => {
    expect(render(() => useModelDetail({})).loading).toBe(false);
    mocks.effect?.();
    expect(mocks.detail).not.toHaveBeenCalled();
  });

  it('distinguishes read failure from a successfully missing model', async () => {
    mocks.detail.mockRejectedValueOnce(new Error('offline'));
    const hook = () => useModelDetail({ modelId: 'selected' });
    render(hook);
    mocks.effect?.();
    await flush();
    expect(render(hook)).toMatchObject({
      loading: false,
      loaded: false,
      error: new Error('offline')
    });
    mocks.detail.mockResolvedValueOnce(undefined);
    render(hook);
    mocks.effect?.();
    await flush();
    expect(render(hook)).toMatchObject({ loaded: true, model: undefined, error: undefined });
  });

  it('does not expose an old identity or apply a response after cleanup', async () => {
    let resolve!: (model: unknown) => void;
    mocks.detail.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    const hook = () => useModelDetail({ modelId: 'selected' });
    render(hook);
    const cleanup = mocks.effect?.();
    if (typeof cleanup === 'function') cleanup();
    mocks.member = 'b';
    resolve({ modelId: 'old' });
    await flush();
    expect(render(hook)).toMatchObject({ model: undefined, loading: true });
  });

  it('keeps list loading opt-in and does not fetch when the selector is closed', async () => {
    render(() => useModelList({ modelType: ModelTypeEnum.llm }));
    mocks.effect?.();
    expect(mocks.list).not.toHaveBeenCalled();
    render(() => useModelList({ enabled: true, modelType: ModelTypeEnum.llm, vision: true }));
    mocks.effect?.();
    await flush();
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ refresh: true, vision: true })
    );
    expect(render(() => useModelList({ enabled: false })).modelList).toEqual([]);
  });

  it('only resolves defaults when the business explicitly enables initialization', async () => {
    render(() => useModelDefault({ enabled: false, modelType: ModelTypeEnum.llm }));
    mocks.effect?.();
    expect(mocks.default).not.toHaveBeenCalled();
    const hook = () =>
      useModelDefault({
        enabled: true,
        modelType: ModelTypeEnum.llm,
        businessDefaultModelId: 'preferred'
      });
    render(hook);
    mocks.effect?.();
    await flush();
    expect(render(hook).model?.modelId).toBe('default');
    expect(mocks.default).toHaveBeenCalledWith(
      expect.objectContaining({ businessDefaultModelId: 'preferred' })
    );
  });
});
