import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelQuery } from '@/web/core/ai/model/useModelQuery';

const mocks = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  identity: 'member' as string | undefined,
  version: 'v1',
  effect: undefined as (() => void | (() => void)) | undefined
}));
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
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
  useEffect: (effect: () => void | (() => void)) => {
    mocks.effect = effect;
  }
}));
vi.mock('@/web/core/ai/model/modelData', () => ({
  getModelReadIdentity: () => (mocks.identity ? { key: mocks.identity } : undefined)
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: (selector: (state: object) => unknown) => selector({})
}));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  useUserModelStore: (selector: (state: { version: string }) => unknown) =>
    selector({ version: mocks.version })
}));

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const render = (props: Parameters<typeof useModelQuery<string[]>>[0]) => {
  mocks.index = 0;
  return useModelQuery(props);
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  mocks.states = [];
  mocks.index = 0;
  mocks.identity = 'member';
  mocks.version = 'v1';
  mocks.effect = undefined;
});

describe('useModelQuery', () => {
  it('waits for the new response when reopening the same query', async () => {
    const next = deferred<string[]>();
    const read = vi.fn().mockResolvedValueOnce(['revoked']).mockReturnValueOnce(next.promise);
    const props = { queryKey: 'list', read, observeCatalog: false };
    render(props);
    const cleanup = mocks.effect?.();
    await flush();
    expect(render(props)).toMatchObject({ data: ['revoked'], loaded: true });
    if (typeof cleanup === 'function') cleanup();
    expect(render({ ...props, enabled: false })).toMatchObject({ data: undefined, loading: false });
    mocks.effect?.();
    expect(render(props)).toMatchObject({ data: undefined, loading: true, loaded: false });
    mocks.effect?.();
    next.resolve(['allowed']);
    await flush();
    expect(render(props)).toMatchObject({ data: ['allowed'], loading: false, loaded: true });
  });

  it('does not expose a previous success when refresh fails and can retry', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(['old'])
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([]);
    const props = { queryKey: 'list', read };
    render(props);
    mocks.effect?.();
    await flush();
    render(props).refresh();
    expect(render(props).loading).toBe(true);
    mocks.effect?.();
    await flush();
    expect(render(props)).toMatchObject({
      data: undefined,
      loaded: false,
      error: new Error('offline')
    });
    render(props).refresh();
    render(props);
    mocks.effect?.();
    await flush();
    expect(render(props)).toMatchObject({ data: [], loaded: true, error: undefined });
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores a late %s after disabling and reopening',
    async (outcome) => {
      const old = deferred<string[]>();
      const read = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(['new']);
      const props = { queryKey: 'list', read };
      render(props);
      const cleanup = mocks.effect?.();
      if (typeof cleanup === 'function') cleanup();
      render({ ...props, enabled: false });
      mocks.effect?.();
      render(props);
      mocks.effect?.();
      await flush();
      if (outcome === 'resolve') old.resolve(['stale']);
      else old.reject(new Error('stale'));
      await flush();
      expect(render(props)).toMatchObject({ data: ['new'], loaded: true, error: undefined });
    }
  );

  it('does not revive an old result when returning to a previous parameter', async () => {
    const props = { queryKey: 'a', read: vi.fn().mockResolvedValue(['a']) };
    render(props);
    mocks.effect?.();
    await flush();
    expect(render(props).loaded).toBe(true);
    render({ ...props, queryKey: 'b' });
    expect(render(props)).toMatchObject({ data: undefined, loading: true });
  });

  it('hides previous identity data and waits for an available identity', async () => {
    const props = { queryKey: 'list', read: vi.fn().mockResolvedValue(['a']) };
    render(props);
    mocks.effect?.();
    await flush();
    mocks.identity = undefined;
    expect(render(props)).toMatchObject({ data: undefined, loading: true, loaded: false });
    mocks.effect?.();
    mocks.identity = 'other';
    expect(render(props)).toMatchObject({ data: undefined, loading: true });
    expect(props.read).toHaveBeenCalledTimes(1);
  });

  it('invalidates capabilities on catalog changes but lets list refreshes opt out', async () => {
    const props = { queryKey: 'detail', read: vi.fn().mockResolvedValue(['a']) };
    render(props);
    mocks.effect?.();
    await flush();
    mocks.version = 'v2';
    expect(render(props).loading).toBe(true);
    render({ ...props, observeCatalog: false });
    mocks.effect?.();
    await flush();
    mocks.version = 'v3';
    expect(render({ ...props, observeCatalog: false }).loaded).toBe(true);
  });
});
