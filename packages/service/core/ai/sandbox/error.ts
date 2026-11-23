/**
 * 沙盒模块错误工厂。
 *
 * 统一把 sandbox 业务错误转换成 UserError，不承载 provider 或数据库逻辑。
 */
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { getErrText, UserError } from '@fastgpt/global/common/error/utils';

/** 表示 keepalive 等禁止创建的路径没有可继续使用的 running sandbox。 */
export class SandboxRuntimeNotRunningError extends Error {
  constructor(readonly sandboxId: string) {
    super('Sandbox runtime instance is not running');
    this.name = 'SandboxRuntimeNotRunningError';
  }
}

/**
 * 生成 Agent 虚拟机权限错误。
 *
 * 该错误表示团队套餐或管理员配置不允许当前应用使用虚拟机，属于业务权限拒绝，
 * 需要和 provider 内部文件权限、命令权限等通用 PERMISSION_DENIED 区分。
 */
export const createAgentSandboxPermissionDeniedError = () =>
  new UserError(SandboxErrEnum.agentSandboxPermissionDenied);

/**
 * 生成 Agent 虚拟机运行态初始化占用错误。
 *
 * 该错误表示同一个 sandbox 正在执行文件/skill/entrypoint reconcile。本轮不能无锁继续，
 * 否则可能重新引入 skill 目录清理与扫描交错问题。
 */
export const createAgentSandboxInitializingError = () =>
  new UserError(SandboxErrEnum.agentSandboxInitializing);

/** 将底层迁移异常转换为可展示且经过敏感信息替换的用户错误。 */
export const createSandboxRuntimeUpgradeFailedError = (error: unknown) =>
  new UserError(getErrText(error, SandboxErrEnum.runtimeUpgradeFailed));

/**
 * 生成沙箱活跃实例系统总上限拒绝错误。
 *
 * 表示平台级 Quota 已满（app 会话与技能编辑共用计数池），需要等待其他沙箱停止/归档后重试。
 */
export const createAgentSandboxLimitReachedError = () =>
  new UserError(SandboxErrEnum.agentSandboxLimitReached);

/** 生成团队沙箱配额拒绝错误：当前团队的活跃沙箱实例已达配额上限。 */
export const createAgentSandboxTeamLimitReachedError = () =>
  new UserError(SandboxErrEnum.agentSandboxTeamLimitReached);

/**
 * 判定“远端已明确结束”的沙箱失败（容器非 0 退出、配额拒绝等）。
 *
 * 这类失败不是执行者失联导致的未知结果，重试语义明确，不需要再等操作隔离窗口；
 * 若仍按隔离窗口（provision 5 分钟）阻塞，会在用户侧表现为
 * “沙箱启动失败后一段时间内怎么点都失败、过一会儿又突然好了”。
 */
const SETTLED_SANDBOX_FAILURE_PATTERNS = [
  'KUBERNETES::POD_FAILED',
  'primary reason=ContainerFailed',
  'primary reason=InitContainerFailed',
  'container sandbox exited with code',
  'KUBERNETES::QUOTA_EXCEEDED'
];

export const isSettledSandboxFailure = (error: unknown) => {
  const message = getErrText(error, '');
  return SETTLED_SANDBOX_FAILURE_PATTERNS.some((pattern) => message.includes(pattern));
};
