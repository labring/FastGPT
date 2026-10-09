/**
 * 检查 Sandbox 激活配额。
 * Mongo 活跃实例数是唯一计数来源；检查与后续写入之间允许存在并发窗口。
 */
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getAgentSandboxMax, getAgentSandboxMaxPerTeam } from '../config';
import {
  countActiveSandboxInstances,
  backfillSandboxInstanceTeamId,
  findSandboxInstanceBySource
} from '../infrastructure/instance/repository';
import { isSandboxActiveStatus, type SandboxProviderType } from '../type';
import {
  createAgentSandboxLimitReachedError,
  createAgentSandboxTeamLimitReachedError
} from '../error';
import { resolveSandboxSourceTeamId } from './sourceGuard';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export type SandboxQuotaIdentity = {
  provider: SandboxProviderType;
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
};

/**
 * 激活前检查系统及团队 Quota，并惰性补齐历史记录 teamId（只补不覆盖，失败仅告警）。
 * 活跃记录返回 undefined；其余返回 source 团队归属供新建/恢复写入，超限抛业务错误。
 * Mongo 查询错误原样传播；检查与后续写入不是原子操作，允许并发短暂超额。
 */
export async function checkSandboxQuota(
  identity: SandboxQuotaIdentity
): Promise<{ teamId?: string } | undefined> {
  // 已活跃的实例已包含在计数中，无需再次检查 Quota。
  const current = await findSandboxInstanceBySource({
    sourceType: identity.sourceType,
    sourceId: identity.sourceId,
    userId: identity.userId
  });
  if (current && isSandboxActiveStatus(current.status)) return;

  const teamId = await resolveSandboxSourceTeamId({
    sourceType: identity.sourceType,
    sourceId: identity.sourceId
  });
  // 系统和团队共用活跃状态口径，系统上限先于团队上限检查。
  const systemLimit = getAgentSandboxMax();
  if (systemLimit !== undefined && (await countActiveSandboxInstances()) >= systemLimit) {
    throw createAgentSandboxLimitReachedError();
  }
  const teamLimit = getAgentSandboxMaxPerTeam();
  if (
    teamLimit !== undefined &&
    teamId &&
    (await countActiveSandboxInstances({ teamId })) >= teamLimit
  ) {
    throw createAgentSandboxTeamLimitReachedError();
  }

  // 历史归属回填失败不阻断本次激活，后续激活或存量迁移仍可重试。
  if (current && !current.teamId && teamId) {
    await backfillSandboxInstanceTeamId({
      provider: identity.provider,
      sandboxId: identity.sandboxId,
      teamId
    }).catch((error) => {
      logger.warn('Failed to backfill sandbox instance teamId', {
        sandboxId: identity.sandboxId,
        teamId,
        error
      });
    });
  }
  return { teamId };
}
