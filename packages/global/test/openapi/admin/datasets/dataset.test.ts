import { describe, expect, it } from 'vitest';
import { createDocument } from 'zod-openapi';
import {
  AdminDatasetTrainingEnhanceBodySchema,
  AdminDatasetTrainingEnhanceResponseSchema,
  AdminLlmParagraphBodySchema,
  AdminLlmParagraphResponseSchema
} from '../../../../openapi/admin/dataset/training/api';
import { AdminDatasetTrainingPath } from '../../../../openapi/admin/dataset/training';
import { AdminPath } from '../../../../openapi/admin';
import { openAPIPaths } from '../../../../openapi/path';
import { apiDocOpenAPIDocument } from '../../../../openapi/provider/systemopenapi';
import { DevApiTagsMap } from '../../../../openapi/tag';

const route = '/core/dataset/training/llmPargraph';
const objectId = '68ad85a7463006c963799a05';
const datasetTrainingDocument = createDocument({
  openapi: '3.1.0',
  info: { title: 'Admin dataset training API', version: '1.0.0' },
  paths: AdminDatasetTrainingPath
});

describe('Admin dataset training OpenAPI contracts', () => {
  it('documents the enhancement request only in the internal API', () => {
    const enhanceRoute = '/core/dataset/training/enhance';
    expect(datasetTrainingDocument.paths?.[enhanceRoute]?.post).toMatchObject({
      tags: [DevApiTagsMap.subserviceProDataset],
      requestBody: { required: true }
    });
    expect(openAPIPaths[enhanceRoute]).toBe(AdminDatasetTrainingPath[enhanceRoute]);
    expect(apiDocOpenAPIDocument.paths?.[enhanceRoute]).toBeUndefined();
  });

  it('requires work item ownership, usageId, and image source, and accepts committed, aborted, or skipped responses', () => {
    const base = {
      teamId: objectId,
      datasetId: objectId,
      collectionId: objectId,
      dataId: objectId,
      runId: 'run-1',
      modelId: objectId,
      usageId: objectId
    };
    expect(
      AdminDatasetTrainingEnhanceBodySchema.safeParse({ ...base, mode: 'imageParse' }).success
    ).toBe(false);
    expect(
      AdminDatasetTrainingEnhanceBodySchema.safeParse({
        teamId: objectId,
        datasetId: objectId,
        collectionId: objectId,
        dataId: objectId,
        runId: 'run-1',
        modelId: objectId,
        mode: 'auto',
        q: 'text'
      }).success
    ).toBe(false);
    expect(
      AdminDatasetTrainingEnhanceBodySchema.parse({ ...base, mode: 'auto', q: 'text' })
    ).toEqual({ ...base, mode: 'auto', q: 'text' });
    expect(AdminDatasetTrainingEnhanceResponseSchema.parse({ status: 'committed' })).toEqual({
      status: 'committed'
    });
    expect(AdminDatasetTrainingEnhanceResponseSchema.parse({ status: 'aborted' })).toEqual({
      status: 'aborted'
    });
    expect(AdminDatasetTrainingEnhanceResponseSchema.parse({ status: 'skipped' })).toEqual({
      status: 'skipped'
    });
  });

  it('registers the internal paragraph endpoint in the complete AdminPath and DevAPI document', () => {
    expect(datasetTrainingDocument.paths?.[route]?.post).toBeDefined();
    expect(AdminPath[route]).toBe(AdminDatasetTrainingPath[route]);
    expect(openAPIPaths[route]).toBe(AdminDatasetTrainingPath[route]);
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
