import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';

export type PriceTabType = 'standard' | 'extra';

export const isPriceTabType = (value: string): value is PriceTabType =>
  value === 'standard' || value === 'extra';

export const getPriceTabRoute = (tab: PriceTabType) => `/price#${tab}`;

export const EXTRA_PLAN_CARD_ROUTE = getPriceTabRoute('extra');
export const getExtraPlanCardRoute = () => {
  const subPlans = useSystemStore.getState().subPlans;
  return subPlans?.planDescriptionUrl
    ? getDocPath(subPlans.planDescriptionUrl)
    : EXTRA_PLAN_CARD_ROUTE;
};
