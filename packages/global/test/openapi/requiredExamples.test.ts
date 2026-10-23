import { openAPIDocument } from '../../openapi/provider/devapi';
import { CollaboratorItemSchema } from '../../support/permission/collaborator.schema';
import { SearchDatasetTestBodySchema } from '../../openapi/core/dataset/api';
import { UpdateTrainingDataBodySchema } from '../../openapi/core/dataset/training/api';
import {
  UpdateDatasetCollectionBodySchema,
  ExportCollectionBodyRawSchema
} from '../../openapi/core/dataset/collection/api';
import { UpdateApiKeyBodySchema } from '../../openapi/support/openapi/api';
import { UpdateOpenApiTagBodySchema } from '../../openapi/support/openapi/tag';
import { McpAuthProxySchema } from '../../openapi/support/mcpServer/api';
import { ChatCompletionAuthProxySchema } from '../../openapi/core/chat/completion/api';
import {
  GetPaginationRecordsBodyRawSchema,
  GetRecordsV2BodyRawSchema,
  GetResDataQueryRawSchema
} from '../../openapi/core/chat/record/api';
import {
  ClearChatHistoriesRawSchema,
  DelChatHistoryRawSchema
} from '../../openapi/core/chat/history/api';
import { InitChatQueryRawSchema } from '../../openapi/core/chat/controler/api';
import { ResumeStreamParamsRawSchema } from '../../openapi/core/ai/api';
import { SandboxUploadQueryRawSchema } from '../../openapi/core/ai/sandbox/api';
import { describe, expect, it } from 'vitest';
import { createDocument, createSchema } from 'zod-openapi';
import z from 'zod';
import { setRequiredRequestExamples } from '../../openapi/requiredExamples';
import { openApiDocumentOptions } from '../../openapi/generation';
import {
  createChatTargetInputSchema,
  createOutLinkChatTargetInputSchema,
  createOptionalChatTargetInputSchema,
  createPaginatedChatTargetInputSchema
} from '../../openapi/core/chat/api';

/** 用真实 zod-openapi 输出验证示例处理，确保文档约束和响应不被修改。 */
const build = (schema: z.ZodType) => {
  const document = createDocument(
    {
      openapi: '3.1.0',
      info: { title: 'test', version: '1' },
      paths: {
        '/test': {
          post: {
            requestBody: { content: { 'application/json': { schema } } },
            responses: { '200': { description: 'ok' } }
          }
        }
      }
    },
    openApiDocumentOptions
  );
  const original = structuredClone(document);
  setRequiredRequestExamples(document);
  const body = document.paths!['/test']!.post!.requestBody;
  if (!body || '$ref' in body) throw new Error('Missing request body');
  const media = body.content['application/json'];
  expect(media.schema).toEqual(
    (original.paths!['/test']!.post!.requestBody as typeof body).content['application/json'].schema
  );
  expect(document.paths!['/test']!.post!.responses).toEqual(
    original.paths!['/test']!.post!.responses
  );
  return media.example;
};

