import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '@fastgpt/global/openapi/provider/devapi';
import {
  AuditListBodySchema,
  AuditListResponseSchema
} from '@fastgpt/global/openapi/support/user/audit/api';
import {
  GetUnreadInformResponseSchema,
  GetUserInformListBodySchema,
  GetUserInformListResponseSchema,
  ReadInformQuerySchema
} from '@fastgpt/global/openapi/support/user/inform/api';
import {
  SearchMembersOrgsGroupsQuerySchema,
  SearchMembersOrgsGroupsResponseSchema,
  UserSyncBodySchema,
  UserSyncResponseSchema
} from '@fastgpt/global/openapi/support/user/team/api';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { InformLevelEnum } from '@fastgpt/global/support/user/inform/constants';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';

const objectId = '68ad85a7463006c963799a05';

describe('support user OpenAPI contracts', () => {
  it('registers all requested Pro user routes', () => {
    expect(openAPIDocument.paths?.['/proApi/support/user/audit/list']?.post).toBeDefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/inform/list']?.post).toBeDefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/inform/countUnread']?.get).toBeDefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/inform/read']?.get).toBeDefined();
    expect(
      openAPIDocument.paths?.['/proApi/support/user/team/searchMembersOrgsGroups']?.get
    ).toBeDefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/team/search']).toBeUndefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/team/sync']?.post).toBeDefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/search']).toBeUndefined();
    expect(openAPIDocument.paths?.['/proApi/support/user/sync']).toBeUndefined();
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
});
