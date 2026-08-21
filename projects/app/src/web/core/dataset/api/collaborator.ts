import { GET, POST } from '@/web/common/api/request';
import type {
  GetDatasetCollaboratorListResponse,
  UpdateDatasetCollaboratorBody
} from '@fastgpt/global/openapi/core/dataset/api';

export const getCollaboratorList = (datasetId: string) =>
  GET<GetDatasetCollaboratorListResponse>('/proApi/core/dataset/collaborator/list', { datasetId });

export const postUpdateDatasetCollaborators = (body: UpdateDatasetCollaboratorBody) =>
  POST('/proApi/core/dataset/collaborator/update', body);
