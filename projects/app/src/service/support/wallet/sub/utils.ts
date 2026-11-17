import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
export const getStandardSubPlan = () => getSystemInstanceConfig().commercial.subPlans?.standard;
