/** 创建/恢复失败的收敛流程；请求、cron 和跨 Provider 迁移共用同一套持久化回滚协议。 */
import type { RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../../../common/logger';
import {
  findSandboxInstanceBySandboxId,
  findStaleSandboxOperations,
  type SandboxResourceDoc
} from '../../infrastructure/instance/repository';
import { buildSandboxResourceAdapter } from '../../infrastructure/provider/adapter';
import {
  buildVolumeConfig,
  createLegacySessionVolumeClaimName,
  deleteSessionVolume,
  getSessionVolumeClaimName
} from '../../infrastructure/volume/service';
import { withSandboxLifecycleLease } from '../lease';
import {
  SANDBOX_ACTIVATION_ROLLBACK_PHASES,
  SANDBOX_OPERATION_ISOLATION_MS
} from '../../constants';
import { runSandboxLifecycleOperation, type SandboxLifecycleDefinition } from './runner';
import type { SandboxProviderType } from '../../type';
import { isSandboxActivationRollback, isSandboxActivationRecoverable } from './utils';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);
const restoreCleanupPhases = ['claimed', 'previousProviderDeleted', 'previousVolumeDeleted'];

/**
 * 在调用方已有的 Lifecycle Lease 内收敛一条刚重新读取的记录，避免重复取锁。
 * 未到接管时间原样返回；完成远端阶段时优先补交 running，否则先持久化回滚意图。
 * provisioning 保留 workspace 回到 stopped；restoring 只删除目标半成品并保留 S3。
 * 清理或终态提交失败仍保留活跃过渡态，供下次幂等续跑。
 */
export async function recoverSandboxActivationWithinLease(params: {
  resource: SandboxResourceDoc;
  lease: RedisLeaseContext;
  now?: Date;
  /** 旧 Provider 的 restore 即使已安装完成，也须回到 archived 后切换 Provider。 */
  rollbackRestore?: boolean;
}): Promise<SandboxResourceDoc> {
  const { resource, lease } = params;
  lease.assertValid();
  if (!isSandboxActivationRecoverable(resource, params.now)) return resource;
  const restoring = resource.status === 'restoring';
  const phase = resource.operation?.phase;
  const rollingBack = isSandboxActivationRollback(resource);
  const forwardPhases = restoring
    ? [...restoreCleanupPhases, 'volumeAssigned', 'archiveInstalled']
    : ['claimed', 'providerEnsured'];
  // 未知阶段禁止降级到 claimed；否则可能把已开始的清理误解释为正向恢复。
  if (
    !phase ||
    (!forwardPhases.includes(phase) &&
      !SANDBOX_ACTIVATION_ROLLBACK_PHASES.some((rollbackPhase) => rollbackPhase === phase))
  ) {
    throw new Error(`Unsupported sandbox activation recovery phase: ${phase}`);
  }

  const adapter = buildSandboxResourceAdapter(resource);
  try {
    /** Sealos 的 stopped 保留 workspace；OpenSandbox 和 restore 回滚要求计算资源不存在。 */
    const getUnreleasedProvider = async () => {
      const info = await adapter.getInfo();
      lease.assertValid();
      if (!info || info.status.state === 'UnExist') return null;
      if (!restoring && resource.provider === 'sealosdevbox' && info.status.state === 'Stopped') {
        return null;
      }
      return info;
    };
    /** 每次提交终态前重查，断点续跑不能仅凭旧清理 checkpoint 释放配额。 */
    const assertProviderReleased = async () => {
      const info = await getUnreleasedProvider();
      if (info)
        throw new Error(`Sandbox provider resource has not been released: ${info.status.state}`);
    };
    // 只查询资源，不调用 ensureRunning，避免后台恢复新建或启动计算资源。
    if (
      !rollingBack &&
      !(restoring && params.rollbackRestore) &&
      phase === (restoring ? 'archiveInstalled' : 'providerEnsured')
    ) {
      const info = await adapter.getInfo();
      lease.assertValid();
      if (info?.status.state === 'Running') {
        const completed = await runSandboxLifecycleOperation({
          resource,
          lease,
          claim: { type: 'claim', initialPhase: phase },
          definition: {
            status: resource.status,
            steps: [],
            finish: { type: 'complete', status: 'running', touchActive: true }
          }
        });
        return completed;
      }
    }

    // 旧 checkpoint 的确定性 PVC 只在有明确兼容依据时回退，并随回滚 token 持久化。
    const legacyClaimName =
      restoring &&
      resource.provider === 'opensandbox' &&
      !getSessionVolumeClaimName(resource.storage) &&
      (restoreCleanupPhases.includes(phase) || phase === 'rollbackProviderDeleted')
        ? createLegacySessionVolumeClaimName(resource.sandboxId)
        : undefined;
    // checkpoint 后也可能出现迟到的旧远端资源；重新进入已持久化的清理方向，不能只报错卡住。
    const replayProviderCleanup =
      rollingBack &&
      (phase === 'rollbackProviderReleased' || phase === 'rollbackVolumeReleased') &&
      Boolean(await getUnreleasedProvider());
    lease.assertValid();
    const definition: SandboxLifecycleDefinition = {
      status: resource.status,
      steps: [
        {
          fromPhase: 'rollbackClaimed',
          toPhase: 'rollbackProviderReleased',
          run: async ({ assertValid }) => {
            if (restoring) await adapter.delete();
            else await adapter.stop();
            assertValid();
            // OpenSandbox 按 session 查找可能存在多个物理资源；不能删掉一个就释放配额。
            await assertProviderReleased();
          }
        },
        {
          fromPhase: 'rollbackProviderReleased',
          toPhase: 'rollbackVolumeReleased',
          run: async ({ resource: claimed }) => {
            if (!restoring || claimed.provider !== 'opensandbox') return;
            const claimName = getSessionVolumeClaimName(claimed.storage);
            if (!claimName) {
              throw new Error(
                `OpenSandbox ${claimed.sandboxId} has no persisted workspace claimName`
              );
            }
            await deleteSessionVolume(claimName);
          }
        }
      ],
      finish: {
        type: 'complete',
        status: restoring ? 'archived' : 'stopped',
        beforeComplete: assertProviderReleased
      }
    };
    const completed = await runSandboxLifecycleOperation({
      resource,
      lease,
      definition,
      // 兼容旧迁移留下的 rollbackProviderDeleted；幂等重查 Provider/volume，不猜测清理结果。
      claim: {
        type: 'claim',
        initialPhase:
          !rollingBack || phase === 'rollbackProviderDeleted' || replayProviderCleanup
            ? 'rollbackClaimed'
            : undefined,
        set: legacyClaimName ? { storage: buildVolumeConfig(legacyClaimName).storage } : undefined,
        previousStatus: restoring ? 'archived' : resource.operation?.previousStatus
      }
    });
    return completed;
  } finally {
    await adapter.close().catch(() => undefined);
  }
}

