import type {
  SandboxImageConfigType,
  SandboxRuntimeStatusResponse
} from '@fastgpt/global/core/ai/sandbox/type';
import {
  findSandboxInstanceBySandboxId,
  type SandboxResourceDoc
} from '../../infrastructure/instance/repository';
import type { SandboxProviderType } from '../../type';
import { SandboxInstanceStatusEnum } from '../../constants';
import { startSandboxRuntimeUpgradeArchive } from '../archive';
import { createSandboxRuntimeUpgradeFailedError } from '../../error';
import type { SandboxClientQuery } from './type';
import { isSandboxActivationRecoverable, canResumeSandboxOperation } from '../lifecycle/utils';
import { isSandboxRuntimeImageMatched } from './image';

export type SandboxRuntimeUpgradeTarget = {
  sandboxId: string;
  targetProvider: SandboxProviderType;
  targetImage?: SandboxImageConfigType;
  statusInstance?: SandboxResourceDoc | null;
  upgradeInstance?: SandboxResourceDoc | null;
};

/** 判断生命周期状态是否正在占用 runtime，调用方只能轮询，不能并发连接实例。 */
export const isSandboxRuntimeUpgradeBusyState = (state?: string) =>
  state === SandboxInstanceStatusEnum.archiving ||
  state === SandboxInstanceStatusEnum.deleting ||
  state === SandboxInstanceStatusEnum.restoring ||
  state === SandboxInstanceStatusEnum.stopping ||
  state === SandboxInstanceStatusEnum.provisioning ||
  state === SandboxInstanceStatusEnum.legacyMigrating;

/**
 * 从同一 source 的 sandbox-instance 记录中选择状态展示实例和可归档实例。
 * 当前 provider 优先；跨 provider 记录仅用于迁移中的状态延续与旧镜像归档。
 */
export function resolveSandboxRuntimeUpgradeTarget({
  sandboxId,
  targetProvider,
  targetImage,
  instances
}: {
  sandboxId: string;
  targetProvider: SandboxProviderType;
  targetImage?: SandboxImageConfigType;
  instances: SandboxResourceDoc[];
}): SandboxRuntimeUpgradeTarget {
  const currentProviderInstances = instances.filter(
    (instance) => instance.provider === targetProvider
  );
  const invalidCurrentInstance = currentProviderInstances.find(
    (instance) => instance.sandboxId !== sandboxId
  );
  if (invalidCurrentInstance) {
    throw new Error(
      `Sandbox runtime identity mismatch: expected ${sandboxId}, received ${invalidCurrentInstance.sandboxId}`
    );
  }

  const currentInstance = currentProviderInstances.find(
    (instance) => instance.sandboxId === sandboxId
  );
  const staleInstances = instances.filter((instance) => instance.provider !== targetProvider);
  const isStableInstance = (instance: SandboxResourceDoc) =>
    instance.status === SandboxInstanceStatusEnum.running ||
    instance.status === SandboxInstanceStatusEnum.stopped;
  const isOutdatedStableInstance = (instance: SandboxResourceDoc) =>
    isStableInstance(instance) && !isSandboxRuntimeImageMatched(targetImage, instance.image);
  const isFailedArchivePrerequisite = (instance: SandboxResourceDoc) =>
    canResumeSandboxOperation(instance) &&
    (instance.status === SandboxInstanceStatusEnum.stopping ||
      instance.status === SandboxInstanceStatusEnum.archiving);
  const canStartRuntimeUpgradeArchive = (instance: SandboxResourceDoc) =>
    isOutdatedStableInstance(instance) || isFailedArchivePrerequisite(instance);
  const statusInstance =
    currentInstance ??
    staleInstances.find((instance) => isSandboxRuntimeUpgradeBusyState(instance.status)) ??
    staleInstances.find((instance) => Boolean(instance.operation?.error)) ??
    staleInstances.find((instance) => instance.status === SandboxInstanceStatusEnum.archived) ??
    staleInstances.find(isStableInstance);
  const upgradeInstance =
    currentInstance && canStartRuntimeUpgradeArchive(currentInstance)
      ? currentInstance
      : staleInstances.find(canStartRuntimeUpgradeArchive);

  return {
    sandboxId,
    targetProvider,
    targetImage,
    statusInstance,
    upgradeInstance
  };
}

const buildRuntimeStatusResponse = (
  status: SandboxRuntimeStatusResponse['status'],
  lastError?: string
): SandboxRuntimeStatusResponse => ({ status, ...(lastError ? { lastError } : {}) });

