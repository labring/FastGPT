import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '@fastgpt/global/openapi/provider/devapi';
import { DevApiTagsMap } from '@fastgpt/global/openapi/tag';
import {
  AuditListBodySchema,
  AuditListResponseSchema
} from '@fastgpt/global/openapi/support/user/team/audit/api';
import {
  GetUnreadInformResponseSchema,
  GetUserInformListBodySchema,
  GetUserInformListResponseSchema,
  ReadInformQuerySchema
} from '@fastgpt/global/openapi/support/user/inform/api';
import {
  GetTeamListQuerySchema,
  GetTeamListResponseSchema,
  SearchMembersOrgsGroupsQuerySchema,
  SearchMembersOrgsGroupsResponseSchema,
  SwitchTeamBodySchema,
  SwitchTeamResponseSchema,
  TeamChangeOwnerBodySchema,
  TeamChangeOwnerResponseSchema,
  UpdateNotificationAccountBodySchema,
  UserSyncBodySchema,
  UserSyncResponseSchema
} from '@fastgpt/global/openapi/support/user/team/api';
import {
  ListTeamMembersBodySchema,
  ListTeamMembersResponseSchema,
  RestoreTeamMemberBodySchema,
  UpdateTeamMemberNameBodySchema,
  UpdateTeamMemberNameByManagerBodySchema
} from '@fastgpt/global/openapi/support/user/team/member/api';
import {
  DeleteTeamCollaboratorQuerySchema,
  UpdateTeamCollaboratorBodySchema,
  UpdateTeamCollaboratorOneBodySchema
} from '@fastgpt/global/openapi/support/user/team/collaborator/api';
import { GetInvitationLinkInfoResponseSchema } from '@fastgpt/global/openapi/support/user/team/invitationLink/api';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { InformLevelEnum } from '@fastgpt/global/support/user/inform/constants';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';

const objectId = '68ad85a7463006c963799a05';
const secondObjectId = '68ad85a7463006c963799a06';
const thirdObjectId = '68ad85a7463006c963799a07';