describe('setRequiredRequestExamples', () => {
  it.each([createChatTargetInputSchema, createOutLinkChatTargetInputSchema])(
    'generates a single target example while accepting a higher-priority skill at runtime',
    (createSchema) => {
      const schema = createSchema({ chatId: z.string().meta({ example: 'chat' }) });
      const example = build(schema);
      expect(example).toEqual({ appId: '68ad85a7463006c963799a05', chatId: 'chat' });
      expect(schema.safeParse(example).success).toBe(true);
      const selected = schema.parse({ ...example, skillId: '68ad85a7463006c963799a06' });
      expect(selected.skillId).toBe('68ad85a7463006c963799a06');
      expect(selected.appId).toBeUndefined();
    }
  );

  it('names authentication and pagination choices and hides incompatible fields', () => {
    const { schema } = createSchema(createPaginatedChatTargetInputSchema({ chatId: z.string() }), {
      io: 'input',
      opts: openApiDocumentOptions
    });
    expect(schema.anyOf?.map((branch) => branch.title)).toEqual([
      '应用会话',
      'Skill 调试会话',
      '外链会话'
    ]);
    expect(schema.anyOf?.[0].allOf?.[1].anyOf?.map((branch) => branch.title)).toEqual([
      '按偏移量获取',
      '按页码获取'
    ]);
    expect(schema.anyOf?.[0].allOf?.[0].properties).not.toHaveProperty('skillId');
    expect(schema.anyOf?.[0].allOf?.[0].properties).not.toHaveProperty('outLinkAuthData');
    expect(schema.anyOf?.[1].allOf?.[0].properties).not.toHaveProperty('appId');
    expect(schema.anyOf?.[1].allOf?.[0].properties).not.toHaveProperty('sourceType');
    expect(schema.anyOf?.[1].allOf?.[0].required).toContain('skillId');
    expect(schema.anyOf?.[2].allOf?.[0].properties).not.toHaveProperty('appId');
    expect(schema.anyOf?.[2].allOf?.[0].properties).not.toHaveProperty('skillId');
    expect(schema.anyOf?.[2].allOf?.[0].properties).not.toHaveProperty('sourceType');
    expect(schema.anyOf?.[2].allOf?.[0].required).toContain('outLinkAuthData');

    // 身份字段独立展示在分页选择之前，避免切换会话格式后仍先看到分页参数。
    for (const [index, field] of ['appId', 'skillId', 'outLinkAuthData'].entries()) {
      const [target, pagination] = schema.anyOf![index].allOf!;
      expect(Object.keys(target.properties!)[0]).toBe(field);
      expect(target.required).toContain(field);
      for (const [pageIndex, pageField] of ['offset', 'pageNum'].entries()) {
        const properties = pagination.anyOf![pageIndex].properties!;
        expect(Object.keys(properties)[0]).toBe(pageField);
        expect(properties).not.toHaveProperty(field);
      }
    }
  });

  it('does not select a target when the entire choice is optional', () => {
    expect(build(createOptionalChatTargetInputSchema({}))).toEqual({});
  });
  it('omits defaults wrapped in preprocess even when exported as required', () => {
    expect(
      build(
        z.object({
          id: z.string().meta({ example: 'id' }),
          stream: z.preprocess((value) => value ?? undefined, z.boolean().default(false))
        })
      )
    ).toEqual({ id: 'id' });
  });
  it('keeps primitive union branches as primitive values', () => {
    expect(build(z.object({ value: z.union([z.string(), z.array(z.string())]) }))).toEqual({
      value: 'string'
    });
  });
  it('omits optional fields recursively even when explicitly included in examples', () => {
    expect(
      build(
        z
          .object({
            id: z.string().meta({ example: 'id' }),
            optional: z.string().optional().meta({ example: 'omit' }),
            nested: z.object({ required: z.boolean(), optional: z.string().optional() }),
            rows: z.array(z.object({ id: z.number(), optional: z.string().optional() }))
          })
          .meta({
            example: {
              id: 'supplied',
              optional: 'omit',
              nested: { required: true, optional: 'omit' },
              rows: [{ id: 3, optional: 'omit' }]
            }
          })
      )
    ).toEqual({ id: 'supplied', nested: { required: true }, rows: [{ id: 3 }] });
  });

  it('uses the first union branch and enum value', () => {
    expect(
      build(
        z.union([
          z.object({
            kind: z.literal('first'),
            value: z.enum(['a', 'b']),
            optional: z.string().optional()
          }),
          z.object({ kind: z.literal('second'), other: z.string() })
        ])
      )
    ).toEqual({ kind: 'first', value: 'a' });
  });

  it('merges required fields from intersections', () => {
    expect(
      build(
        z.intersection(
          z.object({ left: z.string().meta({ example: 'left' }), optional: z.string().optional() }),
          z.object({ right: z.number().meta({ example: 1 }) })
        )
      )
    ).toEqual({ left: 'left', right: 1 });
  });

  it('keeps an empty body when every field is optional', () => {
    expect(build(z.object({ optional: z.string().default('omit') }))).toEqual({});
  });
});

