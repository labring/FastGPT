/**
 * 沙盒业务层：提供运行态 SandboxClient。
 *
 * 负责 ensureAvailable、执行命令和文件读写等运行态用例，不承载工具调用或 Skill 部署编排。
 */
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { getLogger, LogCategories } from '../../../../../common/logger';
import {
  SandboxNotFoundError,
  type ExecuteResult,
  type ISandbox,
  type ResourceLimits,
  type SandboxCreateSpec
} from '@fastgpt-sdk/sandbox-adapter';
import type { RedisLeaseContext } from '../../../../../common/redis/lock';
import {
  getSessionVolumeConfig,
  type VolumeManagerResult
} from '../../infrastructure/volume/service';
import { buildRuntimeSandboxAdapter } from '../../infrastructure/provider/adapter';
import { getConfiguredSandboxProvider } from '../../infrastructure/provider/config';
import { ensureConnectedSandboxRunning } from '../../infrastructure/provider/lifecycle';
import { deleteSandboxResource, stopSandboxResource } from '../resource';
import {
  createSandboxProvisioningInstance,
  existsSandboxInstanceBySandboxId,
  findSandboxInstanceBySource,
  touchRunningSandboxInstance
} from '../../infrastructure/instance/repository';
import {
  SandboxInstanceStatusEnum,
  SandboxOperationTypeEnum,
  type SandboxProviderType
} from '../../type';
import { getSandboxRuntimeProfile } from '../../infrastructure/provider/runtimeProfile';
import {
  getSandboxRuntimePaths,
  resolveSandboxRuntimePath,
  type SandboxRuntimePaths
} from '../../utils';
import {
  assertSandboxRuntimeUsableWithoutRestore,
  SandboxLifecycleStateError,
  restoreArchivedSandboxBeforeUse
} from '../archive';
import { migrateSandboxProviderBeforeUse } from '../providerMigration';
import { withSandboxLifecycleLease, withSandboxSourceMutationLease } from '../lease';
import { runSandboxLifecycleOperation, type SandboxLifecycleDefinition } from '../lifecycle/runner';
import { assertSandboxSourceActive } from '../sourceGuard';
import { isRedisLeaseError } from '../../../../../common/redis/lock';
import { createAgentSandboxInitializingError } from '../../error';
import { SANDBOX_PROVISIONING_STALE_MS } from './constants';
import { resolveSandboxRuntimeImage } from './image';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export type SandboxClientQuery = {
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId?: string;
};

type SandboxClientProps = {
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId?: string;
};

type SandboxClientOptions = {
  providerName?: SandboxProviderType;
  resourceLimits?: ResourceLimits;
  vmConfig?: VolumeManagerResult | undefined;
  createConfig?: SandboxCreateSpec;
  restoreArchived?: boolean;
  allowCreate?: boolean;
  sourceGuard?: typeof assertSandboxSourceActive;
};

/**
 * 当前会话运行态 sandbox client。
 *
 * 它负责 ensureAvailable/exec 等“使用 sandbox”的语义；历史资源清理请使用
 * resource.ts 中的 stopSandboxResource/deleteSandboxResource，避免误触发 create/resume。
 */
export class SandboxClient {
  private sourceType: ChatSourceTypeEnum;
  private sourceId: string;
  private userId: string;
  private chatId?: string;
  private sandboxId: string;
  private providerName: SandboxProviderType;
  private runtimePaths: SandboxRuntimePaths;
  readonly provider: ISandbox;

  constructor(
    private readonly props: SandboxClientProps,
    private readonly opts: SandboxClientOptions = {}
  ) {
    this.sandboxId = props.sandboxId;
    this.sourceType = props.sourceType;
    this.sourceId = props.sourceId;
    this.userId = props.userId;
    this.chatId = props.chatId;

    this.providerName = opts.providerName ?? getConfiguredSandboxProvider();
    this.runtimePaths = getSandboxRuntimePaths({
      sourceType: this.sourceType,
      workDirectory: getSandboxRuntimeProfile(this.providerName).workDirectory,
      chatId: this.chatId
    });
    this.provider = buildRuntimeSandboxAdapter(this.providerName, this.sandboxId, opts);
  }