describe('support user OpenAPI contracts', () => {
  it('registers all requested Pro user routes', () => {
    expect(openAPIDocument.paths?.['/proApi/support/user/team/audit/list']?.post).toBeDefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/inform/list']?.post).toBeDefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/inform/countUnread']?.get).toBeDefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/inform/read']?.get).toBeDefined();
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/searchMembersOrgsGroups']?.get
    ).toBeDefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/team/search']).toBeUndefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/team/sync']?.post).toBeDefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/team/list']?.get).toBeDefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/team/switch']?.put).toBeDefined();
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/updateNotificationAccount']?.put
    ).toBeDefined();
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/updateNotificationAccount']?.put
        ?.responses?.[200]?.content
    ).toBeUndefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/team/changeOwner']?.put).toBeDefined();
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/collaborator/delete']?.delete?.tags
    ).toEqual([DevApiTagsMap.teamPermission]);
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/collaborator/list']?.get?.tags
    ).toEqual([DevApiTagsMap.teamPermission]);
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/collaborator/update']?.post?.tags
    ).toEqual([DevApiTagsMap.teamPermission]);
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/collaborator/updateOne']?.put?.tags
    ).toEqual([DevApiTagsMap.teamPermission]);
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/invitationLink/accept']?.post?.tags
    ).toEqual([DevApiTagsMap.teamInvitationLink]);
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/invitationLink/create']?.post?.tags
    ).toEqual([DevApiTagsMap.teamInvitationLink]);
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/invitationLink/forbid']?.put?.tags
    ).toEqual([DevApiTagsMap.teamInvitationLink]);
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/invitationLink/info']?.get?.tags
    ).toEqual([DevApiTagsMap.teamInvitationLink]);
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/invitationLink/list']?.get?.tags
    ).toEqual([DevApiTagsMap.teamInvitationLink]);
    expect(openAPIDocument.paths?.['/proApi/support/user/team/member/count']?.get?.tags).toEqual([
      DevApiTagsMap.teamMember
    ]);
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/member/delete']?.delete?.tags
    ).toEqual([DevApiTagsMap.teamMember]);
    expect(openAPIDocument.paths?.['/proApi/support/user/team/member/export']?.get?.tags).toEqual([
      DevApiTagsMap.teamMember
    ]);
    expect(openAPIDocument.paths?.['/proApi/support/user/team/member/leave']?.delete?.tags).toEqual(
      [DevApiTagsMap.teamMember]
    );
    expect(openAPIDocument.paths?.['/proApi/support/user/team/member/list']?.post?.tags).toEqual([
      DevApiTagsMap.teamMember
    ]);
    expect(openAPIDocument.paths?.['/proApi/support/user/team/member/restore']?.post?.tags).toEqual(
      [DevApiTagsMap.teamMember]
    );
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/member/updateInvite']?.put?.tags
    ).toEqual([DevApiTagsMap.teamMember]);
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/member/updateName']?.put?.tags
    ).toEqual([DevApiTagsMap.teamMember]);
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/member/updateNameByManager']?.put?.tags
    ).toEqual([DevApiTagsMap.teamMember]);
    expect(openAPIDocument.paths?.['/proApi/support/user/search']).toBeUndefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/sync']).toBeUndefined();

    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/collaborator/list']?.get?.parameters
    ).toBeUndefined();
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/invitationLink/list']?.get?.parameters
    ).toBeUndefined();
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/member/leave']?.delete?.requestBody
    ).toBeUndefined();
  });

  it('parses audit filters and responses', () => {
    expect(
      AuditListBodySchema.parse({
        pageSize: '20',
        pageNum: '1',
        tmbIds: [objectId],
        events: [AuditEventEnum.UPDATE_APP_INFO]
      })
    ).toMatchObject({
      pageSize: 20,
      pageNum: 1,
      tmbIds: [objectId]
    });

    expect(
      AuditListResponseSchema.parse({
        total: 1,
        list: [
          {
            _id: objectId,
            sourceMember: {
              name: '张三',
              avatar: null,
              status: TeamMemberStatusEnum.active
            },
            event: AuditEventEnum.UPDATE_APP_INFO,
            timestamp: '2026-01-02T00:00:00.000Z',
            metadata: { name: '张三' }
          }
        ]
      }).total
    ).toBe(1);

    expect(
      AuditListResponseSchema.parse({
        total: 1,
        list: [
          {
            _id: objectId,
            sourceMember: {
              name: '张三',
              avatar: null,
              status: TeamMemberStatusEnum.active
            },
            event: AuditEventEnum.ACCOUNT_CANCELLATION_FINALIZE,
            timestamp: '2026-01-02T00:00:00.000Z',
            metadata: {
              requestedAt: new Date('2026-01-01T10:00:00.000Z'),
              scheduledCancelAt: new Date('2026-01-16T16:00:00.000Z'),
              finalizedAt: new Date('2026-01-17T00:00:00.000Z')
            }
          }
        ]
      })
    ).toMatchObject({
      list: [
        {
          metadata: {
            requestedAt: '2026-01-01T10:00:00.000Z',
            scheduledCancelAt: '2026-01-16T16:00:00.000Z',
            finalizedAt: '2026-01-17T00:00:00.000Z'
          }
        }
      ]
    });
  });

  it('parses inform list, unread summary, and read query', () => {
    expect(GetUserInformListBodySchema.parse({ pageSize: '10', pageNum: '2' })).toEqual({
      pageSize: 10,
      pageNum: 2
    });
    expect(
      GetUserInformListResponseSchema.parse({
        total: 1,
        list: [
          {
            _id: objectId,
            userId: objectId,
            time: '2026-01-02T00:00:00.000Z',
            level: InformLevelEnum.important,
            title: '通知',
            content: '通知内容',
            read: false
          }
        ]
      }).list
    ).toHaveLength(1);
    expect(GetUnreadInformResponseSchema.parse(0)).toBe(0);
    expect(
      GetUnreadInformResponseSchema.parse({
        unReadCount: 1,
        importantInforms: []
      })
    ).toMatchObject({ unReadCount: 1 });
    expect(ReadInformQuerySchema.parse({ id: objectId })).toEqual({ id: objectId });
  });

  it('parses historical team members and empty sync contracts', () => {
    expect(
      SearchMembersOrgsGroupsQuerySchema.parse({
        searchKey: '张三',
        members: 'false',
        orgs: 'true',
        groups: '1'
      })
    ).toMatchObject({
      searchKey: '张三',
      members: false,
      orgs: true,
      groups: true
    });
    const searchResponse = SearchMembersOrgsGroupsResponseSchema.parse({
      members: [
        {
          tmbId: objectId,
          userId: objectId,
          teamId: objectId,
          name: '历史成员',
          memberName: '历史成员',
          createTime: '2026-01-01T00:00:00.000Z'
        }
      ],
      orgs: [],
      groups: []
    });
    expect(searchResponse).toMatchObject({
      members: [
        {
          name: '历史成员',
          status: TeamMemberStatusEnum.active
        }
      ],
      orgs: [],
      groups: []
    });
    expect(searchResponse.members[0]).not.toHaveProperty('avatar');
    expect(
      SearchMembersOrgsGroupsResponseSchema.parse({
        members: [
          {
            tmbId: objectId,
            userId: objectId,
            teamId: objectId,
            name: '空联系方式成员',
            memberName: '空联系方式成员',
            avatar: null,
            status: TeamMemberStatusEnum.active,
            contact: null,
            createTime: '2026-01-01T00:00:00.000Z'
          }
        ],
        orgs: [],
        groups: []
      }).members[0].contact
    ).toBeNull();
    expect(
      SearchMembersOrgsGroupsResponseSchema.parse({
        members: [
          {
            tmbId: objectId,
            userId: objectId,
            teamId: objectId,
            name: '空头像成员',
            memberName: '空头像成员',
            avatar: null,
            contact: null,
            createTime: '2026-01-01T00:00:00.000Z'
          }
        ],
        orgs: [],
        groups: [
          {
            _id: objectId,
            teamId: objectId,
            name: '空头像用户组',
            avatar: null,
            updateTime: '2026-01-02T00:00:00.000Z'
          }
        ]
      })
    ).toMatchObject({
      members: [{ avatar: null, contact: null }],
      groups: [{ avatar: null }]
    });
    expect(
      SearchMembersOrgsGroupsResponseSchema.parse({
        members: [],
        orgs: [],
        groups: []
      })
    ).toEqual({
      members: [],
      orgs: [],
      groups: []
    });
    expect(UserSyncBodySchema.parse(undefined)).toEqual({});
    expect(UserSyncResponseSchema.parse(undefined)).toBeUndefined();
  });

  it('allows empty invitation details for existing team members', () => {
    expect(GetInvitationLinkInfoResponseSchema.parse(undefined)).toBeUndefined();
  });

  it('parses team management list and write contracts', () => {
    expect(GetTeamListQuerySchema.parse({ status: 'active' })).toEqual({ status: 'active' });
    expect(GetTeamListQuerySchema.parse({})).toEqual({});
    expect(SwitchTeamBodySchema.parse({ teamId: objectId })).toEqual({ teamId: objectId });
    expect(SwitchTeamResponseSchema.parse('session-token')).toBe('session-token');
    expect(
      UpdateNotificationAccountBodySchema.parse({
        account: 'team@example.com',
        verifyCode: '123456'
      })
    ).toMatchObject({ account: 'team@example.com', verifyCode: '123456' });
    expect(TeamChangeOwnerBodySchema.parse({ userId: objectId })).toEqual({ userId: objectId });
    expect(TeamChangeOwnerResponseSchema.parse(undefined)).toBeUndefined();
    expect(
      GetTeamListResponseSchema.parse([
        {
          userId: objectId,
          teamId: objectId,
          teamAvatar: null,
          teamName: 'FastGPT 团队',
          memberName: '张三',
          avatar: null,
          tmbId: objectId,
          role: 'owner',
          status: 'active',
          accountCancellation: {
            status: 'pending',
            scheduledCancelAt: '2026-09-01T00:00:00.000Z'
          },
          notificationAccount: null,
          permission: {
            role: 1,
            isOwner: true,
            hasManagePer: true,
            hasWritePer: true,
            hasReadPer: true,
            hasManageRole: true,
            hasWriteRole: true,
            hasReadRole: true
          }
        }
      ])
    ).toMatchObject([
      {
        notificationAccount: null,
        accountCancellation: {
          status: 'pending',
          scheduledCancelAt: '2026-09-01T00:00:00.000Z'
        }
      }
    ]);
  });

  it('rejects missing team write parameters at the schema boundary', () => {
    expect(UpdateTeamCollaboratorBodySchema.safeParse({}).success).toBe(false);
    expect(UpdateTeamCollaboratorBodySchema.safeParse({ collaborators: [] }).success).toBe(false);
    expect(RestoreTeamMemberBodySchema.safeParse({}).success).toBe(false);
    expect(UpdateTeamMemberNameBodySchema.safeParse({}).success).toBe(false);
    expect(UpdateTeamMemberNameBodySchema.safeParse({ name: '' }).success).toBe(false);
    expect(UpdateTeamMemberNameByManagerBodySchema.safeParse({ name: '张三' }).success).toBe(false);
    expect(UpdateTeamMemberNameByManagerBodySchema.safeParse({ tmbId: objectId }).success).toBe(
      false
    );
  });

  it('requires exactly one team collaborator target', () => {
    expect(DeleteTeamCollaboratorQuerySchema.safeParse({}).success).toBe(false);
    expect(DeleteTeamCollaboratorQuerySchema.safeParse({ tmbId: objectId }).success).toBe(true);
    expect(DeleteTeamCollaboratorQuerySchema.safeParse({ groupId: objectId }).success).toBe(true);
    expect(DeleteTeamCollaboratorQuerySchema.safeParse({ orgId: objectId }).success).toBe(true);
    expect(
      DeleteTeamCollaboratorQuerySchema.safeParse({
        tmbId: objectId,
        groupId: secondObjectId
      }).success
    ).toBe(false);
    expect(
      DeleteTeamCollaboratorQuerySchema.safeParse({
        tmbId: objectId,
        groupId: secondObjectId,
        orgId: thirdObjectId
      }).success
    ).toBe(false);

    expect(
      UpdateTeamCollaboratorOneBodySchema.safeParse({ tmbId: objectId, permission: 4 }).success
    ).toBe(true);
    expect(
      UpdateTeamCollaboratorOneBodySchema.safeParse({
        tmbId: objectId,
        groupId: secondObjectId,
        permission: 4
      }).success
    ).toBe(false);
    expect(
      UpdateTeamCollaboratorBodySchema.safeParse({
        collaborators: [
          {
            tmbId: objectId,
            orgId: thirdObjectId,
            permission: 4
          }
        ]
      }).success
    ).toBe(false);
  });

  it('accepts the root organization value for team member filtering', () => {
    expect(
      ListTeamMembersBodySchema.parse({
        pageSize: '20',
        orgId: ''
      })
    ).toMatchObject({
      pageSize: 20,
      orgId: ''
    });
  });

  it('accepts nullable contact values for historical team members', () => {
    expect(
      ListTeamMembersResponseSchema.parse({
        total: 1,
        list: [
          {
            userId: objectId,
            tmbId: objectId,
            teamId: objectId,
            memberName: '历史成员',
            avatar: null,
            status: 'active',
            contact: null,
            createTime: '2025-01-13T05:34:31.329Z'
          }
        ]
      }).list[0].contact
    ).toBeNull();
  });

  it('accepts the deprecated waiting status for historical team members', () => {
    expect(
      ListTeamMembersResponseSchema.parse({
        total: 1,
        list: [
          {
            userId: objectId,
            tmbId: objectId,
            teamId: objectId,
            memberName: '历史成员',
            avatar: null,
            status: 'waiting',
            contact: null,
            createTime: '2025-01-13T05:34:31.329Z'
          }
        ]
      }).list[0]
    ).toMatchObject({
      status: 'waiting',
      contact: null
    });
  });
});
