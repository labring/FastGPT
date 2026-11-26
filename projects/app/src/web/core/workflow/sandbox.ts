import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { WorkflowSandboxCheckData } from './check/resource';

/** 每次检查读取当前系统和套餐快照，避免已打开的预览继续沿用旧沙盒能力。 */
export const getWorkflowSandboxCheckData = (): WorkflowSandboxCheckData => {
  const { feConfigs } = useSystemStore.getState();
  const { teamPlanStatus } = useUserStore.getState();
  return {
    showSandbox: feConfigs.show_agent_sandbox,
    enableSandbox: !teamPlanStatus?.standard || !!teamPlanStatus.standard.enableSandbox
  };
};
