import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';

export const getAgentSandboxCapability = ({
  showAgentSandbox,
  teamPlanStatus
}: {
  showAgentSandbox?: boolean;
  teamPlanStatus?: { standard?: { enableSandbox?: boolean } } | null;
}) => {
  const showSandbox = Boolean(showAgentSandbox);
  const enableSandbox = !teamPlanStatus?.standard || Boolean(teamPlanStatus.standard.enableSandbox);

  return {
    showSandbox,
    enableSandbox,
    canUseSandbox: showSandbox && enableSandbox
  };
};

/** 统一判定当前实例与团队套餐的虚拟机能力，避免表单、工作流、@菜单与辅助生成各自维护规则。 */
export const useAgentSandboxCapability = () => {
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();

  return getAgentSandboxCapability({
    showAgentSandbox: feConfigs?.show_agent_sandbox,
    teamPlanStatus
  });
};
