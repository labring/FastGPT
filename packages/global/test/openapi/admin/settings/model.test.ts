import { describe, expect, it } from 'vitest';
import { createDocument } from 'zod-openapi';
import {
  AdminSystemModelReferenceSchema,
  CreateSystemModelBodySchema,
  CreateSystemModelsFromTemplatesBodySchema,
  DeleteSystemModelsBodySchema,
  ImportedSystemModelSchema,
  ReplaceSystemModelChannelsBodySchema,
  TestAdminSystemModelQuerySchema,
  UpdateSystemModelBodySchema,
  UpdateSystemModelStatusBodySchema
} from '../../../../openapi/admin/system/model/api';
import { AdminSystemModelPath } from '../../../../openapi/admin/system/model';
import { AdminSystemChannelPath } from '../../../../openapi/admin/system/model/channel';
import { openAPITagGroups, openAPIPaths } from '../../../../openapi/path';
import { openAPIDocument } from '../../../../openapi/provider/devapi';
import { DevApiTagsMap } from '../../../../openapi/tag';

describe('admin system model API schemas', () => {
  it('only accepts modelId as a model reference', () => {
    const modelId = '68ad85a7463006c963799a05';

    expect(AdminSystemModelReferenceSchema.parse({ modelId, model: 'gpt-4o' })).toEqual({
      modelId
    });
    expect(() => AdminSystemModelReferenceSchema.parse({ model: 'gpt-4o' })).toThrow();
    expect(TestAdminSystemModelQuerySchema.parse({ modelId, channelId: '1' })).toEqual({
      modelId,
      channelId: 1
    });
  });

  it('can generate the admin model OpenAPI document', () => {
    expect(() =>
      createDocument({
        openapi: '3.1.0',
        info: { title: 'Admin model API', version: '1.0.0' },
        paths: { ...AdminSystemModelPath, ...AdminSystemChannelPath }
      })
    ).not.toThrow();
  });

  it('documents the create body modelData as a discriminated union', () => {
    // 回归：曾用 z.unknown().pipe(...) 实现，zod-openapi 只能输出 description，
    // 生成的客户端会把 modelData 当成 null/any。
    const document = createDocument({
      openapi: '3.1.0',
      info: { title: 'Admin model API', version: '1.0.0' },
      paths: AdminSystemModelPath
    });
    const body = document.paths?.['/admin/system/model/create']?.post?.requestBody as
      | { content: { 'application/json': { schema: { properties: Record<string, unknown> } } } }
      | undefined;
    const modelData = body?.content['application/json'].schema.properties.modelData as
      | { type?: string; oneOf?: unknown[] }
      | undefined;

    expect(modelData?.type).toBe('object');
    expect(modelData?.oneOf).toHaveLength(5);
  });

  it('validates unique model IDs for batch status and delete operations', () => {
    const modelIds = ['68ad85a7463006c963799a05', '68ad85a7463006c963799a06'];

    expect(DeleteSystemModelsBodySchema.parse({ modelIds })).toEqual({ modelIds });
    expect(UpdateSystemModelStatusBodySchema.parse({ modelIds, isActive: false })).toEqual({
      modelIds,
      isActive: false
    });
    expect(() =>
      DeleteSystemModelsBodySchema.parse({ modelIds: [modelIds[0], modelIds[0]] })
    ).toThrow('modelIds must be unique');
  });

  it('enforces the batch model ID boundaries', () => {
    const modelIds = Array.from({ length: 501 }, (_, index) =>
      (index + 1).toString(16).padStart(24, '0')
    );

    expect(
      DeleteSystemModelsBodySchema.parse({ modelIds: modelIds.slice(0, 500) }).modelIds
    ).toHaveLength(500);
    expect(() => DeleteSystemModelsBodySchema.parse({ modelIds })).toThrow();
    expect(() =>
      UpdateSystemModelStatusBodySchema.parse({ modelIds: [], isActive: true })
    ).toThrow();
  });

  it('enforces the template creation batch boundary', () => {
    const templates = Array.from({ length: 501 }, (_, index) => ({
      type: 'llm' as const,
      model: `model-${index}`
    }));

    expect(
      CreateSystemModelsFromTemplatesBodySchema.parse({
        templates: templates.slice(0, 500),
        channelIds: []
      }).templates
    ).toHaveLength(500);
    expect(() =>
      CreateSystemModelsFromTemplatesBodySchema.parse({ templates, channelIds: [] })
    ).toThrow();
  });

  it('strips legacy model fields and rejects invalid channel IDs at write boundaries', () => {
    const modelData = {
      type: 'llm' as const,
      provider: 'OpenAI',
      model: 'gpt-new',
      name: 'GPT New',
      scope: 'system' as const,
      isActive: false,
      config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
    };

    expect(
      CreateSystemModelBodySchema.parse({
        modelData: {
          ...modelData,
          modelId: '68ad85a7463006c963799a05',
          legacyClientField: true
        },
        channelIds: []
      })
    ).toEqual({ modelData, channelIds: [] });
    expect(() => CreateSystemModelBodySchema.parse({ modelData, channelIds: [0] })).toThrow();
    expect(() =>
      ReplaceSystemModelChannelsBodySchema.parse({
        modelId: '68ad85a7463006c963799a05',
        channelIds: [-1]
      })
    ).toThrow();
  });

  it('accepts optional model identifier in update data and rejects empty strings', () => {
    const modelId = '68ad85a7463006c963799a05';
    const modelData = {
      type: 'llm' as const,
      provider: 'OpenAI',
      name: 'GPT',
      scope: 'system' as const,
      config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
    };

    expect(UpdateSystemModelBodySchema.parse({ modelId, modelData })).toEqual({
      modelId,
      modelData
    });
    expect(
      UpdateSystemModelBodySchema.parse({
        modelId,
        modelData: { ...modelData, model: 'renamed-model' }
      })
    ).toEqual({
      modelId,
      modelData: { ...modelData, model: 'renamed-model' }
    });
    expect(() =>
      UpdateSystemModelBodySchema.parse({
        modelId,
        modelData: { ...modelData, model: '   ' }
      })
    ).toThrow();
  });

  it('loads every admin model route into the DevAPI document under system resources', () => {
    expect(openAPITagGroups).toContainEqual({
      name: '系统资源',
      tags: [
        DevApiTagsMap.adminSystemModel,
        DevApiTagsMap.adminModelChannel,
        DevApiTagsMap.adminModelLog,
        DevApiTagsMap.pluginAdmin,
        DevApiTagsMap.pluginToolAdmin,
        DevApiTagsMap.adminTemplate,
        DevApiTagsMap.adminTemplateType
      ]
    });

    for (const [path, operations] of Object.entries(AdminSystemModelPath)) {
      expect(openAPIPaths[path]).toBe(operations);
      expect(openAPIDocument.paths?.[path]).toBeDefined();
      for (const operation of Object.values(operations ?? {})) {
        expect(operation?.tags).toEqual([DevApiTagsMap.adminSystemModel]);
      }
    }

    const monitoringPaths = new Set([
      '/aiproxy/api/logs/search',
      '/aiproxy/api/logs/detail/{id}',
      '/aiproxy/api/dashboardv2/'
    ]);
    for (const [path, operations] of Object.entries(AdminSystemChannelPath)) {
      expect(openAPIPaths[path]).toBe(operations);
      expect(openAPIDocument.paths?.[path]).toBeDefined();
      for (const operation of Object.values(operations ?? {})) {
        expect(operation?.tags).toEqual([
          monitoringPaths.has(path) ? DevApiTagsMap.adminModelLog : DevApiTagsMap.adminModelChannel
        ]);
      }
    }
  });

  it('keeps type-specific config fields without strict-mode import failures', () => {
    const parsed = ImportedSystemModelSchema.parse({
      modelId: '68ad85a7463006c963799a05',
      scope: 'system',
      type: 'embedding',
      provider: 'openai',
      model: 'text-embedding-3-small',
      name: 'Text embedding 3 small',
      requestUrl: 'https://example.com/v1',
      requestAuth: 'secret-token',
      unknownTopLevel: 'strip-me',
      config: {
        defaultToken: 512,
        maxToken: 8192,
        weight: 100,
        defaultConfig: { dimensions: 1536 },
        dbConfig: { dimensions: 1536 },
        queryConfig: { dimensions: 1024 },
        unknownConfig: 'strip-me'
      }
    });

    expect(parsed).toMatchObject({
      requestUrl: 'https://example.com/v1',
      requestAuth: 'secret-token',
      config: {
        defaultConfig: { dimensions: 1536 },
        dbConfig: { dimensions: 1536 },
        queryConfig: { dimensions: 1024 }
      }
    });
    expect(parsed).not.toHaveProperty('unknownTopLevel');
    expect(parsed.config).not.toHaveProperty('unknownConfig');
  });
});
