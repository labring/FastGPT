/**
 * Sandbox 生命周期 operation runner。
 *
 * 这里统一处理所有线性生命周期操作的 durable 外壳：抢占 operation、按 phase
 * 执行远端副作用、CAS 持久化 checkpoint，以及最终提交或删除实例记录。具体的
 * Provider、S3 和 volume 逻辑仍由各业务模块通过 step 注入，避免 runner 变成第二个业务层。
 */
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { RedisLeaseContext } from '../../../../../common/redis/lock';
import {
  advanceSandboxOperation,
  claimSandboxOperation,
  completeSandboxOperation,
  deleteClaimedSandboxRecord,
  markSandboxOperationFailed,
  type SandboxResourceDoc
} from '../../infrastructure/instance/repository';
import {
  type SandboxInstanceStatusType,
  type SandboxOperationType,
  type SandboxStableStatusType
} from '../../type';

type SandboxLifecycleStepContext = {
  resource: SandboxResourceDoc;
  operationId: string;
  lease: RedisLeaseContext;
  assertValid: () => void;
};

export type SandboxLifecycleStep = {
  fromPhase: string;
  toPhase: string;
  run: (context: SandboxLifecycleStepContext) => Promise<void>;
};

type SandboxLifecycleFinish =
  | {
      type: 'complete';
      status: SandboxStableStatusType;
      touchActive?: boolean;
      set?:
        | Record<string, unknown>
        | ((context: SandboxLifecycleStepContext) => Record<string, unknown>);
    }
  | { type: 'delete' }
  | {
      type: 'custom';
      run: (context: SandboxLifecycleStepContext) => Promise<SandboxResourceDoc | null>;
    };

export type SandboxLifecycleDefinition = {
  operationType: SandboxOperationType;
  status: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>;
  steps: readonly SandboxLifecycleStep[];
  finish: SandboxLifecycleFinish;
};

export type RunSandboxLifecycleParams = {
  resource: SandboxResourceDoc;
  lease: RedisLeaseContext;
  definition: SandboxLifecycleDefinition;
  previousStatus?: SandboxStableStatusType;
  matchLastActiveAt?: boolean;
  onClaim?: (resource: SandboxResourceDoc | null) => void;
  /** 创建占位记录时 operation 已在同一条 Mongo create 中抢占。 */
  alreadyClaimed?: boolean;
  /** stop/archive 候选允许并发请求先完成抢占，其他业务默认把抢占失败视为错误。 */
  allowClaimConflict?: boolean;
  claimConflictMessage?: string;
  claimConflictError?: Error;
};

const requireOperationId = (resource: SandboxResourceDoc) => {
  const operationId = resource.metadata?.operation?.id;
  if (!operationId) {
    throw new Error(
      `Sandbox ${resource.sandboxId} has no ${resource.metadata?.operation?.type} operation`
    );
  }
  return operationId;
};

const getPhase = (resource: SandboxResourceDoc) => resource.metadata?.operation?.phase ?? 'claimed';

/**
 * 执行一条已由调用方重新读取的 Sandbox 生命周期 operation。
 *
 * 调用方负责判断当前资源是否适合进入该 operation（例如 inactive 条件或 stale
 * 隔离窗口）；runner 负责所有操作都必须遵守的 claim、checkpoint、失败和终态协议。
 */
export async function runSandboxLifecycleOperation(
  params: RunSandboxLifecycleParams
): Promise<SandboxResourceDoc | null> {
  const { resource, lease, definition } = params;
  if (
    params.alreadyClaimed &&
    (resource.status !== definition.status ||
      resource.metadata?.operation?.type !== definition.operationType)
  ) {
    throw new Error(
      `Sandbox ${resource.sandboxId} does not own the expected ${definition.operationType} operation`
    );
  }
  const claimed = params.alreadyClaimed
    ? resource
    : await claimSandboxOperation({
        resource,
        status: definition.status,
        type: definition.operationType,
        previousStatus: params.previousStatus,
        matchLastActiveAt: params.matchLastActiveAt
      });
  if (!claimed) {
    params.onClaim?.(null);
    if (!params.allowClaimConflict) {
      if (params.claimConflictError) throw params.claimConflictError;
      throw new Error(
        params.claimConflictMessage ??
          `Sandbox ${definition.operationType} operation failed to claim current record`
      );
    }
    return null;
  }
  params.onClaim?.(claimed);

  const operationId = requireOperationId(claimed);
  let phase = getPhase(claimed);
  const context = {
    resource: claimed,
    operationId,
    lease,
    assertValid: () => lease.assertValid()
  } satisfies SandboxLifecycleStepContext;

  try {
    const phases = [
      definition.steps[0]?.fromPhase ?? 'claimed',
      ...definition.steps.map((step) => step.toPhase)
    ];
    let phaseIndex = phases.indexOf(phase);
    if (phaseIndex < 0) {
      throw new Error(`Unsupported ${definition.operationType} phase: ${phase}`);
    }

    for (const [stepIndex, step] of definition.steps.entries()) {
      if (phaseIndex > stepIndex) continue;
      if (phaseIndex !== stepIndex || step.fromPhase !== phases[stepIndex]) {
        throw new Error(
          `Unsupported ${definition.operationType} phase transition: ${phase} -> ${step.toPhase}`
        );
      }

      context.assertValid();
      await step.run(context);
      context.assertValid();
      const advanced = await advanceSandboxOperation({
        resource: claimed,
        operationId,
        status: definition.status,
        phase: step.toPhase
      });
      if (!advanced) {
        throw new Error(
          `Sandbox ${definition.operationType} operation lost ownership after ${step.toPhase}`
        );
      }
      phase = step.toPhase;
      phaseIndex = stepIndex + 1;
    }

    if (definition.finish.type === 'delete') {
      const deleted = await deleteClaimedSandboxRecord({ resource: claimed, operationId });
      if (deleted.deletedCount !== 1) {
        throw new Error(
          `Sandbox ${definition.operationType} operation lost ownership before record cleanup`
        );
      }
      return null;
    }

    if (definition.finish.type === 'custom') {
      const completed = await definition.finish.run(context);
      if (!completed) {
        throw new Error(
          `Sandbox ${definition.operationType} operation lost ownership before terminal commit`
        );
      }
      return completed;
    }

    const set =
      typeof definition.finish.set === 'function'
        ? definition.finish.set({ ...context, resource: claimed })
        : definition.finish.set;
    const completed = await completeSandboxOperation({
      resource: claimed,
      operationId,
      fromStatus: definition.status,
      status: definition.finish.status,
      touchActive: definition.finish.touchActive,
      set
    });
    if (!completed) {
      throw new Error(
        `Sandbox ${definition.operationType} operation lost ownership before terminal commit`
      );
    }
    return completed;
  } catch (error) {
    await markSandboxOperationFailed({
      resource: claimed,
      operationId,
      status: definition.status,
      error: getErrText(error)
    }).catch(() => undefined);
    throw error;
  }
}
