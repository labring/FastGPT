import { getFileUploadLimits } from '@fastgpt/global/common/file/limit';
import { getRuntimeStandardPlanConfig } from '@fastgpt/global/support/wallet/sub/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';

/** 订阅团队和公开套餐配置，并使用与后端相同的优先级解析上传额度。大小单位为 MB。 */
export const useFileUploadLimits = () => {
  const { feConfigs, subPlans } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const teamPlan = teamPlanStatus?.standard;

  return getFileUploadLimits({
    teamPlan,
    plan: teamPlan?.currentSubLevel
      ? getRuntimeStandardPlanConfig({ plans: subPlans?.standard, level: teamPlan.currentSubLevel })
      : undefined,
    systemLimit: feConfigs.limit
  });
};
