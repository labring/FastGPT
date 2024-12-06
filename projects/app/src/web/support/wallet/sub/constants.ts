import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';

export const AI_POINT_USAGE_CARD_ROUTE = '/price#point-card';
export const getAiPointUsageCardRoute = () => {
  const subPlans = useSystemStore.getState().subPlans;
  return subPlans?.planDescriptionUrl
    ? getDocPath(subPlans.planDescriptionUrl)
    : AI_POINT_USAGE_CARD_ROUTE;
};

export const EXTRA_PLAN_CARD_ROUTE = '/price#extra-plan';
export const getExtraPlanCardRoute = () => {
  const subPlans = useSystemStore.getState().subPlans;
  return subPlans?.planDescriptionUrl
    ? getDocPath(subPlans.planDescriptionUrl)
    : EXTRA_PLAN_CARD_ROUTE;
};
