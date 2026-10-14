import { clientInitData } from '@/web/common/system/staticData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';

/** 复用本次会话已确认的公共套餐；普通初始化缺少套餐时，仅在仍停留价格页的情况下补取。 */
export const initPriceData = async () => {
  const ensureSubPlans = async () => {
    const { authGeneration } = useUserStore.getState();
    const hasCurrentPlans = () => {
      const { initConfigGeneration, subPlansConfigGeneration } = useSystemStore.getState();
      return initConfigGeneration === authGeneration && subPlansConfigGeneration === authGeneration;
    };
    if (hasCurrentPlans()) return;

    await clientInitData();
    if (
      hasCurrentPlans() ||
      authGeneration !== useUserStore.getState().authGeneration ||
      window.location.pathname !== '/price'
    )
      return;
    // 复用的请求可能来自其他页面，需等它结束后才能判断是否缺少套餐。
    await clientInitData();
  };

  const [userInfo] = await Promise.all([useUserStore.getState().initUserInfo(), ensureSubPlans()]);
  return { userInfo, teamSubPlan: useUserStore.getState().teamPlanStatus };
};
