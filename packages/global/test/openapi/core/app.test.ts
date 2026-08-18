import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../openapi/provider/devapi';
import { openAPITagGroups } from '../../../openapi/path';
import { DevApiTagsMap } from '../../../openapi/tag';
import {
  ChangeAppOwnerBodySchema,
  ChangeAppOwnerResponseSchema
} from '../../../openapi/core/app/permission/api';
import { UpdateAppCollaboratorBodySchema } from '../../../openapi/support/permission/api';
import {
  GetTemplateTypesQuerySchema,
  GetTemplateTypesResponseSchema
} from '../../../openapi/core/app/template/api';

const objectId = '68ad85a7463006c963799a05';

describe('App OpenAPI contracts', () => {
  it('registers app ownership transfer and template type APIs', () => {
    expect(openAPIDocument.paths?.['/proApi/core/app/changeOwner']?.post).toBeDefined();
    expect(
      openAPIDocument.paths?.['/proApi/core/app/template/getTemplateTypes']?.get
    ).toBeDefined();
    const requestBody =
      openAPIDocument.paths?.['/proApi/core/app/collaborator/update']?.post?.requestBody;
    const requestSchema =
      requestBody && 'content' in requestBody
        ? requestBody.content?.['application/json']?.schema
        : undefined;

    expect(requestSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          collaborators: expect.objectContaining({ minItems: 1 })
        })
      })
    );
  });

  it('groups app ownership transfer under permission and template types under template management', () => {
    expect(openAPIDocument.paths?.['/proApi/core/app/changeOwner']?.post?.tags).toEqual([
      DevApiTagsMap.permissionResource,
      DevApiTagsMap.appPer
    ]);
    expect(
      openAPIDocument.paths?.['/proApi/core/app/template/getTemplateTypes']?.get?.tags
    ).toEqual([DevApiTagsMap.appTemplate]);
    expect(openAPITagGroups.find(({ name }) => name === '核心-应用管理')?.tags).toContain(
      DevApiTagsMap.appTemplate
    );
  });

  it('parses app ownership and template type API contracts', () => {
    expect(ChangeAppOwnerBodySchema.parse({ appId: objectId, ownerId: objectId })).toEqual({
      appId: objectId,
      ownerId: objectId
    });
    expect(ChangeAppOwnerResponseSchema.parse(undefined)).toBeUndefined();
    expect(() =>
      UpdateAppCollaboratorBodySchema.parse({ appId: objectId, collaborators: [] })
    ).toThrow();
    expect(
      UpdateAppCollaboratorBodySchema.parse({
        appId: objectId,
        collaborators: [{ tmbId: objectId, permission: 4 }]
      })
    ).toEqual({
      appId: objectId,
      collaborators: [{ tmbId: objectId, permission: 4 }]
    });
    expect(GetTemplateTypesQuerySchema.parse({})).toEqual({});
    expect(
      GetTemplateTypesResponseSchema.parse([
        {
          typeName: '写作',
          typeId: 'writing',
          typeOrder: 0
        }
      ])
    ).toHaveLength(1);
  });
});
