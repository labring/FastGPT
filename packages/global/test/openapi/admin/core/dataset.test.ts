import { describe, expect, it } from 'vitest';
import { createDocument } from 'zod-openapi';
import {
  AdminLlmParagraphBodySchema,
  AdminLlmParagraphResponseSchema
} from '../../../../openapi/admin/core/dataset/training/api';
import { AdminDatasetTrainingPath } from '../../../../openapi/admin/core/dataset/training';
import { adminOpenAPIPaths, openAPIPaths } from '../../../../openapi/path';
import { DevApiTagsMap } from '../../../../openapi/tag';

const route = '/core/dataset/training/llmPargraph';
const objectId = '68ad85a7463006c963799a05';
const datasetTrainingDocument = createDocument({
  openapi: '3.1.0',
  info: { title: 'Admin dataset training API', version: '1.0.0' },
  paths: AdminDatasetTrainingPath
});

describe('Admin dataset training OpenAPI contracts', () => {
  it('registers the internal paragraph endpoint only in the Admin document', () => {
    expect(adminOpenAPIPaths[route]?.post?.tags).toEqual([DevApiTagsMap.adminDatasets]);
    expect(datasetTrainingDocument.paths?.[route]?.post).toBeDefined();
    expect(openAPIPaths[route]).toBeUndefined();
  });

  it('requires modelId and does not accept the deprecated model field', () => {
    expect(
      AdminLlmParagraphBodySchema.parse({
        rawText: 'FastGPT 是一个 AI Agent 构建平台。',
        modelId: objectId,
        teamId: objectId,
        billId: 'dataset-parse-bill'
      })
    ).toEqual({
      rawText: 'FastGPT 是一个 AI Agent 构建平台。',
      modelId: objectId,
      teamId: objectId,
      billId: 'dataset-parse-bill'
    });

    expect(() =>
      AdminLlmParagraphBodySchema.parse({
        rawText: 'FastGPT 是一个 AI Agent 构建平台。',
        model: 'gpt-4.1-mini',
        teamId: objectId,
        billId: 'dataset-parse-bill'
      })
    ).toThrow();
  });

  it('validates the response contract', () => {
    expect(
      AdminLlmParagraphResponseSchema.parse({
        resultText: '# FastGPT\nFastGPT 是一个 AI Agent 构建平台。',
        totalInputTokens: 12,
        totalOutputTokens: 8
      })
    ).toEqual({
      resultText: '# FastGPT\nFastGPT 是一个 AI Agent 构建平台。',
      totalInputTokens: 12,
      totalOutputTokens: 8
    });
  });
});
