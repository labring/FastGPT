import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  GetTeamPlanStatusQuerySchema,
  GetTeamPlanStatusResponseSchema,
  GetTeamPlansQuerySchema,
  GetTeamPlansResponseSchema,
  GetTeamListQuerySchema,
  GetTeamListResponseSchema,
  SearchMembersOrgsGroupsQuerySchema,
  SearchMembersOrgsGroupsResponseSchema,
  SwitchTeamBodySchema,
  SwitchTeamResponseSchema,
  TeamChangeOwnerBodySchema,
  TeamChangeOwnerResponseSchema,
  UpdateNotificationAccountBodySchema,
  UpdateNotificationAccountResponseSchema,
  UpdateTeamBodySchema,
  UserSyncBodySchema,
  UserSyncResponseSchema
} from './api';
import { EnterpriseAuthPath } from './enterpriseAuth';
import { TeamLimitPath } from './limit';
import { TeamCollaboratorPath } from './collaborator';
import { TeamAuditPath } from './audit';
import { TeamInvitationLinkPath } from './invitationLink';
import { TeamMemberPath } from './member';
import { TeamOrgPath } from './org';
import { TeamGroupPath } from './group';

export const TeamPath: OpenAPIPath = {
  ...TeamAuditPath,
  ...TeamCollaboratorPath,
  ...TeamInvitationLinkPath,
  ...TeamMemberPath,
  ...TeamOrgPath,
  ...TeamGroupPath,
  ...EnterpriseAuthPath,
  ...TeamLimitPath,
  '/proApi/support/user/team/searchMembersOrgsGroups': {
    get: {
      summary: '聚合搜索团队成员、组织和用户组',
      description: '在当前团队中按关键词聚合搜索成员、组织和用户组',
      tags: [DevApiTagsMap.teamManage],
      requestParams: {
        query: SearchMembersOrgsGroupsQuerySchema
      },
      responses: {
        200: {
          description: '成功返回搜索结果',
          content: {
            'application/json': {
              schema: SearchMembersOrgsGroupsResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/sync': {
    post: {
      summary: '同步用户和组织',
      description: '从外部用户系统同步当前团队的用户和组织数据',
      tags: [DevApiTagsMap.teamManage],
      requestBody: {
        content: {
          'application/json': {
            schema: UserSyncBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '用户和组织同步成功',
          content: {
            'application/json': {
              schema: UserSyncResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/list': {
    get: {
      summary: '获取团队列表',
      description: '获取当前用户加入的团队列表及其成员身份和团队权限',
      tags: [DevApiTagsMap.teamManage],
      requestParams: {
        query: GetTeamListQuerySchema
      },
      responses: {
        200: {
          description: '成功返回团队列表',
          content: {
            'application/json': {
              schema: GetTeamListResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/switch': {
    put: {
      summary: '切换当前团队',
      description: '切换当前用户的登录团队并返回新的会话令牌',
      tags: [DevApiTagsMap.teamManage],
      requestBody: {
        content: {
          'application/json': {
            schema: SwitchTeamBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '团队切换成功',
          content: {
            'application/json': {
              schema: SwitchTeamResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/updateNotificationAccount': {
    put: {
      summary: '更新团队通知账号',
      description: '使用验证码更新当前团队的通知账号',
      tags: [DevApiTagsMap.teamManage],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateNotificationAccountBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '团队通知账号更新成功',
          content: {
            'application/json': {
              schema: UpdateNotificationAccountResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/changeOwner': {
    put: {
      summary: '转让团队所有权',
      description: '将企业微信团队的所有权转让给团队内的指定用户',
      tags: [DevApiTagsMap.teamManage],
      requestBody: {
        content: {
          'application/json': {
            schema: TeamChangeOwnerBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '团队所有权转让成功',
          content: {
            'application/json': {
              schema: TeamChangeOwnerResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/user/team/update': {
    put: {
      summary: '更新团队信息',
      description: '更新团队名称、头像、域名、第三方账号（OpenAI）及外部工作流变量',
      tags: [DevApiTagsMap.teamManage],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateTeamBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新成功'
        }
      }
    }
  },
  '/support/user/team/plan/getTeamPlanStatus': {
    get: {
      summary: '获取团队套餐状态',
      description: '获取当前团队的套餐额度及成员、应用、知识库等资源用量',
      tags: [DevApiTagsMap.teamSubscription],
      requestParams: {
        query: GetTeamPlanStatusQuerySchema
      },
      responses: {
        200: {
          description: '成功返回团队套餐状态',
          content: {
            'application/json': {
              schema: GetTeamPlanStatusResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/plan/getTeamPlans': {
    get: {
      summary: '获取团队套餐列表',
      description: '获取当前团队的全部订阅套餐记录，按过期时间升序返回',
      tags: [DevApiTagsMap.teamSubscription],
      requestParams: {
        query: GetTeamPlansQuerySchema
      },
      responses: {
        200: {
          description: '成功返回团队套餐列表',
          content: {
            'application/json': {
              schema: GetTeamPlansResponseSchema
            }
          }
        }
      }
    }
  }
};
