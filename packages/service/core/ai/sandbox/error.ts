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
