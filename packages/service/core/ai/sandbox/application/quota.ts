/**
 * 检查 Sandbox 激活配额。
 * Mongo 活跃实例数是唯一计数来源；检查与后续写入之间允许存在并发窗口。
 */
import { getAgentSandboxMax, getAgentSandboxMaxPerTeam } from '../config';
import {
  countActiveSandboxInstances,
  type SandboxResourceDoc
} from '../infrastructure/instance/repository';
import { isSandboxActiveStatus } from '../type';
import {
  createAgentSandboxLimitReachedError,
  createAgentSandboxTeamLimitReachedError
} from '../error';

/**
 * 对已经确定团队归属的实例检查系统及团队 Quota。
 * 活跃记录跳过重复准入检查；非活跃实例超限抛业务错误。
 * Mongo 查询错误原样传播；检查与后续写入不是原子操作，允许并发超额。
 */
export async function checkSandboxQuota(identity: {
  teamId: string;
  current: SandboxResourceDoc | null;
}): Promise<void> {
  const current = identity.current;
  // 已占用配额的实例继续使用，不因当前配额已满而中断。
  if (current && isSandboxActiveStatus(current.status)) return;

  // 系统和团队共用活跃状态口径，系统上限先于团队上限检查。
  const systemLimit = getAgentSandboxMax();
  if (systemLimit !== undefined && (await countActiveSandboxInstances()) >= systemLimit) {
    throw createAgentSandboxLimitReachedError();
  }
  const teamLimit = getAgentSandboxMaxPerTeam();
  if (
    teamLimit !== undefined &&
    (await countActiveSandboxInstances({ teamId: identity.teamId })) >= teamLimit
  ) {
    throw createAgentSandboxTeamLimitReachedError();
  }
}