  /**
   * 确保当前运行态 sandbox 可用，并刷新实例活跃时间。
   *
   * 这个方法可能触发 provider 创建或恢复 sandbox，因此只允许运行态使用；
   * 历史资源 stop/delete 必须走 resource service，避免误创建已失效资源。
   */
  async ensureAvailable() {
    const sourceGuard = this.opts.sourceGuard ?? assertSandboxSourceActive;
    await sourceGuard({ sourceType: this.sourceType, sourceId: this.sourceId });
    const runtimeImage = resolveSandboxRuntimeImage({
      provider: this.providerName,
      sandboxId: this.sandboxId,
      createConfig: this.opts.createConfig
    });
    const instanceParams = {
      provider: this.providerName,
      sandboxId: this.sandboxId,
      sourceType: this.sourceType,
      sourceId: this.sourceId,
      userId: this.userId,
      storage: this.opts?.vmConfig?.storage,
      ...(this.opts?.resourceLimits && {
        limit: {
          cpuCount: this.opts.resourceLimits.cpuCount,
          memoryMiB: this.opts.resourceLimits.memoryMiB,
          diskGiB: this.opts.resourceLimits.diskGiB
        }
      }),
      metadata: {
        volumeEnabled: !!this.opts?.vmConfig
      }
    };
    const touched = await touchRunningSandboxInstance(instanceParams);
    let repairMissingProvider = false;
    if (touched) {
      try {
        await ensureConnectedSandboxRunning(this.provider, { allowCreate: false });
        return;
      } catch (error) {
        if (!(error instanceof SandboxNotFoundError)) throw error;
        repairMissingProvider = true;
      }
    }

    if (this.opts.allowCreate === false) {
      await assertSandboxRuntimeUsableWithoutRestore({
        provider: this.providerName,
        sandboxId: this.sandboxId
      });
      throw new Error('Sandbox runtime instance is not running');
    }

    const runProvisioning = async (lease: RedisLeaseContext, allowRecordCreate: boolean) => {
      await sourceGuard({ sourceType: this.sourceType, sourceId: this.sourceId });
      lease.assertValid();
      let current = await findSandboxInstanceBySource({
        sourceType: this.sourceType,
        sourceId: this.sourceId,
        userId: this.userId
      });
      let createdHere = false;
      if (!current) {
        if (!allowRecordCreate) {
          throw new Error('Sandbox record disappeared before lifecycle operation was claimed');
        }
        const created = await createSandboxProvisioningInstance({
          ...instanceParams,
          metadata: {
            ...instanceParams.metadata,
            ...(runtimeImage ? { image: runtimeImage } : {})
          }
        });
        current = created.instance;
        createdHere = created.created;
      }
      if (!current) throw new Error('Sandbox provisioning record was not created');
      if (current.provider !== this.providerName) {
        throw new Error(`Sandbox belongs to provider ${current.provider}`);
      }
      if (current.status === SandboxInstanceStatusEnum.running) {
        await touchRunningSandboxInstance(instanceParams);
        lease.assertValid();
        await ensureConnectedSandboxRunning(this.provider);
        lease.assertValid();
        return;
      }

      if (current.status === SandboxInstanceStatusEnum.provisioning) {
        const operation = current.metadata?.operation;
        const stale =
          operation?.heartbeatAt &&
          operation.heartbeatAt.getTime() < Date.now() - SANDBOX_PROVISIONING_STALE_MS;
        // 已记录失败的 operation 不再有活跃执行者，可立即用新的 fencing token 接管重试。
        if (!createdHere && !operation?.error && !stale) {
          throw new SandboxLifecycleStateError(current.status);
        }
      } else if (current.status !== SandboxInstanceStatusEnum.stopped) {
        throw new SandboxLifecycleStateError(current.status);
      }

      const definition: SandboxLifecycleDefinition = {
        operationType: SandboxOperationTypeEnum.provision,
        status: SandboxInstanceStatusEnum.provisioning,
        steps: [
          {
            fromPhase: 'claimed',
            toPhase: 'providerEnsured',
            run: async () => {
              await sourceGuard({ sourceType: this.sourceType, sourceId: this.sourceId });
              await ensureConnectedSandboxRunning(this.provider);
            }
          }
        ],
        finish: {
          type: 'complete',
          status: SandboxInstanceStatusEnum.running,
          touchActive: true,
          set: runtimeImage ? { 'metadata.image': runtimeImage } : undefined
        }
      };
      await runSandboxLifecycleOperation({
        resource: current,
        lease,
        definition,
        previousStatus:
          current.status === SandboxInstanceStatusEnum.stopped
            ? SandboxInstanceStatusEnum.stopped
            : current.metadata?.operation?.previousStatus,
        alreadyClaimed: createdHere
      });
    };

    // Provider 自愈与首次创建都遵守 Source -> Lifecycle 锁顺序，防止 Source 删除期间重建资源。
    const runProvisioningWithSourceLease = (params: {
      sourceLabel: string;
      lifecycleLabel: string;
      allowRecordCreate: boolean;
    }) =>
      withSandboxSourceMutationLease({
        sourceType: this.sourceType,
        sourceId: this.sourceId,
        label: params.sourceLabel,
        fn: async (sourceLease) => {
          await sourceGuard({ sourceType: this.sourceType, sourceId: this.sourceId });
          sourceLease.assertValid();
          await withSandboxLifecycleLease({
            sandboxId: this.sandboxId,
            label: params.lifecycleLabel,
            fn: (lifecycleLease) =>
              runProvisioning(
                {
                  ...lifecycleLease,
                  assertValid: () => {
                    sourceLease.assertValid();
                    lifecycleLease.assertValid();
                  }
                },
                params.allowRecordCreate
              )
          });
        }
      });

    if (repairMissingProvider) {
      await runProvisioningWithSourceLease({
        sourceLabel: `repair-missing-sandbox:${this.sandboxId}`,
        lifecycleLabel: `repair-missing-sandbox-lifecycle:${this.sandboxId}`,
        allowRecordCreate: false
      });
      return;
    }

    const existing = await findSandboxInstanceBySource({
      sourceType: this.sourceType,
      sourceId: this.sourceId,
      userId: this.userId
    });
    if (existing) {
      await withSandboxLifecycleLease({
        sandboxId: this.sandboxId,
        label: `provision-existing-sandbox:${this.sandboxId}`,
        fn: (lease) => runProvisioning(lease, false)
      });
      return;
    }

    await runProvisioningWithSourceLease({
      sourceLabel: `provision-new-sandbox:${this.sandboxId}`,
      lifecycleLabel: `provision-new-sandbox-lifecycle:${this.sandboxId}`,
      allowRecordCreate: true
    });
  }

