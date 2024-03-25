import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import {
  StandardSubPlanParams,
  StandardSubPlanUpdateResponse
} from '@fastgpt/global/support/wallet/sub/api';
import { SubStatusEnum, SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';

export const putTeamDatasetSubStatus = (data: {
  status: `${SubStatusEnum}`;
  type: `${SubTypeEnum}`;
}) => POST('/proApi/support/wallet/sub/updateStatus', data);

export const postCheckStandardSub = (data: StandardSubPlanParams) =>
  POST<StandardSubPlanUpdateResponse>('/proApi/support/wallet/sub/standard/preCheck', data);
export const postUpdateStandardSub = (data: StandardSubPlanParams) =>
  POST<StandardSubPlanUpdateResponse>('/proApi/support/wallet/sub/standard/update', data);
