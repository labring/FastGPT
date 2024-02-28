import { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';

declare global {
  var feConfigs: FastGPTFeConfigsType;
  var subPlans: SubPlanType | undefined;
}
