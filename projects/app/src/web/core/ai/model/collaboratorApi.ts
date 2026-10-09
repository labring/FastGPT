import { GET, POST } from '@/web/common/api/request';
import type {
  CollaboratorListType,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';
import type { ModelCollaboratorBatchListResponse } from '@fastgpt/global/support/permission/model/controller.schema';

export const getModelCollaborators = (modelId: string) =>
  GET<CollaboratorListType>('/proApi/system/model/collaborator/list', { modelId });
export const getBatchModelCollaborators = (modelIds: string[]) =>
  POST<ModelCollaboratorBatchListResponse>('/proApi/system/model/collaborator/batchList', {
    modelIds
  });
export const updateModelCollaborators = (
  props: UpdateClbPermissionProps & { modelIds: string[] }
) => POST('/proApi/system/model/collaborator/update', props);
