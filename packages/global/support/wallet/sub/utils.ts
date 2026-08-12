import { StandardSubLevelEnum } from './constants';
import type { StandSubPlanLevelMapType, SubPlanType, TeamStandardSubPlanItemType } from './type';

/**
 * 获取套餐运行时生效配置。定制套餐只存覆盖项，缺失权益统一继承高级版。
 * 该函数仅合并内存数据，不承担配置清洗或持久化转换。
 */
export const getRuntimeStandardPlanConfig = ({
  plans,
  level
}: {
  plans?: StandSubPlanLevelMapType;
  level: `${StandardSubLevelEnum}`;
}): TeamStandardSubPlanItemType | undefined => {
  const plan = plans?.[level];
  if (level !== StandardSubLevelEnum.custom) return plan;

  const advancedPlan = plans?.[StandardSubLevelEnum.advanced];
  if (!plan || !advancedPlan) return;

  const configuredOverrides = Object.fromEntries(
    Object.entries(plan).filter(([, value]) => value !== undefined)
  );
  return { ...advancedPlan, ...configuredOverrides };
};

/** 返回可直接用于运行时和客户端展示的套餐配置，不修改原始系统配置。 */
export const getRuntimeSubPlansConfig = (subPlans?: SubPlanType): SubPlanType | undefined => {
  const customPlan = getRuntimeStandardPlanConfig({
    plans: subPlans?.standard,
    level: StandardSubLevelEnum.custom
  });
  if (!subPlans?.standard?.custom || !customPlan) return subPlans;

  return {
    ...subPlans,
    standard: {
      ...subPlans.standard,
      [StandardSubLevelEnum.custom]: customPlan
    }
  };
};
