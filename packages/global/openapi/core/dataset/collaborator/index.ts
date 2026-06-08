import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  GetDatasetCollaboratorListQuerySchema,
  CollaboratorListResponseSchema,
  UpdateDatasetCollaboratorBodySchema,
  ChangeDatasetOwnerBodySchema,
  GetCollectionCollaboratorListQuerySchema,
  UpdateCollectionCollaboratorBodySchema,
  BatchUpdateCollectionCollaboratorBodySchema,
  ChangeCollectionOwnerBodySchema,
  ResumeCollectionInheritPermissionBodySchema
} from './api';

export const DatasetCollaboratorPath: OpenAPIPath = {
  '/core/dataset/collaborator/list': {
    get: {
      summary: '获取知识库协作者列表',
      description: '查询知识库的协作者列表（成员/组织/用户组），继承态会同时返回父级协作者',
      tags: [TagsMap.datasetCollaborator],
      requestParams: {
        query: GetDatasetCollaboratorListQuerySchema
      },
      responses: {
        200: {
          description: '成功返回协作者列表',
          content: { 'application/json': { schema: CollaboratorListResponseSchema } }
        }
      }
    }
  },

  '/core/dataset/collaborator/update': {
    post: {
      summary: '更新知识库协作者',
      description: '新增/修改知识库协作者及其权限，支持设置 permissionEffectScope 控制权限生效范围',
      tags: [TagsMap.datasetCollaborator],
      requestBody: {
        content: { 'application/json': { schema: UpdateDatasetCollaboratorBodySchema } }
      },
      responses: {
        200: { description: '更新成功' }
      }
    }
  },

  '/core/dataset/changeOwner': {
    post: {
      summary: '转移知识库所有权',
      description: '转移知识库所有权给其他团队成员，需要所有者权限',
      tags: [TagsMap.datasetCollaborator],
      requestBody: {
        content: { 'application/json': { schema: ChangeDatasetOwnerBodySchema } }
      },
      responses: {
        200: { description: '转移成功' }
      }
    }
  },

  '/core/dataset/collection/collaborator/list': {
    get: {
      summary: '获取集合协作者列表',
      description: '查询集合的协作者列表（成员/组织/用户组），包含父级协作者信息',
      tags: [TagsMap.datasetCollaborator],
      requestParams: {
        query: GetCollectionCollaboratorListQuerySchema
      },
      responses: {
        200: {
          description: '成功返回协作者列表',
          content: { 'application/json': { schema: CollaboratorListResponseSchema } }
        }
      }
    }
  },

  '/core/dataset/collection/collaborator/update': {
    post: {
      summary: '更新集合协作者',
      description: '新增/修改集合协作者及其权限，支持设置 permissionEffectScope 控制权限生效范围',
      tags: [TagsMap.datasetCollaborator],
      requestBody: {
        content: { 'application/json': { schema: UpdateCollectionCollaboratorBodySchema } }
      },
      responses: {
        200: { description: '更新成功' }
      }
    }
  },

  '/core/dataset/collection/collaborator/batchUpdate': {
    post: {
      summary: '批量更新集合协作者',
      description: '批量更新多个集合的协作者，要求所有集合属于同一父级资源',
      tags: [TagsMap.datasetCollaborator],
      requestBody: {
        content: { 'application/json': { schema: BatchUpdateCollectionCollaboratorBodySchema } }
      },
      responses: {
        200: { description: '批量更新成功' }
      }
    }
  },

  '/core/dataset/collection/changeOwner': {
    post: {
      summary: '转移集合所有权',
      description: '转移集合所有权给其他团队成员，需要所有者权限',
      tags: [TagsMap.datasetCollaborator],
      requestBody: {
        content: { 'application/json': { schema: ChangeCollectionOwnerBodySchema } }
      },
      responses: {
        200: { description: '转移成功' }
      }
    }
  },

  '/core/dataset/collection/resumeInheritPermission': {
    post: {
      summary: '恢复集合继承权限',
      description: '恢复集合的继承权限，使其权限与父级资源保持一致',
      tags: [TagsMap.datasetCollaborator],
      requestBody: {
        content: { 'application/json': { schema: ResumeCollectionInheritPermissionBodySchema } }
      },
      responses: {
        200: { description: '恢复成功' }
      }
    }
  }
};
