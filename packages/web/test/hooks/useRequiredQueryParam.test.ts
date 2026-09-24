// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRequiredQueryParam } from '../../hooks/useRequiredQueryParam';

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  router: {
    query: {} as Record<string, string | string[]>,
    isReady: false,
    replace: vi.fn()
  }
}));

vi.mock('next/router', () => ({
  useRouter: () => mocks.router
}));

type HarnessResult = ReturnType<typeof useRequiredQueryParam>;

const TestHarness = ({
  paramKey,
  fallbackRoute,
  onResult
}: {
  paramKey: string;
  fallbackRoute?: string;
  onResult: (result: HarnessResult) => void;
}) => {
  const result = useRequiredQueryParam(paramKey, { fallbackRoute });

  React.useEffect(() => {
    onResult(result);
  }, [onResult, result]);

  return null;
};

describe('useRequiredQueryParam', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.router.isReady = false;
    mocks.router.query = {};
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('当 router.isReady 为 false 时，isReady 为 false 且不触发重定向', async () => {
    mocks.router.isReady = false;
    mocks.router.query = { datasetId: 'dataset-123' };

    let result: HarnessResult | undefined;
    await act(async () => {
      root.render(
        React.createElement(TestHarness, {
          paramKey: 'datasetId',
          fallbackRoute: '/dataset/list',
          onResult: (r) => {
            result = r;
          }
        })
      );
    });

    expect(result?.isReady).toBe(false);
    expect(result?.value).toBe('dataset-123');
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('当 router.isReady 为 true 且参数缺失时，isReady 为 false 并自动重定向到 fallbackRoute', async () => {
    mocks.router.isReady = true;
    mocks.router.query = {};

    let result: HarnessResult | undefined;
    await act(async () => {
      root.render(
        React.createElement(TestHarness, {
          paramKey: 'datasetId',
          fallbackRoute: '/dataset/list',
          onResult: (r) => {
            result = r;
          }
        })
      );
    });

    expect(result?.isReady).toBe(false);
    expect(result?.value).toBe('');
    expect(mocks.router.replace).toHaveBeenCalledWith('/dataset/list');
  });

  it('当未配置 fallbackRoute 且参数缺失时，不触发重定向', async () => {
    mocks.router.isReady = true;
    mocks.router.query = {};

    let result: HarnessResult | undefined;
    await act(async () => {
      root.render(
        React.createElement(TestHarness, {
          paramKey: 'datasetId',
          onResult: (r) => {
            result = r;
          }
        })
      );
    });

    expect(result?.isReady).toBe(false);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('当 router.isReady 为 true 且参数有效时，isReady 为 true，返回值且不重定向', async () => {
    mocks.router.isReady = true;
    mocks.router.query = { datasetId: 'ds-999' };

    let result: HarnessResult | undefined;
    await act(async () => {
      root.render(
        React.createElement(TestHarness, {
          paramKey: 'datasetId',
          fallbackRoute: '/dataset/list',
          onResult: (r) => {
            result = r;
          }
        })
      );
    });

    expect(result?.isReady).toBe(true);
    expect(result?.value).toBe('ds-999');
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('支持数组格式的 query 参数并自动提取首个元素', async () => {
    mocks.router.isReady = true;
    mocks.router.query = { datasetId: ['ds-array-1', 'ds-array-2'] };

    let result: HarnessResult | undefined;
    await act(async () => {
      root.render(
        React.createElement(TestHarness, {
          paramKey: 'datasetId',
          fallbackRoute: '/dataset/list',
          onResult: (r) => {
            result = r;
          }
        })
      );
    });

    expect(result?.isReady).toBe(true);
    expect(result?.value).toBe('ds-array-1');
  });
});