/** 锁外快照只用于筛选；拿到租约后重新读取状态、Provider、generation 和 operation token。 */
export async function recoverSandboxActivation(params: {
  sandboxId: string;
  now?: Date;
  targetProvider?: SandboxProviderType;
}) {
  const initial = await findSandboxInstanceBySandboxId({ sandboxId: params.sandboxId });
  if (!initial || !isSandboxActivationRecoverable(initial, params.now)) return initial;
  return withSandboxLifecycleLease({
    sandboxId: params.sandboxId,
    label: `recover-sandbox-activation:${params.sandboxId}`,
    fn: async (lease) => {
      const current = await findSandboxInstanceBySandboxId({ sandboxId: params.sandboxId });
      if (!current) return null;
      return recoverSandboxActivationWithinLease({
        resource: current,
        lease,
        now: params.now,
        rollbackRestore:
          params.targetProvider !== undefined && current.provider !== params.targetProvider
      });
    }
  });
}

/** 按各自隔离时间回收创建/恢复失败，单条失败不影响同批其他实例。 */
export async function retryStaleSandboxActivations(now = new Date()): Promise<void> {
  const groups = await Promise.all([
    findStaleSandboxOperations({
      statuses: ['provisioning'],
      now,
      heartbeatBefore: new Date(now.getTime() - SANDBOX_OPERATION_ISOLATION_MS.provision),
      retryPhases: SANDBOX_ACTIVATION_ROLLBACK_PHASES
    }),
    findStaleSandboxOperations({
      statuses: ['restoring'],
      now,
      heartbeatBefore: new Date(now.getTime() - SANDBOX_OPERATION_ISOLATION_MS.restore),
      retryPhases: SANDBOX_ACTIVATION_ROLLBACK_PHASES
    })
  ]);
  await batchRun(groups.flat(), async (resource) => {
    await recoverSandboxActivation({ sandboxId: resource.sandboxId, now }).catch((error) => {
      logger.error('Failed to recover sandbox activation', {
        sandboxId: resource.sandboxId,
        error
      });
    });
  });
}
