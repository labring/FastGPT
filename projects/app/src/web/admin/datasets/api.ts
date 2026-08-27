import { POST } from '@/web/admin/common/request';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';

/** 知识库列表返回（原 pro/admin 的 GetDatasetsResponseData 内联） */
export type AdminDatasetListItemType = {
  id: string;
  teamId: string;
  name: string;
  intro: string;
  username: string;
  totalDatas: number;
  totalVectors: number;
};

export const getDatasets = (data: PaginationProps) =>
  POST<PaginationResponse<AdminDatasetListItemType>>(
    '/proApi/admin/routes/datasets/getDatasets',
    data
  );
