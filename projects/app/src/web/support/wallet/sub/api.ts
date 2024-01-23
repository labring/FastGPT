import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import {
  SubDatasetSizeParams,
  SubDatasetSizePreviewCheckResponse
} from '@fastgpt/global/support/wallet/sub/api';
import { SubStatusEnum, SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type';

export const putTeamDatasetSubStatus = (data: {
  status: `${SubStatusEnum}`;
  type: `${SubTypeEnum}`;
}) => POST('/proApi/support/wallet/sub/updateStatus', data);

export const getTeamDatasetValidSub = () =>
  GET<{
    sub: TeamSubSchema;
    maxSize: number;
    usedSize: number;
  }>(`/support/wallet/sub/getDatasetSub`);

export const posCheckTeamDatasetSizeSub = (data: SubDatasetSizeParams) =>
  POST<SubDatasetSizePreviewCheckResponse>(
    '/proApi/support/wallet/sub/extraDatasetSize/preCheck',
    data
  );
export const postUpdateTeamDatasetSizeSub = (data: SubDatasetSizeParams) =>
  POST('/proApi/support/wallet/sub/extraDatasetSize/update', data);
