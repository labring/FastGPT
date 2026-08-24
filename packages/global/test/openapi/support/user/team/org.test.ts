import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../../../openapi/provider/devapi';
import { DevApiTagsMap } from '../../../../../openapi/tag';
import {
  CreateOrgBodySchema,
  DeleteOrgMemberQuerySchema,
  DeleteOrgQuerySchema,
  ListOrgBodySchema,
  ListOrgResponseSchema,
  MoveOrgBodySchema,
  UpdateOrgBodySchema,
  UpdateOrgMembersBodySchema
} from '../../../../../openapi/support/user/team/org/api';

const objectId = '68ad85a7463006c963799a05';
const departmentPath = '/proApi/support/user/team/org';

describe('team department OpenAPI contracts', () => {
  it('registers all department routes with the department tag', () => {
    expect(openAPIDocument.paths?.[`${departmentPath}/create`]?.post?.tags).toEqual([
      DevApiTagsMap.teamOrg
    ]);
    expect(openAPIDocument.paths?.[`${departmentPath}/delete`]?.delete?.tags).toEqual([
      DevApiTagsMap.teamOrg
    ]);
    expect(openAPIDocument.paths?.[`${departmentPath}/deleteMember`]?.delete?.tags).toEqual([
      DevApiTagsMap.teamOrg
    ]);
    expect(openAPIDocument.paths?.[`${departmentPath}/list`]?.post?.tags).toEqual([
      DevApiTagsMap.teamOrg
    ]);
    expect(openAPIDocument.paths?.[`${departmentPath}/move`]?.put?.tags).toEqual([
      DevApiTagsMap.teamOrg
    ]);
    expect(openAPIDocument.paths?.[`${departmentPath}/update`]?.put?.tags).toEqual([
      DevApiTagsMap.teamOrg
    ]);
    expect(openAPIDocument.paths?.[`${departmentPath}/updateMembers`]?.put?.tags).toEqual([
      DevApiTagsMap.teamOrg
    ]);

    const emptyResponseOperations = [
      openAPIDocument.paths?.[`${departmentPath}/create`]?.post,
      openAPIDocument.paths?.[`${departmentPath}/delete`]?.delete,
      openAPIDocument.paths?.[`${departmentPath}/deleteMember`]?.delete,
      openAPIDocument.paths?.[`${departmentPath}/move`]?.put,
      openAPIDocument.paths?.[`${departmentPath}/update`]?.put,
      openAPIDocument.paths?.[`${departmentPath}/updateMembers`]?.put
    ];
    emptyResponseOperations.forEach((operation) => {
      expect(operation?.responses?.[200]?.content).toBeUndefined();
    });
  });

  it('parses root department compatibility values', () => {
    expect(CreateOrgBodySchema.parse({ name: '研发部', orgId: '' })).toMatchObject({
      name: '研发部',
      orgId: ''
    });
    expect(DeleteOrgQuerySchema.parse({ orgId: objectId })).toEqual({ orgId: objectId });
    expect(DeleteOrgMemberQuerySchema.parse({ orgId: '', tmbId: objectId })).toMatchObject({
      orgId: '',
      tmbId: objectId
    });
    expect(ListOrgBodySchema.parse({ orgId: '', withPermission: 'true' })).toMatchObject({
      orgId: '',
      withPermission: true
    });
    expect(MoveOrgBodySchema.parse({ orgId: objectId, targetOrgId: '' })).toMatchObject({
      orgId: objectId,
      targetOrgId: ''
    });
    expect(UpdateOrgBodySchema.parse({ orgId: objectId, name: '产品部' })).toEqual({
      orgId: objectId,
      name: '产品部'
    });
    expect(
      UpdateOrgMembersBodySchema.parse({
        orgId: objectId,
        members: [{ tmbId: objectId }]
      })
    ).toMatchObject({ orgId: objectId, members: [{ tmbId: objectId }] });
  });

  it('parses the department list response', () => {
    expect(
      ListOrgResponseSchema.parse([
        {
          _id: objectId,
          teamId: objectId,
          pathId: 'department-path',
          path: '/root',
          name: '研发部',
          avatar: 'https://example.com/avatar.png',
          updateTime: '2026-01-02T00:00:00.000Z',
          total: 3
        }
      ])
    ).toHaveLength(1);
  });
});
