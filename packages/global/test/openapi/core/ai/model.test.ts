import { describe, expect, it } from 'vitest';
import { createDocument } from 'zod-openapi';
import {
  ModelReferenceSchema,
  CreateModelBodySchema,
  CreateModelsFromTemplatesBodySchema,
  DeleteModelsBodySchema,
  TestModelQuerySchema,
  UpdateModelBodySchema,
  UpdateModelStatusBodySchema,
  ImportedSystemModelSchema
} from '../../../../openapi/core/ai/model/api';
import { AIModelPath } from '../../../../openapi/core/ai/model';
import { ChannelPath } from '../../../../openapi/core/ai/model/channel';
import { GetAffectedModelsQuerySchema } from '../../../../openapi/core/ai/model/channel/api';
import { openAPITagGroups, openAPIPaths } from '../../../../openapi/path';
import { openAPIDocument } from '../../../../openapi/provider/devapi';
import { DevApiTagsMap } from '../../../../openapi/tag';

describe('admin system model API schemas', () => {
  it('only accepts modelId as a model reference', () => {
    const modelId = '68ad85a7463006c963799a05';

    expect(ModelReferenceSchema.parse({ modelId, model: 'gpt-4o', channelType: 'system' })).toEqual(
      {
        modelId,
        channelType: 'system'
      }
    );
    expect(() => ModelReferenceSchema.parse({ model: 'gpt-4o', channelType: 'system' })).toThrow();
    expect(TestModelQuerySchema.parse({ modelId, channelId: '1', channelType: 'system' })).toEqual({
      modelId,
      channelId: 1,
      channelType: 'system'
    });
  });

  it('can generate the admin model OpenAPI document', () => {
    expect(() =>
      createDocument({
        openapi: '3.1.0',
        info: { title: 'Admin model API', version: '1.0.0' },
        paths: { ...AIModelPath, ...ChannelPath }
      })
    ).not.toThrow();
  });

  it('documents the create body modelData as a discriminated union', () => {
    // 回归：曾用 z.unknown().pipe(...) 实现，zod-openapi 只能输出 description，
    // 生成的客户端会把 modelData 当成 null/any。
    const document = createDocument({
      openapi: '3.1.0',
      info: { title: 'Admin model API', version: '1.0.0' },
      paths: AIModelPath
    });
    const body = document.paths?.['/core/ai/model/create']?.post?.requestBody as
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

    expect(DeleteModelsBodySchema.parse({ modelIds, channelType: 'system' })).toEqual({
      modelIds,
      channelType: 'system'
    });
    expect(
      UpdateModelStatusBodySchema.parse({ modelIds, isActive: false, channelType: 'system' })
    ).toEqual({
      modelIds,
      isActive: false,
      channelType: 'system'
    });
    expect(() =>
      DeleteModelsBodySchema.parse({ modelIds: [modelIds[0], modelIds[0]], channelType: 'system' })
    ).toThrow('modelIds must be unique');
  });

  it('enforces the batch model ID boundaries', () => {
    const modelIds = Array.from({ length: 501 }, (_, index) =>
      (index + 1).toString(16).padStart(24, '0')
    );

    expect(
      DeleteModelsBodySchema.parse({ modelIds: modelIds.slice(0, 500), channelType: 'system' })
        .modelIds
    ).toHaveLength(500);
    expect(() => DeleteModelsBodySchema.parse({ modelIds, channelType: 'system' })).toThrow();
    expect(() =>
      UpdateModelStatusBodySchema.parse({ modelIds: [], isActive: true, channelType: 'system' })
    ).toThrow();
  });

  it('enforces the template creation batch boundary', () => {
    const templates = Array.from({ length: 501 }, (_, index) => ({
      type: 'llm' as const,
      model: `model-${index}`
    }));

    expect(
      CreateModelsFromTemplatesBodySchema.parse({
        templates: templates.slice(0, 500),
        channelType: 'system'
      }).templates
    ).toHaveLength(500);
    expect(
      CreateModelsFromTemplatesBodySchema.parse({
        templates: [{ type: 'llm', model: 'gpt-4o' }],
        channelType: 'system',
        channelIds: [1, 2]
      }).channelIds
    ).toEqual([1, 2]);
    expect(() =>
      CreateModelsFromTemplatesBodySchema.parse({ templates, channelType: 'system' })
    ).toThrow();
  });

  it('strips legacy model fields at write boundaries', () => {
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
      CreateModelBodySchema.parse({
        modelData: {
          ...modelData,
          modelId: '68ad85a7463006c963799a05',
          legacyClientField: true
        },
        channelType: 'system'
      })
    ).toEqual({ modelData, channelType: 'system' });
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

    expect(UpdateModelBodySchema.parse({ modelId, modelData, channelType: 'system' })).toEqual({
      modelId,
      modelData,
      channelType: 'system'
    });
    expect(
      UpdateModelBodySchema.parse({
        modelId,
        modelData: { ...modelData, model: 'renamed-model' },
        channelType: 'system'
      })
    ).toEqual({
      modelId,
      modelData: { ...modelData, model: 'renamed-model' },
      channelType: 'system'
    });
    expect(() =>
      UpdateModelBodySchema.parse({
        modelId,
        modelData: { ...modelData, model: '   ' },
        channelType: 'system'
      })
    ).toThrow();
  });

  it('loads every core model route into the DevAPI document under model resources', () => {
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

    for (const [path, operations] of Object.entries(AIModelPath)) {
      expect(openAPIPaths[path]).toBe(operations);
      expect(openAPIDocument.paths?.[path]).toBeDefined();
      for (const operation of Object.values(operations ?? {})) {
        expect(operation?.tags).toContain(DevApiTagsMap.model);
      }
    }

    for (const [path, operations] of Object.entries(ChannelPath)) {
      expect(openAPIPaths[path]).toBe(operations);
      expect(openAPIDocument.paths?.[path]).toBeDefined();
      for (const operation of Object.values(operations ?? {})) {
        expect(operation?.tags).toEqual([DevApiTagsMap.model]);
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

  it('parses affectedModels query with various id formats', () => {
    expect(GetAffectedModelsQuerySchema.parse({ ids: [3], channelType: 'system' })).toEqual({
      ids: [3],
      channelType: 'system'
    });
    expect(GetAffectedModelsQuerySchema.parse({ ids: '3', channelType: 'system' })).toEqual({
      ids: [3],
      channelType: 'system'
    });
    expect(GetAffectedModelsQuerySchema.parse({ ids: ['3', '4'], channelType: 'team' })).toEqual({
      ids: [3, 4],
      channelType: 'team'
    });
    expect(GetAffectedModelsQuerySchema.parse({ ids: '3,4', channelType: 'system' })).toEqual({
      ids: [3, 4],
      channelType: 'system'
    });
    expect(() => GetAffectedModelsQuerySchema.parse({ ids: [], channelType: 'system' })).toThrow();
    expect(() =>
      GetAffectedModelsQuerySchema.parse({ ids: 'invalid', channelType: 'system' })
    ).toThrow();
  });
});
