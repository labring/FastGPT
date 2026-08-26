import { describe, expect, it } from 'vitest';
import { createDocument } from 'zod-openapi';
import {
  AdminSystemModelReferenceSchema,
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
});
