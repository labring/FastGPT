import type {
  UpdateDatasetCollaboratorBody,
  DatasetCollaboratorDeleteParams
} from '@fastgpt/global/core/dataset/collaborator';
import type {
  UpdateCollectionCollaboratorBody,
  BatchUpdateCollectionCollaboratorBody,
  CollectionCollaboratorDeleteParams
} from '@fastgpt/global/core/dataset/collection/collaborator';
import { DELETE, GET, POST } from '@/web/common/api/request';
import type { CollaboratorListType } from '@fastgpt/global/support/permission/collaborator';

export const getCollaboratorList = (datasetId: string) =>
  GET<CollaboratorListType>('/proApi/core/dataset/collaborator/list', { datasetId });

export const postUpdateDatasetCollaborators = (body: UpdateDatasetCollaboratorBody) =>
  POST('/proApi/core/dataset/collaborator/update', body);

export const deleteDatasetCollaborators = (params: DatasetCollaboratorDeleteParams) =>
  DELETE('/proApi/core/dataset/collaborator/delete', params);

// Collection collaborator APIs
export const getCollectionCollaboratorList = (collectionId: string) =>
  GET<CollaboratorListType>('/proApi/core/dataset/collection/collaborator/list', { collectionId });

export const postUpdateCollectionCollaborators = (body: UpdateCollectionCollaboratorBody) =>
  POST('/proApi/core/dataset/collection/collaborator/update', body);

export const postBatchUpdateCollectionCollaborators = (
  body: BatchUpdateCollectionCollaboratorBody
) => POST('/proApi/core/dataset/collection/collaborator/batchUpdate', body);

export const deleteCollectionCollaborators = (params: CollectionCollaboratorDeleteParams) =>
  DELETE('/proApi/core/dataset/collection/collaborator/delete', params);

export const postResumeCollectionInheritPermission = (collectionId: string) =>
  POST('/core/dataset/collection/resumeInheritPermission', { collectionId });

export const postChangeCollectionOwner = (data: { collectionId: string; ownerId: string }) =>
  POST('/proApi/core/dataset/collection/changeOwner', data);
