import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import {
  StandardSubPlanParams,
  StandardSubPlanUpdateResponse,
  SubDatasetSizeParams,
  SubDatasetSizePreviewCheckResponse
} from '@fastgpt/global/support/wallet/sub/api';
import { SubStatusEnum, SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { FeTeamSubType } from '@fastgpt/global/support/wallet/sub/type';

export const putTeamDatasetSubStatus = (data: {
  status: `${SubStatusEnum}`;
  type: `${SubTypeEnum}`;
}) => POST('/proApi/support/wallet/sub/updateStatus', data);

export const getTeamDatasetValidSub = () =>
  GET<FeTeamSubType>(`/support/wallet/sub/getTeamSubStatus`);

export const postCheckStandardSub = (data: StandardSubPlanParams) =>
  POST<StandardSubPlanUpdateResponse>('/proApi/support/wallet/sub/standard/preCheck', data);
export const postUpdateStandardSub = (data: StandardSubPlanParams) =>
  POST<StandardSubPlanUpdateResponse>('/proApi/support/wallet/sub/standard/update', data);

export const posCheckTeamDatasetSizeSub = (data: SubDatasetSizeParams) =>
  POST<SubDatasetSizePreviewCheckResponse>(
    '/proApi/support/wallet/sub/extraDatasetSize/preCheck',
    data
  );
export const postUpdateTeamDatasetSizeSub = (data: SubDatasetSizeParams) =>
  POST('/proApi/support/wallet/sub/extraDatasetSize/update', data);
