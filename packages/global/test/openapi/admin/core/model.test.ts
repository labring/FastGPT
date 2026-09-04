import { describe, expect, it } from 'vitest';
import { createDocument } from 'zod-openapi';
import {
  AdminSystemModelReferenceSchema,
  DeleteSystemModelsBodySchema,
  ImportedSystemModelSchema,
  TestAdminSystemModelQuerySchema,
  UpdateSystemModelBodySchema,
  UpdateSystemModelStatusBodySchema
} from '../../../../openapi/admin/core/ai/model/api';
import { AdminSystemModelPath } from '../../../../openapi/admin/core/ai/model';
import { adminOpenAPITagGroups, adminOpenAPIPaths } from '../../../../openapi/path';
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
        paths: AdminSystemModelPath
      })
    ).not.toThrow();
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

  it('does not include the immutable model identifier in update data', () => {
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
    expect(() =>
      UpdateSystemModelBodySchema.parse({
        modelId,
        modelData: { ...modelData, model: 'renamed-model' }
      })
    ).toThrow();
  });

  it('places every admin model route in the system model management group', () => {
    expect(adminOpenAPITagGroups).toContainEqual({
      name: '管理员-系统接口',
      tags: [DevApiTagsMap.adminSystemMigration, DevApiTagsMap.adminSystemModel]
    });

    for (const [path, operations] of Object.entries(AdminSystemModelPath)) {
      expect(adminOpenAPIPaths[path]).toBe(operations);
      for (const operation of Object.values(operations ?? {})) {
        expect(operation?.tags).toEqual([DevApiTagsMap.adminSystemModel]);
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
