import { onTestFinished } from 'vitest';

/** 为配额回归测试配置真实免费套餐，测试结束后恢复配置，避免污染其他用例。 */
export const configureAgentQuota = () => {
  const previousSubPlans = global.subPlans;
  global.subPlans = {
    standard: {
      free: {
        price: 0,
        totalPoints: 100,
        maxTeamMember: 10,
        maxAppAmount: 10,
        maxDatasetAmount: 10,
        maxDatasetSize: 1000,
        chatHistoryStoreDuration: 30
      }
    }
  };
  onTestFinished(() => {
    global.subPlans = previousSubPlans;
  });
};