/**
 * 解释 runtime 镜像和实例生命周期，不执行创建、恢复或归档副作用。
 *
 * archived 已经保存完整 workspace，可以直接视为 ready；下一次真实使用会用目标镜像恢复。
 */
export function getSandboxRuntimeUpgradeStatus(
  context: SandboxRuntimeUpgradeTarget
): SandboxRuntimeStatusResponse {
  const { targetImage, statusInstance } = context;
  const lifecycleStatus = statusInstance?.status;
  const operationError = statusInstance?.operation?.error;
  const isRuntimeImageOutdated =
    !!statusInstance && !isSandboxRuntimeImageMatched(targetImage, statusInstance.image ?? null);
  const canRecoverActivation = statusInstance && isSandboxActivationRecoverable(statusInstance);

  if (statusInstance && lifecycleStatus === SandboxInstanceStatusEnum.restoring) {
    // 所有入口先收敛已有回滚；旧 Provider 的半成品回到 archived 后再迁移。
    if (canRecoverActivation) {
      return buildRuntimeStatusResponse('readyToInit');
    }
    return buildRuntimeStatusResponse('upgrading');
  }

  if (statusInstance && lifecycleStatus === SandboxInstanceStatusEnum.provisioning) {
    if (canRecoverActivation) {
      return buildRuntimeStatusResponse('readyToInit');
    }
    return buildRuntimeStatusResponse('upgrading', operationError);
  }

  if (
    statusInstance &&
    (lifecycleStatus === SandboxInstanceStatusEnum.stopping ||
      lifecycleStatus === SandboxInstanceStatusEnum.archiving)
  ) {
    return canResumeSandboxOperation(statusInstance)
      ? buildRuntimeStatusResponse('upgradeRequired', operationError)
      : buildRuntimeStatusResponse('upgrading', operationError);
  }

  if (statusInstance && isSandboxRuntimeUpgradeBusyState(lifecycleStatus)) {
    // deleting 与 legacyMigrating 必须由原业务重试，runtime upgrade 不得改写其 phase。
    return buildRuntimeStatusResponse('upgrading', operationError);
  }

  if (
    !statusInstance ||
    lifecycleStatus === SandboxInstanceStatusEnum.archived ||
    !isRuntimeImageOutdated
  ) {
    return buildRuntimeStatusResponse('readyToInit');
  }

  return buildRuntimeStatusResponse('upgradeRequired');
}

/** 配置准备复用运行编排，状态展示不再决定恢复或迁移。 */
export async function ensureAppSandboxRuntimeReady(params: {
  query: SandboxClientQuery;
  onUpgrade?: () => void;
}): Promise<boolean> {
  const { ensureSandboxRuntimeConfiguration } = await import('./service');
  let upgraded = false;
  await ensureSandboxRuntimeConfiguration({
    query: params.query,
    onUpgrade: () => {
      if (upgraded) return;
      upgraded = true;
      params.onUpgrade?.();
    }
  }).catch((error) => {
    throw createSandboxRuntimeUpgradeFailedError(error);
  });
  return upgraded;
}

/** 恢复失败的前置 stop 并启动镜像升级归档；抢占失败时返回重新读取的真实状态。 */
export async function triggerSandboxRuntimeUpgrade(
  context: SandboxRuntimeUpgradeTarget
): Promise<SandboxRuntimeStatusResponse> {
  const status = getSandboxRuntimeUpgradeStatus(context);
  if (status.status !== 'upgradeRequired') {
    return status;
  }

  const runtimeUpgradeInstance = context.upgradeInstance;
  if (!runtimeUpgradeInstance) return status;

  if (runtimeUpgradeInstance.status === SandboxInstanceStatusEnum.stopping) {
    // 只在失败 stop 的用户重试分支加载资源编排，状态查询不得初始化 lifecycle infra。
    const { stopSandboxResource } = await import('../resource');
    await stopSandboxResource(runtimeUpgradeInstance);
  }

  const started = await startSandboxRuntimeUpgradeArchive(runtimeUpgradeInstance);
  if (started.success) return buildRuntimeStatusResponse('upgrading');

  // 并发请求可能已经推进或完成归档，失败时重新读取，不能伪造 upgrading。
  const current = await findSandboxInstanceBySandboxId({
    sandboxId: runtimeUpgradeInstance.sandboxId
  });
  return getSandboxRuntimeUpgradeStatus({
    ...context,
    statusInstance: current,
    upgradeInstance: current
  });
}
