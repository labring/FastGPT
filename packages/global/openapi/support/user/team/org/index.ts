import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  CreateOrgBodySchema,
  DeleteOrgMemberQuerySchema,
  DeleteOrgQuerySchema,
  ListOrgBodySchema,
  ListOrgResponseSchema,
  MoveOrgBodySchema,
  UpdateOrgBodySchema,
  UpdateOrgMembersBodySchema
} from './api';

const DepartmentTags = [DevApiTagsMap.teamOrg];

export const TeamOrgPath: OpenAPIPath = {
  '/proApi/support/user/team/org/create': {
    post: {
      summary: '创建部门',
      description: '在指定父部门下创建一个新的部门',
      tags: [...DepartmentTags],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateOrgBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '部门创建成功'
        }
      }
    }
  },
  '/proApi/support/user/team/org/delete': {
    delete: {
      summary: '删除部门',
      description: '删除一个空的非根部门，并清理其成员关系和资源权限',
      tags: [...DepartmentTags],
      requestParams: {
        query: DeleteOrgQuerySchema
      },
      responses: {
        200: {
          description: '部门删除成功'
        }
      }
    }
  },
  '/proApi/support/user/team/org/deleteMember': {
    delete: {
      summary: '删除部门成员',
      description: '将指定团队成员从部门中移除，不会将成员移出团队',
      tags: [...DepartmentTags],
      requestParams: {
        query: DeleteOrgMemberQuerySchema
      },
      responses: {
        200: {
          description: '部门成员删除成功'
        }
      }
    }
  },
  '/proApi/support/user/team/org/list': {
    post: {
      summary: '获取部门列表',
      description: '获取当前部门的直接子部门，支持名称搜索和权限信息返回',
      tags: [...DepartmentTags],
      requestBody: {
        content: {
          'application/json': {
            schema: ListOrgBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回部门列表',
          content: {
            'application/json': {
              schema: ListOrgResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/org/move': {
    put: {
      summary: '移动部门',
      description: '将部门移动到新的父部门下，并同步更新子部门路径',
      tags: [...DepartmentTags],
      requestBody: {
        content: {
          'application/json': {
            schema: MoveOrgBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '部门移动成功'
        }
      }
    }
  },
  '/proApi/support/user/team/org/update': {
    put: {
      summary: '更新部门',
      description: '更新非根部门的名称、头像和描述信息',
      tags: [...DepartmentTags],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateOrgBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '部门更新成功'
        }
      }
    }
  },
  '/proApi/support/user/team/org/updateMembers': {
    put: {
      summary: '更新部门成员',
      description: '全量覆盖指定部门的成员列表，传入空数组表示清空部门成员',
      tags: [...DepartmentTags],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateOrgMembersBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '部门成员更新成功'
        }
      }
    }
  }
};
