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
import {
  CreateEvaluationBodySchema,
  CreateEvaluationFormSchema,
  DeleteEvaluationQuerySchema,
  ExportEvaluationItemsBodySchema,
  ListEvaluationItemsBodySchema,
  ListEvaluationItemsResponseSchema,
  ListEvaluationsBodySchema,
  ListEvaluationsResponseSchema,
  RetryEvaluationItemBodySchema,
  UpdateEvaluationItemBodySchema
} from '../../../openapi/core/app/evaluation/api';
import { EvaluationStatusEnum } from '../../../core/app/evaluation/constants';

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

  it('registers all application evaluation APIs under application evaluation', () => {
    const evaluationPaths = [
      ['/proApi/core/app/evaluation/create', 'post'],
      ['/proApi/core/app/evaluation/delete', 'delete'],
      ['/proApi/core/app/evaluation/deleteItem', 'delete'],
      ['/proApi/core/app/evaluation/exportItems', 'post'],
      ['/proApi/core/app/evaluation/list', 'post'],
      ['/proApi/core/app/evaluation/listItems', 'post'],
      ['/proApi/core/app/evaluation/retryItem', 'post'],
      ['/proApi/core/app/evaluation/updateItem', 'post']
    ] as const;

    evaluationPaths.forEach(([path, method]) => {
      expect(openAPIDocument.paths?.[path]?.[method]).toBeDefined();
      expect(openAPIDocument.paths?.[path]?.[method]?.tags).toEqual([DevApiTagsMap.appEvaluation]);
    });

    expect(openAPITagGroups.find(({ name }) => name === '核心-应用管理')?.tags).toContain(
      DevApiTagsMap.appEvaluation
    );

    const emptyResponsePaths = [
      ['/proApi/core/app/evaluation/create', 'post'],
      ['/proApi/core/app/evaluation/delete', 'delete'],
      ['/proApi/core/app/evaluation/deleteItem', 'delete'],
      ['/proApi/core/app/evaluation/retryItem', 'post'],
      ['/proApi/core/app/evaluation/updateItem', 'post']
    ] as const;
    emptyResponsePaths.forEach(([path, method]) => {
      expect(openAPIDocument.paths?.[path]?.[method]?.responses?.[200]?.content).toBeUndefined();
    });
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
    expect(() =>
      UpdateAppCollaboratorBodySchema.parse({
        appId: objectId,
        collaborators: [
          { tmbId: objectId, permission: 4 },
          { tmbId: objectId, permission: 2 }
        ]
      })
    ).toThrow();
    const collaborators = Array.from({ length: 501 }, (_, index) => ({
      tmbId: `${index.toString(16).padStart(24, '0')}`,
      permission: 4
    }));
    expect(
      UpdateAppCollaboratorBodySchema.parse({ appId: objectId, collaborators }).collaborators
    ).toHaveLength(501);
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

  it('parses application evaluation request and response contracts', () => {
    expect(
      CreateEvaluationBodySchema.parse({
        name: '客服问答评测',
        appId: objectId,
        evalModel: 'gpt-4o-mini'
      })
    ).toEqual({
      name: '客服问答评测',
      appId: objectId,
      evalModel: 'gpt-4o-mini'
    });
    expect(CreateEvaluationFormSchema.parse({ file: {}, data: '{}' })).toEqual({
      file: {},
      data: '{}'
    });
    expect(DeleteEvaluationQuerySchema.parse({ evalId: objectId })).toEqual({ evalId: objectId });
    expect(ListEvaluationsBodySchema.parse({ pageSize: '20', pageNum: '2' })).toEqual({
      pageSize: 20,
      pageNum: 2
    });
    expect(ListEvaluationItemsBodySchema.parse({ evalId: objectId })).toEqual({
      evalId: objectId
    });
    expect(
      ExportEvaluationItemsBodySchema.parse({
        title: '问题,期望答案,实际答案,状态,得分',
        statusMap: {
          [EvaluationStatusEnum.completed]: { label: '已完成' }
        }
      })
    ).toMatchObject({ title: expect.stringContaining('问题') });
    expect(RetryEvaluationItemBodySchema.parse({ evalItemId: objectId })).toEqual({
      evalItemId: objectId
    });
    expect(
      UpdateEvaluationItemBodySchema.parse({
        evalItemId: objectId,
        question: '如何重置密码？',
        expectedResponse: '请点击忘记密码。',
        variables: { language: 'zh-CN' }
      })
    ).toMatchObject({ evalItemId: objectId });

    expect(
      ListEvaluationsResponseSchema.parse({
        total: 1,
        list: [
          {
            _id: objectId,
            appId: objectId,
            name: '客服问答评测',
            createTime: '2026-01-02T00:00:00.000Z',
            evalModel: 'gpt-4o-mini',
            appName: '客服应用',
            completedCount: 1,
            errorCount: 0,
            totalCount: 1,
            score: 0.9
          }
        ]
      }).list
    ).toHaveLength(1);
    expect(
      ListEvaluationItemsResponseSchema.parse({
        total: 1,
        list: [
          {
            evalItemId: objectId,
            evalId: objectId,
            retry: 3,
            question: '如何重置密码？',
            expectedResponse: '请点击忘记密码。',
            status: EvaluationStatusEnum.completed,
            response: null,
            globalVariables: { language: 'zh-CN' }
          }
        ]
      }).list
    ).toHaveLength(1);
  });
});
