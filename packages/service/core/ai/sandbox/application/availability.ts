import { SandboxUnavailableReasonEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { getLogger, LogCategories } from '../../../../common/logger';
import { checkTeamSandboxPermission } from '../../../../support/permission/teamLimit';
import { createAgentSandboxPermissionDeniedError } from '../error';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export type AppSandboxAvailability =
  | { available: true }
  | {
      available: false;
      reason: SandboxUnavailableReasonEnum;
    };

/**
 * 判断普通 App Chat 本轮能否启用 Sandbox。
 *
 * 系统和应用开关优先于套餐查询，避免关闭状态下产生无意义的权限请求。
 * 套餐查询异常统一视为套餐不可用，由调用方静默降级，不能中断普通对话。
 */
export async function resolveAppSandboxAvailability({
  appEnabled,
  teamId
}: {
  appEnabled: boolean;
  teamId: string;
}): Promise<AppSandboxAvailability> {
  if (!global.feConfigs?.show_agent_sandbox) {
    logger.info('App sandbox unavailable', {
      reason: SandboxUnavailableReasonEnum.systemDisabled
    });
    return {
      available: false,
      reason: SandboxUnavailableReasonEnum.systemDisabled
    };
  }

  if (!appEnabled) {
    logger.info('App sandbox unavailable', {
      reason: SandboxUnavailableReasonEnum.appDisabled
    });
    return {
      available: false,
      reason: SandboxUnavailableReasonEnum.appDisabled
    };
  }

  try {
    await checkTeamSandboxPermission(teamId);
    return { available: true };
  } catch {
    logger.info('App sandbox unavailable', {
      reason: SandboxUnavailableReasonEnum.teamPlanUnavailable
    });
    return {
      available: false,
      reason: SandboxUnavailableReasonEnum.teamPlanUnavailable
    };
  }
}

/**
 * 断言强依赖场景可以使用 Sandbox。
 *
 * Skill Edit、调试和显式 Sandbox API 不允许静默降级，系统关闭或套餐无权限时统一抛出
 * Sandbox 权限错误；普通 App Chat 应使用 resolveAppSandboxAvailability。
 */
export async function assertSandboxAvailable(teamId: string): Promise<void> {
  if (!global.feConfigs?.show_agent_sandbox) {
    throw createAgentSandboxPermissionDeniedError();
  }

  try {
    await checkTeamSandboxPermission(teamId);
  } catch {
    throw createAgentSandboxPermissionDeniedError();
  }
}
