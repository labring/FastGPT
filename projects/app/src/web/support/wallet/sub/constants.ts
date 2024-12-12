import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';

export const EXTRA_PLAN_CARD_ROUTE = '/price#extra-plan';
export const getExtraPlanCardRoute = () => {
  const subPlans = useSystemStore.getState().subPlans;
  return subPlans?.planDescriptionUrl
    ? getDocPath(subPlans.planDescriptionUrl)
    : EXTRA_PLAN_CARD_ROUTE;
};
