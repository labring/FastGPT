import { describe, expect, it } from 'vitest';
import { createDocument } from 'zod-openapi';
import {
  AdminSystemModelReferenceSchema,
  ImportedSystemModelSchema,
  TestAdminSystemModelQuerySchema
} from '../../../../openapi/admin/core/ai/model/api';
import { AdminSystemModelPath } from '../../../../openapi/admin/core/ai/model';

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
