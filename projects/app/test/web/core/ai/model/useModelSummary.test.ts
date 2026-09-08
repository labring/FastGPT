import { useModelSummary } from '@/web/core/ai/model/useModelSummary';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  effect: undefined as undefined | (() => void | (() => void)),
  member: 'member',
  generation: 0,
  request: vi.fn()
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = mocks.index++;
    if (!(index in mocks.states)) mocks.states[index] = initial;
    return [
      mocks.states[index],
      (value: unknown) => {
        mocks.states[index] = typeof value === 'function' ? value(mocks.states[index]) : value;
      }
    ];
  },
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void | (() => void)) => {
    mocks.effect = fn;
  }
}));
vi.mock('@/web/common/system/api', () => ({ getUserModelSummaries: mocks.request }));
vi.mock('@/web/support/user/useUserStore', () => {
  const getState = () => ({ userInfo: { team: { teamId: 'team', tmbId: mocks.member } } });
  return {
    useUserStore: Object.assign((selector: (state: unknown) => unknown) => selector(getState()), {
      getState
    })
  };
});
vi.mock('@/web/core/ai/model/useUserModelStore', () => {
  const getState = () => ({ loginGeneration: mocks.generation, modelMap: {} });
  return {
    useUserModelStore: Object.assign(
      (selector: (state: unknown) => unknown) => selector(getState()),
      { getState }
    )
  };
});

describe('useModelSummary request lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.states = [];
    mocks.index = 0;
    mocks.effect = undefined;
    mocks.member = 'member';
    mocks.generation++;
    mocks.request.mockResolvedValue({ models: [{ modelId: 'a', name: 'A', status: 'active' }] });
  });
  const render = (modelId?: string, outLinkAuthData?: { shareId: string; outLinkUid: string }) => {
    mocks.index = 0;
    return useModelSummary({ modelId, outLinkAuthData });
  };
  const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };

  it('does not request unset values and loads only the selected ID', async () => {
    expect(render().loading).toBe(false);
    mocks.effect?.();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(render('a').loading).toBe(true);
    mocks.effect?.();
    await flush();
    expect(mocks.request).toHaveBeenCalledWith({ modelIds: ['a'], outLinkAuthData: undefined });
    expect(render('a')).toMatchObject({
      loading: false,
      error: false,
      detail: { modelId: 'a', status: 'active' }
    });
  });
  it('hides previous identity data immediately and discards responses after cleanup', async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.request.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      })
    );
    render('a');
    const cleanup = mocks.effect?.();
    if (typeof cleanup === 'function') cleanup();
    mocks.member = 'another';
    expect(render('a').detail).toBeUndefined();
    mocks.request.mockResolvedValueOnce({
      models: [{ modelId: 'a', name: 'A', status: 'forbidden' }]
    });
    mocks.effect?.();
    await flush();
    resolveOld({ models: [{ modelId: 'a', name: 'Old A', status: 'active' }] });
    await flush();
    expect(render('a').detail).toMatchObject({ status: 'forbidden', name: 'A' });
  });
  it('keeps request errors distinct from deleted and supports an explicit retry', async () => {
    mocks.request.mockRejectedValueOnce(new Error('network'));
    render('a');
    mocks.effect?.();
    await flush();
    const failed = render('a');
    expect(failed).toMatchObject({ error: true, loading: false, detail: undefined });
    failed.refresh();
    render('a');
    mocks.effect?.();
    await flush();
    expect(render('a')).toMatchObject({ error: false, detail: { status: 'active' } });
  });
  it('uses catalog selection immediately and refresh does not keep bypassing other model caches', async () => {
    render('a');
    mocks.effect?.();
    await flush();
    render('a').setFromCatalog({ modelId: 'b', name: 'Catalog B', avatar: 'b.svg' });
    expect(render('b')).toMatchObject({
      loading: false,
      detail: { modelId: 'b', name: 'Catalog B' }
    });
    mocks.effect?.();
    await flush();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    render('b').setFromCatalog({ modelId: 'a', name: 'Catalog A' });
    expect(render('a')).toMatchObject({ loading: false, detail: { name: 'Catalog A' } });
    mocks.effect?.();
    await flush();
    render('a').refresh();
    render('a');
    mocks.effect?.();
    await flush();
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(render('b').loading).toBe(false);
    mocks.effect?.();
    await flush();
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
  it('does not reuse detail cache across outlink credentials', async () => {
    const firstAuth = { shareId: 'share', outLinkUid: 'first' };
    render('a', firstAuth);
    mocks.effect?.();
    await flush();
    expect(mocks.request).toHaveBeenLastCalledWith({ modelIds: ['a'], outLinkAuthData: firstAuth });
    const secondAuth = { shareId: 'share', outLinkUid: 'second' };
    expect(render('a', secondAuth).detail).toBeUndefined();
    mocks.effect?.();
    await flush();
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.request).toHaveBeenLastCalledWith({
      modelIds: ['a'],
      outLinkAuthData: secondAuth
    });
  });
  it('waits for an identity without requesting and ignores failures after cleanup', async () => {
    mocks.member = '';
    expect(render('a').loading).toBe(true);
    mocks.effect?.();
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.member = 'member';
    let reject!: (error: Error) => void;
    mocks.request.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    render('a');
    const cleanup = mocks.effect?.();
    if (typeof cleanup === 'function') cleanup();
    reject(new Error('late failure'));
    await flush();
    expect(render('a').error).toBe(false);
  });
});
