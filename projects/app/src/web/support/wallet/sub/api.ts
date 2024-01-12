import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import { SubDatasetSizeParams } from '@fastgpt/global/support/wallet/sub/api';
import { TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type';

export const getTeamDatasetValidSub = () =>
  GET<{
    sub: TeamSubSchema;
    maxSize: number;
    usedSize: number;
  }>(`/support/wallet/sub/getDatasetSub`);

export const postExpandTeamDatasetSub = (data: SubDatasetSizeParams) =>
  POST('/plusApi/support/wallet/sub/datasetSize/expand', data);
