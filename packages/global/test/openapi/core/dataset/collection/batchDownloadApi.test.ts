import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '@fastgpt/global/openapi/provider/devapi';
import {
  BatchDownloadDatasetCollectionsBodySchema,
  BatchDownloadDatasetCollectionsResponseSchema
} from '@fastgpt/global/openapi/core/dataset/collection/batchDownloadApi';

const collectionId = '68ad85a7463006c963799a05';

describe('BatchDownloadDatasetCollectionsBodySchema', () => {
  it('accepts JSON arrays and normalizes a single form field into an array', () => {
    expect(
      BatchDownloadDatasetCollectionsBodySchema.parse({ collectionIds: [collectionId] })
    ).toEqual({
      collectionIds: [collectionId]
    });
    expect(
      BatchDownloadDatasetCollectionsBodySchema.parse({ collectionIds: collectionId })
    ).toEqual({
      collectionIds: [collectionId]
    });
  });

  it('rejects empty and malformed collection IDs', () => {
    expect(BatchDownloadDatasetCollectionsBodySchema.safeParse({ collectionIds: [] }).success).toBe(
      false
    );
    expect(
      BatchDownloadDatasetCollectionsBodySchema.safeParse({ collectionIds: ['not-an-object-id'] })
        .success
    ).toBe(false);
  });

  it('documents a binary ZIP response', () => {
    expect(BatchDownloadDatasetCollectionsResponseSchema.meta()).toMatchObject({
      format: 'binary'
    });
    expect(
      openAPIDocument.paths?.['/core/dataset/collection/batchDownload']?.post?.responses?.[200]
        ?.content?.['application/zip']
    ).toBeDefined();
  });
});
