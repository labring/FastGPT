import { findActiveTeamStandardPlans } from './entity';
import { getPlansCanHideShareBrand } from './utils';

/** 使用有效订阅和实时套餐配置判断隐藏品牌权益；读取异常交由调用方处理。 */
export const getTeamCanHideShareBrand = async (teamId: string): Promise<boolean> => {
  const plans = await findActiveTeamStandardPlans(teamId);
  return getPlansCanHideShareBrand({
    plans,
    standardPlans: global.subPlans?.standard,
    now: Date.now()
  });
};