describe('conditional required API examples', () => {
  it.each([
    ['collaborator', CollaboratorItemSchema, 'tmbId'],
    ['search', SearchDatasetTestBodySchema, 'text'],
    ['training', UpdateTrainingDataBodySchema, 'dataId'],
    ['collection update', UpdateDatasetCollectionBodySchema, 'id'],
    ['collection export', ExportCollectionBodyRawSchema, 'appId'],
    ['API key update', UpdateApiKeyBodySchema, 'name'],
    ['API key tag update', UpdateOpenApiTagBodySchema, 'name'],
    ['MCP proxy', McpAuthProxySchema, 'username'],
    ['chat proxy', ChatCompletionAuthProxySchema, 'tmbId'],
    ['pagination records', GetPaginationRecordsBodyRawSchema, 'appId'],
    ['records v2', GetRecordsV2BodyRawSchema, 'appId']
  ] as const)('produces a valid minimal example for %s', (_, schema, field) => {
    const example = build(schema);
    expect(example).toHaveProperty(field);
    expect(schema.safeParse(example).success).toBe(true);
  });

  it.each([
    ['/core/chat/history/clearHistories', 'delete', ClearChatHistoriesRawSchema, ['appId']],
    ['/core/chat/history/delHistory', 'delete', DelChatHistoryRawSchema, ['appId', 'chatId']],
    ['/core/chat/init', 'get', InitChatQueryRawSchema, ['appId', 'chatId']],
    ['/core/chat/record/getResData', 'get', GetResDataQueryRawSchema, ['appId', 'dataId']],
    ['/core/chat/resume', 'get', ResumeStreamParamsRawSchema, ['appId', 'chatId']],
    ['/core/ai/sandbox/upload', 'post', SandboxUploadQueryRawSchema, ['appId', 'chatId', 'path']]
  ] as const)(
    'preserves Query union fields and emits only the first branch example for %s',
    (path, method, schema, expectedFields) => {
      const parameters = openAPIDocument.paths![path]![method]!.parameters!;
      expect(parameters).toHaveLength(1);
      const parameter = parameters[0];
      if ('$ref' in parameter) throw new Error('Unexpected parameter reference');
      expect(parameter).toMatchObject({
        name: 'query',
        in: 'query',
        required: true,
        style: 'form',
        explode: true
      });
      // 文档保留所有分支及字段说明，示例只选首个分支，不把其他身份拼进同一请求。
      expect(parameter.schema).toEqual(
        createSchema(schema, { io: 'input', opts: openApiDocumentOptions }).schema
      );
      expect(Object.keys(parameter.examples!)).toEqual(['default']);
      const example = parameter.examples!.default;
      if ('$ref' in example) throw new Error('Unexpected example reference');
      expect(example['x-disabled']).toBe(false);
      expect(Object.keys(example.value).sort()).toEqual([...expectedFields].sort());
      expect(schema.safeParse(example.value).success).toBe(true);
    }
  );

  it.each([
    ['/core/app/tool/getPreviewNode', 'get', ['appId', 'versionId']],
    ['/proApi/support/user/team/collaborator/delete', 'delete', ['tmbId']],
    ['/core/dataset/collection/delete', 'post', ['id']],
    ['/core/ai/sandbox/verifyTicket', 'get', ['ticket', 'x-proxy-token']]
  ] as const)('enables only the first parameter alternative for %s', (path, method, expected) => {
    const operation = openAPIDocument.paths![path]![method]!;
    const parameters = operation.parameters!.map((parameter) => {
      if ('$ref' in parameter) throw new Error('Unexpected ref');
      return parameter;
    });
    const enabled = parameters.filter((parameter) => {
      const example = parameter.examples!.default;
      if ('$ref' in example) throw new Error('Unexpected ref');
      return example['x-disabled'] === false;
    });
    expect(enabled.map((parameter) => parameter.name).sort()).toEqual([...expected].sort());
    // A choice remains optional individually; only its example is selected.
    if (path !== '/core/app/tool/getPreviewNode') {
      expect(parameters.find((parameter) => parameter.name === expected[0])?.required).not.toBe(
        true
      );
    }
  });
});
