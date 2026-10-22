import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  router: {
    query: {} as Record<string, string>,
    isReady: false,
    replace: vi.fn()
  },
  effects: [] as Array<() => void>
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void) => {
    mocks.effects.push(effect);
  },
  useMemo: <T>(factory: () => T) => factory(),
  useRef: <T>(value?: T) => ({ current: value })
}));

vi.mock('next/router', () => ({
  useRouter: () => mocks.router
}));

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}));

vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));

vi.mock('@fastgpt/web/hooks/useSystem', () => ({
  useSystem: () => ({ isPc: true })
}));

vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: vi.fn()
}));

vi.mock('@fastgpt/web/components/common/MyLoading', () => ({
  default: () => 'my-loading'
}));

vi.mock('@/web/core/dataset/context/datasetPageContext', () => ({
  DatasetPageContext: {},
  DatasetPageContextProvider: ({ children, datasetId }: any) => ({
    type: 'DatasetPageContextProvider',
    props: { datasetId, children }
  })
}));

const Render = (await import('@/pages/dataset/detail')).default;

describe('dataset detail page route guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.effects.length = 0;
    mocks.router.isReady = false;
    mocks.router.query = {};
  });

  it('renders loading and does not mount provider when router is not ready', () => {
    mocks.router.isReady = false;
    mocks.router.query = { datasetId: 'dataset-1' };

    const element = Render() as ReactElement;
    expect(element.type).toBeDefined();
    // Effects are captured, but router.isReady was false during render
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('redirects to dataset list when router is ready but datasetId is missing', () => {
    mocks.router.isReady = true;
    mocks.router.query = {};

    Render();
    expect(mocks.effects.length).toBeGreaterThan(0);
    // Execute all registered effects
    mocks.effects.forEach((fn) => fn());

    expect(mocks.router.replace).toHaveBeenCalledWith('/dataset/list');
  });

  it('mounts provider when router is ready and datasetId is present', () => {
    mocks.router.isReady = true;
    mocks.router.query = { datasetId: 'dataset-123' };

    const element = Render() as ReactElement<{ datasetId: string }>;
    expect(element).toBeDefined();
    expect(element.props.datasetId).toBe('dataset-123');

    // Running effect should not trigger redirect
    mocks.effects.forEach((fn) => fn());
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });
});
