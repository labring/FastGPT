import { generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { serviceEnv } from '../../../../env';
import { getLogger, LogCategories } from '../../../../common/logger';
import {
  type ExecuteResult,
  type ISandbox,
  type ResourceLimits,
  type SandboxCreateSpec
} from '@fastgpt-sdk/sandbox-adapter';
import { getSessionVolumeConfig, type VolumeManagerResult } from '../volume/service';
import { buildRuntimeSandboxAdapter } from '../provider/adapter';
import { ensureConnectedSandboxRunning } from '../provider/lifecycle';
import { deleteSandboxResource, stopSandboxResource } from './resource';
import { upsertRunningSandboxInstance } from '../instance/repository';
import type { SandboxProviderType } from '../type';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

type UnionIdType = {
  appId: string;
  userId: string;
  chatId: string;
  teamId?: string;
};

type SandboxClientProps = {
  sandboxId: string;
  appId?: string;
  userId?: string;
  chatId?: string;
  teamId?: string;
};

type SandboxClientOptions = {
  providerName?: SandboxProviderType;
  resourceLimits?: ResourceLimits;
  vmConfig?: VolumeManagerResult | undefined;
  createConfig?: SandboxCreateSpec;
};

/**
 * 当前会话运行态 sandbox client。
 *
 * 它负责 ensureAvailable/exec 等“使用 sandbox”的语义；历史资源清理请使用
 * resource.ts 中的 stopSandboxResource/deleteSandboxResource，避免误触发 create/resume。
 */
export class SandboxClient {
  private appId?: string;
  private userId?: string;
  private chatId?: string;
  private sandboxId: string;
  private providerName: SandboxProviderType;
  readonly provider: ISandbox;

  constructor(
    private readonly props: SandboxClientProps,
    private readonly opts: SandboxClientOptions = {}
  ) {
    this.sandboxId = props.sandboxId;
    this.appId = props.appId;
    this.userId = props.userId;
    this.chatId = props.chatId;

    this.providerName = opts.providerName ?? serviceEnv.AGENT_SANDBOX_PROVIDER;
    this.provider = buildRuntimeSandboxAdapter(this.providerName, this.sandboxId, opts);
  }

  /**
   * 确保当前运行态 sandbox 可用，并刷新实例活跃时间。
   *
   * 这个方法可能触发 provider 创建或恢复 sandbox，因此只允许运行态使用；
   * 历史资源 stop/delete 必须走 resource service，避免误创建已失效资源。
   */
  async ensureAvailable() {
    // 先写 running 记录是有意设计：运行态入口需要先占位并暴露资源归属，
    // 后续 provider ready 检查失败时会由调用方返回错误，后台兜底检查/cron 再修正不可用实例。
    await upsertRunningSandboxInstance({
      provider: this.providerName,
      sandboxId: this.sandboxId,
      appId: this.appId,
      userId: this.userId,
      chatId: this.chatId,
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
    });
    await ensureConnectedSandboxRunning(this.provider);
  }

  getSandboxId() {
    return this.sandboxId;
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

    return await this.provider
      .execute(command, {
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

  /**
   * 暂停当前运行态 client 对应的远端资源，并把实例状态标记为 stopped。
   */
  async stop() {
    await stopSandboxResource({
      provider: this.providerName,
      sandboxId: this.sandboxId
    });
  }
}

function resolveSandboxId(props: { sandboxId: string } | UnionIdType): string {
  if ('sandboxId' in props) {
    return props.sandboxId;
  }

  const sandboxUserId = props.chatId === 'edit-debug' ? '' : props.userId;
  return generateSandboxId(props.appId, sandboxUserId, props.chatId);
}

/**
 * 获取当前业务会话的运行态 sandbox client。
 *
 * 传入 sandboxId 时直接使用指定实例；传入 app/user/chat 三元组时使用稳定规则生成 sandboxId。
 * 返回前会准备 volume 配置并确保 sandbox 可用。
 */
export const getSandboxClient = async (
  props:
    | {
        sandboxId: string;
        teamId?: string;
      }
    | UnionIdType,
  opts: {
    providerName?: SandboxProviderType;
    resourceLimits?: ResourceLimits;
    createConfig?: SandboxCreateSpec;
  } = {}
) => {
  const sandboxId = resolveSandboxId(props);

  const vmConfig = await getSessionVolumeConfig(sandboxId);

  const sandbox = new SandboxClient({ ...props, sandboxId }, { ...opts, vmConfig });
  await sandbox.ensureAvailable();
  return sandbox;
};