  getSandboxId() {
    return this.sandboxId;
  }

  getContext() {
    return {
      sourceType: this.sourceType,
      sourceId: this.sourceId,
      userId: this.userId,
      chatId: this.chatId
    };
  }

  getRuntimePaths() {
    return this.runtimePaths;
  }

  /** 将调用方文件路径解析到当前会话目录，绝对路径仅允许落在 workspace 内。 */
  resolveRuntimePath(path?: string, options: { allowAbsolutePath?: boolean } = {}) {
    return resolveSandboxRuntimePath(path, this.runtimePaths, options);
  }

  /**
   * 在可用 sandbox 中执行命令。
   *
   * 执行前会先 ensureAvailable；失败时返回标准 ExecuteResult，让 workflow 能把错误当作工具输出处理。
   */
  async exec(command: string, timeout?: number): Promise<ExecuteResult> {
    try {
      await this.ensureAvailable();
    } catch (err) {
      logger.error('Failed to ensure sandbox available', { sandboxId: this.sandboxId, error: err });
      return {
        stdout: '',
        stderr: `Sandbox service is not available: ${getErrText(err)}`,
        exitCode: -1
      };
    }

    const runtimeCommand =
      this.sourceType === ChatSourceTypeEnum.app
        ? `mkdir -p ${shellQuote(this.runtimePaths.sessionWorkDirectory)} && cd ${shellQuote(
            this.runtimePaths.sessionWorkDirectory
          )} && ${command}`
        : command;

    return await this.provider
      .execute(runtimeCommand, {
        timeoutMs: timeout ? timeout * 1000 : undefined
      })
      .catch((err: unknown) => {
        logger.error('Failed to execute sandbox', { sandboxId: this.sandboxId, error: err });
        return {
          stdout: '',
          stderr: `Failed to execute sandbox: ${getErrText(err)}`,
          exitCode: -1
        };
      });
  }

