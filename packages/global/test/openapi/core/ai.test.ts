import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../openapi/provider/devapi';
import { openAPITagGroups } from '../../../openapi/path';
import { DevApiTagsMap } from '../../../openapi/tag';
import {
  ChangeSkillOwnerBodySchema,
  ChangeSkillOwnerResponseSchema,
  GetSkillCollaboratorListQuerySchema,
  GetSkillCollaboratorListResponseSchema,
  UpdateSkillCollaboratorBodySchema,
  UpdateSkillCollaboratorResponseSchema
} from '../../../openapi/core/ai/skill/api';

const objectId = '68ad85a7463006c963799a05';

const expectedPaths = {
  '/core/ai/optimizePrompt': 'post',
  '/core/ai/sandbox/keepalive': 'post',
  '/core/ai/sandbox/verifyTicket': 'get',
  '/core/ai/skill/copy': 'post',
  '/core/ai/skill/resumeInheritPermission': 'get',
  '/proApi/core/ai/skill/changeOwner': 'post',
  '/proApi/core/ai/skill/collaborator/list': 'get',
  '/proApi/core/ai/skill/collaborator/update': 'post',
  '/core/workflow/optimizeCode': 'post',
  '/core/workflow/getSandboxPackages': 'get'
} as const;

describe('AI OpenAPI contracts', () => {
  it.each(Object.entries(expectedPaths))('registers %s as %s', (path, method) => {
    expect(openAPIDocument.paths?.[path]?.[method]).toBeDefined();
  });

  it('documents both sandbox ticket verification modes', () => {
    const operation = openAPIDocument.paths?.['/core/ai/sandbox/verifyTicket']?.get;
    const parameters = operation?.parameters ?? [];

    expect(parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'ticket', in: 'query' }),
        expect.objectContaining({ name: 'x-proxy-token', in: 'header', required: true }),
        expect.objectContaining({
          name: 'x-sandbox-preview-session',
          in: 'header'
        })
      ])
    );
  });

  it('groups AI generation helpers under the dedicated section', () => {
    expect(openAPITagGroups).toContainEqual({
      name: '核心 - AI 辅助生成',
      tags: [DevApiTagsMap.aiAuxiliary, DevApiTagsMap.workflowHelper]
    });
    expect(openAPITagGroups.some(({ name }) => name === '系统接口')).toBe(false);
    expect(openAPIDocument.paths?.['/core/ai/optimizePrompt']?.post?.tags).toEqual([
      DevApiTagsMap.aiAuxiliary
    ]);
    expect(
      openAPIDocument.paths?.['/proApi/core/chat/chatAgentHelper/completions']?.post?.tags
    ).toEqual([DevApiTagsMap.aiAuxiliary]);
    expect(openAPIDocument.paths?.['/core/workflow/optimizeCode']?.post?.tags).toEqual([
      DevApiTagsMap.workflowHelper
    ]);
    expect(openAPIDocument.paths?.['/core/workflow/getSandboxPackages']?.get?.tags).toEqual([
      DevApiTagsMap.appOther
    ]);
    expect(openAPITagGroups.find(({ name }) => name === '核心-应用管理')?.tags).toContain(
      DevApiTagsMap.appOther
    );
  });

  it('groups Skill permission APIs with resource and collaborator tags', () => {
    expect(openAPIDocument.paths?.['/proApi/core/ai/skill/changeOwner']?.post?.tags).toEqual([
      DevApiTagsMap.permissionResource,
      DevApiTagsMap.skillPermission
    ]);
    expect(openAPIDocument.paths?.['/proApi/core/ai/skill/collaborator/list']?.get?.tags).toEqual([
      DevApiTagsMap.permissionCollaborator,
      DevApiTagsMap.skillPermission
    ]);
    expect(
      openAPIDocument.paths?.['/proApi/core/ai/skill/collaborator/update']?.post?.tags
    ).toEqual([DevApiTagsMap.permissionCollaborator, DevApiTagsMap.skillPermission]);

    const requestBody =
      openAPIDocument.paths?.['/proApi/core/ai/skill/collaborator/update']?.post?.requestBody;
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

  it('parses Skill permission API requests and empty responses', () => {
    expect(
      ChangeSkillOwnerBodySchema.parse({
        skillId: objectId,
        ownerId: objectId
      })
    ).toEqual({ skillId: objectId, ownerId: objectId });
    expect(ChangeSkillOwnerResponseSchema.parse(undefined)).toBeUndefined();

    expect(GetSkillCollaboratorListQuerySchema.parse({ skillId: objectId })).toEqual({
      skillId: objectId
    });
    expect(GetSkillCollaboratorListResponseSchema.parse({ clbs: [], parentClbs: [] })).toEqual({
      clbs: [],
      parentClbs: []
    });

    expect(() =>
      UpdateSkillCollaboratorBodySchema.parse({ skillId: objectId, collaborators: [] })
    ).toThrow();
    expect(
      UpdateSkillCollaboratorBodySchema.parse({
        skillId: objectId,
        collaborators: [{ tmbId: objectId, permission: 4 }]
      })
    ).toEqual({
      skillId: objectId,
      collaborators: [{ tmbId: objectId, permission: 4 }]
    });
    expect(UpdateSkillCollaboratorResponseSchema.parse(undefined)).toBeUndefined();
  });

  it('groups Skill APIs under the dedicated Skill section', () => {
    expect(openAPITagGroups).toContainEqual({
      name: '核心-技能',
      tags: [
        DevApiTagsMap.skillBasic,
        DevApiTagsMap.skillPermission,
        DevApiTagsMap.skillEdit,
        DevApiTagsMap.skillDebug,
        DevApiTagsMap.skillVersion
      ]
    });
    expect(openAPIDocument.paths?.['/core/ai/skill/list']?.post?.tags).toEqual([
      DevApiTagsMap.skillBasic
    ]);
    expect(openAPIDocument.paths?.['/core/ai/skill/listV2']?.post?.tags).toEqual([
      DevApiTagsMap.skillBasic
    ]);
    expect(openAPIDocument.paths?.['/core/ai/skill/runtime/init']?.post?.tags).toEqual([
      DevApiTagsMap.skillEdit
    ]);
    expect(openAPIDocument.paths?.['/core/ai/skill/version/list']?.post?.tags).toEqual([
      DevApiTagsMap.skillVersion
    ]);
  });

  it('groups chat resume under session operations', () => {
    expect(openAPIDocument.paths?.['/core/chat/resume']?.get?.tags).toEqual([
      DevApiTagsMap.chatController
    ]);
  });
});
