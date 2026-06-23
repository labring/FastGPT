import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { UserError } from '@fastgpt/global/common/error/utils';

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
