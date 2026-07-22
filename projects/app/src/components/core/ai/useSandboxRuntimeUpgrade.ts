import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMemoizedFn } from 'ahooks';
import type { SandboxRuntimeStatusResponse } from '@fastgpt/global/core/ai/sandbox/type';

const RUNTIME_UPGRADE_POLL_INTERVAL_MS = 3000;

type RuntimeUpgradeReadyContext = {
  upgraded: boolean;
};

/**
 * App Chat 与 Skill Edit 共用的 runtime 升级控制器。
 *
 * 该 hook 只管理状态查询、升级、轮询和 target 切换；ready 后如何继续业务
 * 由调用方通过 onReady 决定。
 */
export const useSandboxRuntimeUpgrade = ({
  targetKey,
  getStatus,
  upgrade,
  getErrorMessage,
  onReady,
  onCheckError
}: {
  targetKey: string;
  getStatus: () => Promise<SandboxRuntimeStatusResponse>;
  upgrade: () => Promise<SandboxRuntimeStatusResponse>;
  getErrorMessage: (error: unknown) => string;
  onReady: (context: RuntimeUpgradeReadyContext) => void | Promise<void>;
  onCheckError?: (error: unknown) => void;
}) => {
  const [runtimeState, setRuntimeState] = useState<{
    targetKey: string;
    status?: SandboxRuntimeStatusResponse;
  }>({ targetKey });
  const targetKeyRef = useRef(targetKey);
  const requestVersionRef = useRef(0);
  const hasStartedUpgradeRef = useRef(false);
  const runtimeStatus = runtimeState.targetKey === targetKey ? runtimeState.status : undefined;

  const isCurrentRequest = useMemoizedFn((target: string, version: number) => {
    return targetKeyRef.current === target && requestVersionRef.current === version;
  });

  const applyStatus = useMemoizedFn(async (status: SandboxRuntimeStatusResponse) => {
    if (status.status === 'readyToInit') {
      const upgraded = hasStartedUpgradeRef.current;
      hasStartedUpgradeRef.current = false;
      setRuntimeState({ targetKey: targetKeyRef.current });
      await onReady({ upgraded });
      return;
    }

    if (status.status === 'upgrading') {
      hasStartedUpgradeRef.current = true;
    }

    setRuntimeState({
      targetKey: targetKeyRef.current,
      status
    });
  });

  const setUpgradeError = useMemoizedFn((error: unknown) => {
    setRuntimeState({
      targetKey: targetKeyRef.current,
      status: { status: 'upgradeRequired', lastError: getErrorMessage(error) }
    });
  });

  const requestRuntimeStatus = useMemoizedFn(
    async (
      request: () => Promise<SandboxRuntimeStatusResponse>,
      onError?: (error: unknown) => void
    ) => {
      const requestTarget = targetKeyRef.current;
      const requestVersion = requestVersionRef.current;
      try {
        const status = await request();
        if (isCurrentRequest(requestTarget, requestVersion)) {
          await applyStatus(status);
        }
      } catch (error) {
        if (!isCurrentRequest(requestTarget, requestVersion)) return;
        onError?.(error);
      }
    }
  );

  const checkRuntime = useMemoizedFn(() => requestRuntimeStatus(getStatus, onCheckError));

  const upgradeRuntime = useMemoizedFn(async () => {
    if (runtimeStatus?.status !== 'upgradeRequired') return;

    const requestTarget = targetKeyRef.current;
    hasStartedUpgradeRef.current = true;
    setRuntimeState({ targetKey: requestTarget, status: { status: 'upgrading' } });

    await requestRuntimeStatus(upgrade, setUpgradeError);
  });

  useLayoutEffect(() => {
    targetKeyRef.current = targetKey;
    requestVersionRef.current += 1;
    hasStartedUpgradeRef.current = false;
  }, [targetKey]);

  useEffect(() => {
    if (runtimeStatus?.status !== 'upgrading') return;

    const timer = window.setTimeout(() => {
      void requestRuntimeStatus(getStatus, setUpgradeError);
    }, RUNTIME_UPGRADE_POLL_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [getStatus, requestRuntimeStatus, runtimeStatus, setUpgradeError]);

  return {
    runtimeStatus,
    checkRuntime,
    upgradeRuntime,
    applyRuntimeStatus: applyStatus
  };
};
