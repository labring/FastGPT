import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '@fastgpt/global/openapi/provider/devapi';
import { openAPITagGroups } from '@fastgpt/global/openapi/path';
import { DevApiTagsMap } from '@fastgpt/global/openapi/tag';
import {
  ChangeGroupOwnerBodySchema,
  ChangeGroupOwnerResponseSchema,
  CreateGroupBodySchema,
  CreateGroupResponseSchema,
  DeleteGroupQuerySchema,
  DeleteGroupResponseSchema,
  ListGroupBodySchema,
  ListGroupResponseSchema,
  UpdateGroupBodySchema,
  UpdateGroupResponseSchema
} from '@fastgpt/global/openapi/support/user/team/group/api';

const objectId = '68ad85a7463006c963799a05';
const groupTags = [DevApiTagsMap.teamGroup];

describe('team group OpenAPI contracts', () => {
  it('registers all group APIs under the group management tag', () => {
    const paths = [
      ['/proApi/support/user/team/group/changeOwner', 'put'],
      ['/proApi/support/user/team/group/create', 'post'],
      ['/proApi/support/user/team/group/delete', 'delete'],
      ['/proApi/support/user/team/group/list', 'post'],
      ['/proApi/support/user/team/group/update', 'put']
    ] as const;

    paths.forEach(([path, method]) => {
      expect(openAPIDocument.paths?.[path]?.[method]?.tags).toEqual(groupTags);
    });

    expect(openAPITagGroups.find(({ name }) => name === '辅助-团队体系')?.tags).toContain(
      DevApiTagsMap.teamGroup
    );
  });

  it('parses group request and empty response contracts', () => {
    expect(ChangeGroupOwnerBodySchema.parse({ groupId: objectId, tmbId: objectId })).toEqual({
      groupId: objectId,
      tmbId: objectId
    });
    expect(CreateGroupBodySchema.parse({ name: '研发组' })).toEqual({ name: '研发组' });
    expect(DeleteGroupQuerySchema.parse({ groupId: objectId })).toEqual({ groupId: objectId });
    expect(ListGroupBodySchema.parse({ withMembers: true })).toEqual({ withMembers: true });
    expect(
      UpdateGroupBodySchema.parse({
        groupId: objectId,
        memberList: [{ tmbId: objectId, role: 'member' }]
      })
    ).toEqual({
      groupId: objectId,
      memberList: [{ tmbId: objectId, role: 'member' }]
    });

    expect(CreateGroupResponseSchema.parse(undefined)).toBeUndefined();
    expect(DeleteGroupResponseSchema.parse(undefined)).toBeUndefined();
    expect(UpdateGroupResponseSchema.parse(undefined)).toBeUndefined();
    expect(ChangeGroupOwnerResponseSchema.parse(undefined)).toBeUndefined();
  });

  it('parses group list responses', () => {
    expect(
      ListGroupResponseSchema.parse([
        {
          _id: objectId,
          teamId: objectId,
          name: '研发组',
          avatar: null,
          updateTime: '2026-01-02T00:00:00.000Z',
          members: [{ tmbId: objectId, name: '空头像成员', avatar: null }],
          count: 0
        }
      ])
    ).toHaveLength(1);
  });
});