  /**
   * 删除当前运行态 client 对应的资源记录和远端资源。
   */
  async delete() {
    await deleteSandboxResource({
      provider: this.providerName,
      sandboxId: this.sandboxId
    });
  }

  /** 按 provider stop 策略停止远端资源，并把本地实例状态标记为 stopped。 */
  async stop() {
    await stopSandboxResource({
      provider: this.providerName,
      sandboxId: this.sandboxId
    });
  }
}

const resolveSandboxClientProps = (props: SandboxClientQuery): SandboxClientProps => {
  if (!props.sandboxId) {
    throw new Error('sandboxId is required');
  }
  if (!props.sourceType || !props.sourceId) {
    throw new Error('sourceType and sourceId are required');
  }

  return {
    sandboxId: props.sandboxId,
    sourceType: props.sourceType,
    sourceId: props.sourceId,
    userId: props.userId,
    chatId: props.chatId
  };
};

/**
 * 检查指定运行态 sandbox 是否已有本地实例记录。
 *
 * 只读本地实例表，不连接 provider，也不触发归档恢复或远端创建。
 */
export async function checkSandboxRuntimeInstanceExists(
  props: Pick<SandboxClientQuery, 'sandboxId'>,
  opts: { providerName?: SandboxProviderType } = {}
) {
  if (!props.sandboxId) {
    throw new Error('sandboxId is required');
  }

  const providerName = opts.providerName ?? getConfiguredSandboxProvider();
  return existsSandboxInstanceBySandboxId({
    provider: providerName,
    sandboxId: props.sandboxId
  });
}

/**
 * 获取当前业务会话的运行态 sandbox client。
 *
 * 调用方必须按 sourceType/sourceId 计算 sandboxId；这里不再接收 appId 等旧业务字段，
 * 避免运行态写入或恢复时继续污染 sandbox 实例归属。
 * 返回前会准备 volume 配置并确保 sandbox 可用。
 */
export const getSandboxClient = async (
  props: SandboxClientQuery,
  opts: Omit<SandboxClientOptions, 'vmConfig'> = {}
) => {
  try {
    const sandboxClientProps = resolveSandboxClientProps(props);
    const { sandboxId, userId } = sandboxClientProps;
    const providerName = opts.providerName ?? getConfiguredSandboxProvider();
    const sourceGuard = opts.sourceGuard ?? assertSandboxSourceActive;
    let vmConfig: VolumeManagerResult | undefined;

    await sourceGuard({
      sourceType: sandboxClientProps.sourceType,
      sourceId: sandboxClientProps.sourceId
    });

    if (opts.restoreArchived === false) {
      await assertSandboxRuntimeUsableWithoutRestore({
        provider: providerName,
        sandboxId
      });
    } else {
      await migrateSandboxProviderBeforeUse({
        provider: providerName,
        sandboxId,
        sourceType: sandboxClientProps.sourceType,
        sourceId: sandboxClientProps.sourceId,
        userId
      });
      vmConfig =
        providerName === 'opensandbox' ? await getSessionVolumeConfig(sandboxId) : undefined;
      await restoreArchivedSandboxBeforeUse({
        provider: providerName,
        sandboxId,
        sourceType: sandboxClientProps.sourceType,
        sourceId: sandboxClientProps.sourceId,
        userId,
        resourceLimit: opts.resourceLimits
          ? {
              cpuCount: opts.resourceLimits.cpuCount,
              memoryMiB: opts.resourceLimits.memoryMiB,
              diskGiB: opts.resourceLimits.diskGiB
            }
          : undefined,
        vmConfig: vmConfig ?? null,
        storage: vmConfig?.storage,
        createConfig: opts.createConfig
      });
    }
    vmConfig ??=
      providerName === 'opensandbox' ? await getSessionVolumeConfig(sandboxId) : undefined;
    const sandbox = new SandboxClient(sandboxClientProps, {
      ...opts,
      providerName,
      vmConfig,
      sourceGuard,
      allowCreate: opts.allowCreate ?? opts.restoreArchived !== false
    });
    await sandbox.ensureAvailable();
    return sandbox;
  } catch (error) {
    if (isRedisLeaseError(error)) throw createAgentSandboxInitializingError();
    throw error;
  }
};
