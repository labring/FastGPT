import type { FastGPTTeamModeType } from '../types';

export type TeamMode = FastGPTTeamModeType;

/**
 * 统一前端投影与 Pro 业务使用的有效团队模式。
 * 部署环境配置 sync 但未接入外部用户系统；此时必须整体按 single 运行，
 * 不能只在前端 JSON 中降级，否则普通创建用户会被 Pro 业务拒绝。
 */
export const resolveEffectiveTeamMode = ({
  teamMode,
  externalUserSystemConfigured
}: {
  teamMode: TeamMode;
  externalUserSystemConfigured: boolean;
}): TeamMode => (teamMode === 'sync' && !externalUserSystemConfigured ? 'single' : teamMode);
