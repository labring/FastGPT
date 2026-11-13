/** 创建/启动失败的收敛流程；请求与 cron 共用同一套持久化回滚协议。 */
import { RedisLeaseUnavailableError, type RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { serviceEnv } from '../../../../../env';
import { getLogger, LogCategories } from '../../../../../common/logger';
import {
  findSandboxInstanceBySandboxId,
  findStaleSandboxOperations,
  type SandboxResourceDoc
} from '../../infrastructure/instance/repository';
import { createOpenSandboxResourceClient } from '../../infrastructure/opensandbox/opensandbox';
import {
  getSessionVolumeClaimName,
  unmountSessionVolume
} from '../../infrastructure/volume/service';
import { withSandboxLifecycleLease } from '../lease';
import { SANDBOX_ACTIVATION_ROLLBACK_PHASES, SANDBOX_OPERATION_STALE_MS } from '../../constants';
import { runSandboxLifecycleOperation, type SandboxLifecycleDefinition } from './runner';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);
const forwardPhases = ['claimed', 'providerEnsured'] as const;

/** 回滚方向由持久化 phase 决定，不从错误文本推断。 */
const isSandboxActivationRollback = (resource: SandboxResourceDoc) =>
  SANDBOX_ACTIVATION_ROLLBACK_PHASES.some((phase) => phase === resource.operation?.phase);

/** 判断实例是否处于需要收敛的 `provisioning` 过渡态。 */
const isSandboxActivationRecoverable = (
  resource: SandboxResourceDoc
): resource is SandboxResourceDoc & { status: 'provisioning' } =>
  resource.status === 'provisioning';

/**
 * 在调用方已持有的 Lifecycle Lease 内立即收敛一条刚重新读取的 `provisioning` 记录，避免重复取锁。
 *
 * 完成远端阶段且容器仍 `Running` 时优先补交 `running`，否则先持久化回滚意图、释放计算资源并保留 workspace 持久卷回到 `stopped`。
 * 清理或终态提交失败仍保留活跃过渡态，供下次幂等续跑。
 */
export async function recoverSandboxActivationWithinLease(params: {
  resource: SandboxResourceDoc;
  lease: RedisLeaseContext;
}): Promise<SandboxResourceDoc> {
  const { resource, lease } = params;
  lease.assertValid();
  if (!isSandboxActivationRecoverable(resource)) return resource;

  const phase = resource.operation?.phase;
  const rollingBack = isSandboxActivationRollback(resource);
  // 未知阶段禁止降级到 claimed；否则可能把已开始的清理误解释为正向恢复。
  if (
    !phase ||
    (!forwardPhases.some((forwardPhase) => forwardPhase === phase) &&
      !SANDBOX_ACTIVATION_ROLLBACK_PHASES.some((rollbackPhase) => rollbackPhase === phase))
  ) {
    throw new Error(`Unsupported sandbox activation recovery phase: ${phase}`);
  }

  const client = await createOpenSandboxResourceClient(resource);
  try {
    const getUnreleasedSandbox = async () => {
      const info = await client.getInfo();
      lease.assertValid();
      if (!info || info.status.state === 'UnExist') return null;
      return info;
    };
    const assertSandboxReleased = async () => {
      const info = await getUnreleasedSandbox();
      if (info) {
        throw new Error(`OpenSandbox resource has not been released: ${info.status.state}`);
      }
    };

    // 只查询资源，不调用 ensureRunning，避免后台恢复新建或启动计算资源。
    if (!rollingBack && phase === 'providerEnsured') {
      const info = await client.getInfo();
      lease.assertValid();
      const resolvedInstanceId = info?.id?.trim() || resource.instanceId?.trim();
      if (info?.status.state === 'Running' && resolvedInstanceId) {
        return await runSandboxLifecycleOperation({
          resource,
          lease,
          claim: { type: 'claim', initialPhase: phase },
          definition: {
            status: 'provisioning',
            steps: [],
            finish: {
              type: 'complete',
              status: 'running',
              touchActive: true,
              set: { instanceId: resolvedInstanceId }
            }
          }
        });
      }
    }

    const replaySandboxCleanup =
      rollingBack && phase === 'rollbackProviderReleased' && Boolean(await getUnreleasedSandbox());
    lease.assertValid();

    const definition: SandboxLifecycleDefinition = {
      status: 'provisioning',
      steps: [
        {
          fromPhase: 'rollbackClaimed',
          toPhase: 'rollbackProviderReleased',
          run: async ({ resource: claimed, assertValid }) => {
            // 1. 销毁远端容器并确认计算资源已释放，保证单写者约束。
            await client.delete();
            assertValid();
            await assertSandboxReleased();

            // 2. Docker 模式下尽力卸载空闲会话卷 FUSE 进程；临时异常仅记告警，不阻断 Mongo 回滚到 stopped。
            if (serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'docker') {
              const claimName = getSessionVolumeClaimName(claimed.storage);
              if (claimName) {
                await unmountSessionVolume(claimName).catch((error) => {
                  logger.warn('Failed to unmount sandbox volume during activation rollback', {
                    sandboxId: claimed.sandboxId,
                    claimName,
                    error
                  });
                });
              }
            }
          }
        }
      ],
      finish: {
        type: 'complete',
        status: 'stopped',
        beforeComplete: assertSandboxReleased
      }
    };

    return await runSandboxLifecycleOperation({
      resource,
      lease,
      definition,
      claim: {
        type: 'claim',
        initialPhase: !rollingBack || replaySandboxCleanup ? 'rollbackClaimed' : undefined
      }
    });
  } finally {
    await client.close().catch(() => {});
  }
}

/**
 * 后台恢复单条中断的 `provisioning` 记录。
 *
 * 采用非阻塞 `waitTimeoutMs: 0` 获取租约：若在途前台请求仍持有自动续租的 Lifecycle Lease，
 * 立即抛出 `RedisLeaseUnavailableError` 交由上层跳过，绝不阻塞或抢占活跃请求。
 */
export async function recoverSandboxActivation(params: { sandboxId: string }) {
  const initial = await findSandboxInstanceBySandboxId({ sandboxId: params.sandboxId });
  if (!initial || !isSandboxActivationRecoverable(initial)) return initial;
  return withSandboxLifecycleLease({
    sandboxId: params.sandboxId,
    label: `recover-sandbox-activation:${params.sandboxId}`,
    waitTimeoutMs: 0,
    fn: async (lease) => {
      const current = await findSandboxInstanceBySandboxId({ sandboxId: params.sandboxId });
      if (!current) return null;
      return recoverSandboxActivationWithinLease({
        resource: current,
        lease
      });
    }
  });
}

/** 回收创建中断的实例；仍在途的活跃任务命中租约占用时静默跳过，单条异常不影响同批其他实例。 */
export async function retryStaleSandboxActivations(now = new Date()): Promise<void> {
  const candidates = await findStaleSandboxOperations({
    statuses: ['provisioning'],
    retryPhases: SANDBOX_ACTIVATION_ROLLBACK_PHASES,
    heartbeatBefore: new Date(now.getTime() - SANDBOX_OPERATION_STALE_MS)
  });

  await batchRun(candidates, async (resource) => {
    await recoverSandboxActivation({ sandboxId: resource.sandboxId }).catch((error) => {
      if (error instanceof RedisLeaseUnavailableError) return;
      logger.error('Failed to recover stale sandbox activation', {
        sandboxId: resource.sandboxId,
        status: resource.status,
        phase: resource.operation?.phase,
        error
      });
    });
  });
}
