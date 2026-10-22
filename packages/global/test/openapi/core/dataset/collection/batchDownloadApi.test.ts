import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '@fastgpt/global/openapi/provider/devapi';
import {
  BatchDownloadDatasetCollectionsQuerySchema,
  GetDownloadTicketDatasetCollectionsBodySchema,
  GetDownloadTicketDatasetCollectionsResponseSchema,
  BatchDownloadDatasetCollectionsResponseSchema
} from '@fastgpt/global/openapi/core/dataset/collection/batchDownloadApi';

const collectionId = '68ad85a7463006c963799a05';

describe('GetDownloadTicketDatasetCollectionsBodySchema', () => {
  it('requires an explicit dataset and collection IDs', () => {
    expect(
      GetDownloadTicketDatasetCollectionsBodySchema.parse({
        datasetId: collectionId,
        collectionIds: [collectionId]
      })
    ).toEqual({
      datasetId: collectionId,
      collectionIds: [collectionId]
    });
  });

  it('rejects empty and malformed collection IDs', () => {
    expect(
      GetDownloadTicketDatasetCollectionsBodySchema.safeParse({
        datasetId: collectionId,
        collectionIds: []
      }).success
    ).toBe(false);
    expect(
      GetDownloadTicketDatasetCollectionsBodySchema.safeParse({
        datasetId: collectionId,
        collectionIds: ['not-an-object-id']
      }).success
    ).toBe(false);
  });

  it('documents a ticket response and binary ZIP response', () => {
    expect(
      GetDownloadTicketDatasetCollectionsResponseSchema.parse({
        ticket: 'ticket-value',
        expiresAt: new Date().toISOString()
      })
    ).toMatchObject({ ticket: 'ticket-value' });
    expect(BatchDownloadDatasetCollectionsResponseSchema.meta()).toMatchObject({
      format: 'binary'
    });
    expect(BatchDownloadDatasetCollectionsQuerySchema.parse({ ticket: 'ticket-value' })).toEqual({
      ticket: 'ticket-value'
    });
    expect(
      openAPIDocument.paths?.['/core/dataset/collection/getDownloadTicket']?.post?.responses?.[200]
        ?.content?.['application/json']
    ).toBeDefined();
    expect(
      openAPIDocument.paths?.['/core/dataset/collection/batchDownload']?.get?.responses?.[200]
        ?.content?.['application/zip']
    ).toBeDefined();
  });
});
