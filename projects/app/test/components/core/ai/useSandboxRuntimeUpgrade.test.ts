import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setRuntimeState: vi.fn()
}));

vi.mock('react', () => ({
  useEffect: vi.fn(),
  useLayoutEffect: (effect: () => void) => effect(),
  useRef: <T>(initial?: T) => ({ current: initial }),
  useState: <T>(initial?: T) => [initial, mocks.setRuntimeState]
}));
vi.mock('ahooks', () => ({
  useMemoizedFn: <T extends (...args: never[]) => unknown>(fn: T) => fn
}));

import { useSandboxRuntimeUpgrade } from '@/components/core/ai/useSandboxRuntimeUpgrade';

describe('useSandboxRuntimeUpgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates an in-flight status response when canceled', async () => {
    let resolveStatus!: (status: { status: 'readyToInit' }) => void;
    const getStatus = vi.fn(
      () =>
        new Promise<{ status: 'readyToInit' }>((resolve) => {
          resolveStatus = resolve;
        })
    );
    const onReady = vi.fn();
    const controller = useSandboxRuntimeUpgrade({
      targetKey: 'app:app-1:user-1',
      getStatus,
      upgrade: vi.fn(),
      getErrorMessage: () => 'upgrade failed',
      onReady
    });

    const pendingStatus = controller.checkRuntime();
    controller.cancelRuntimeUpgrade();
    resolveStatus({ status: 'readyToInit' });
    await pendingStatus;

    expect(onReady).not.toHaveBeenCalled();
    expect(mocks.setRuntimeState).toHaveBeenCalledTimes(1);
    expect(mocks.setRuntimeState).toHaveBeenCalledWith({ targetKey: 'app:app-1:user-1' });
  });
});
