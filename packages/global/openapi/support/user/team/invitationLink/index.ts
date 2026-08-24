import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  AcceptInvitationLinkBodySchema,
  CreateInvitationLinkBodySchema,
  CreateInvitationLinkResponseSchema,
  ForbidInvitationLinkBodySchema,
  GetInvitationLinkInfoQuerySchema,
  GetInvitationLinkInfoResponseSchema,
  GetInvitationLinkListResponseSchema
} from './api';

const TeamInvitationLinkTags = [DevApiTagsMap.teamInvitationLink];

export const TeamInvitationLinkPath: OpenAPIPath = {
  '/proApi/support/user/team/invitationLink/accept': {
    post: {
      summary: '接受团队邀请链接',
      description: '当前用户接受邀请链接并加入对应团队',
      tags: [...TeamInvitationLinkTags],
      requestBody: {
        content: {
          'application/json': {
            schema: AcceptInvitationLinkBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '接受邀请成功'
        }
      }
    }
  },
  '/proApi/support/user/team/invitationLink/create': {
    post: {
      summary: '创建团队邀请链接',
      description: '为当前团队创建邀请链接，可设置有效期和使用次数限制',
      tags: [...TeamInvitationLinkTags],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateInvitationLinkBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '创建成功并返回邀请链接 ID',
          content: {
            'application/json': {
              schema: CreateInvitationLinkResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/invitationLink/forbid': {
    put: {
      summary: '禁用团队邀请链接',
      description: '禁用当前团队指定的邀请链接，使其立即失效',
      tags: [...TeamInvitationLinkTags],
      requestBody: {
        content: {
          'application/json': {
            schema: ForbidInvitationLinkBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '禁用邀请链接成功'
        }
      }
    }
  },
  '/proApi/support/user/team/invitationLink/info': {
    get: {
      summary: '获取团队邀请链接信息',
      description: '获取邀请链接状态、所属团队和已加入成员信息',
      tags: [...TeamInvitationLinkTags],
      requestParams: {
        query: GetInvitationLinkInfoQuerySchema
      },
      responses: {
        200: {
          description: '成功返回邀请链接信息',
          content: {
            'application/json': {
              schema: GetInvitationLinkInfoResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/invitationLink/list': {
    get: {
      summary: '获取团队邀请链接列表',
      description: '获取当前团队创建的全部邀请链接及其已加入成员信息',
      tags: [...TeamInvitationLinkTags],
      responses: {
        200: {
          description: '成功返回团队邀请链接列表',
          content: {
            'application/json': {
              schema: GetInvitationLinkListResponseSchema
            }
          }
        }
      }
    }
  }
};
