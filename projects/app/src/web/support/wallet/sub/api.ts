import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import {
  StandardSubPlanParams,
  StandardSubPlanUpdateResponse
} from '@fastgpt/global/support/wallet/sub/api';

export const postCheckStandardSub = (data: StandardSubPlanParams) =>
  POST<StandardSubPlanUpdateResponse>('/proApi/support/wallet/sub/standard/preCheck', data);
export const postUpdateStandardSub = (data: StandardSubPlanParams) =>
  POST<StandardSubPlanUpdateResponse>('/proApi/support/wallet/sub/standard/update', data);
