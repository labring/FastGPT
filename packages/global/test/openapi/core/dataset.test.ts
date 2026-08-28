import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../openapi/provider/devapi';
import { openAPITagGroups } from '../../../openapi/path';
import { DevApiTagsMap } from '../../../openapi/tag';
import {
  ChangeDatasetOwnerBodySchema,
  ChangeDatasetOwnerResponseSchema,
  GetDatasetCollaboratorListQuerySchema,
  GetDatasetCollaboratorListResponseSchema,
  UpdateDatasetCollaboratorBodySchema,
  UpdateDatasetCollaboratorResponseSchema,
  PostDatasetSyncBodySchema
} from '../../../openapi/core/dataset/api';
import { CreateCollectionByFileIdBodySchema } from '../../../openapi/core/dataset/collection/createApi';

const objectId = '68ad85a7463006c963799a05';

const expectedPaths = {
  '/proApi/core/dataset/changeOwner': 'post',
  '/proApi/core/dataset/collaborator/list': 'get',
  '/proApi/core/dataset/collaborator/update': 'post',
  '/proApi/core/dataset/datasetSync': 'post'
} as const;

describe('Dataset OpenAPI contracts', () => {
  it.each(Object.entries(expectedPaths))('registers %s as %s', (path, method) => {
    expect(openAPIDocument.paths?.[path]?.[method]).toBeDefined();
  });

  it('groups Dataset permission APIs with dataset permission and shared permission tags', () => {
    expect(openAPIDocument.paths?.['/proApi/core/dataset/changeOwner']?.post?.tags).toEqual([
      DevApiTagsMap.permissionResource,
      DevApiTagsMap.datasetPermission
    ]);
    expect(openAPIDocument.paths?.['/proApi/core/dataset/collaborator/list']?.get?.tags).toEqual([
      DevApiTagsMap.permissionCollaborator,
      DevApiTagsMap.datasetPermission
    ]);
    expect(openAPIDocument.paths?.['/proApi/core/dataset/collaborator/update']?.post?.tags).toEqual(
      [DevApiTagsMap.permissionCollaborator, DevApiTagsMap.datasetPermission]
    );
    expect(openAPIDocument.paths?.['/proApi/core/dataset/datasetSync']?.post?.tags).toEqual([
      DevApiTagsMap.datasetCommon
    ]);

    expect(openAPITagGroups.find((group) => group.name === '核心-知识库')?.tags).toContain(
      DevApiTagsMap.datasetPermission
    );
  });

  it('documents and validates Dataset permission request and response contracts', () => {
    expect(ChangeDatasetOwnerBodySchema.parse({ datasetId: objectId, ownerId: objectId })).toEqual({
      datasetId: objectId,
      ownerId: objectId
    });
    expect(ChangeDatasetOwnerResponseSchema.parse(undefined)).toBeUndefined();

    expect(GetDatasetCollaboratorListQuerySchema.parse({ datasetId: objectId })).toEqual({
      datasetId: objectId
    });
    expect(GetDatasetCollaboratorListResponseSchema.parse({ clbs: [], parentClbs: [] })).toEqual({
      clbs: [],
      parentClbs: []
    });

    expect(() =>
      UpdateDatasetCollaboratorBodySchema.parse({ datasetId: objectId, collaborators: [] })
    ).toThrow();
    expect(
      UpdateDatasetCollaboratorBodySchema.parse({
        datasetId: objectId,
        collaborators: [{ tmbId: objectId, permission: 4 }]
      })
    ).toEqual({
      datasetId: objectId,
      collaborators: [{ tmbId: objectId, permission: 4 }]
    });
    expect(UpdateDatasetCollaboratorResponseSchema.parse(undefined)).toBeUndefined();

    expect(PostDatasetSyncBodySchema.parse({ datasetId: objectId })).toEqual({
      datasetId: objectId
    });
    expect(
      openAPIDocument.paths?.['/proApi/core/dataset/datasetSync']?.post?.responses?.[200]?.content
    ).toBeUndefined();
  });

  it('coerces collection chunk settings sent as numeric strings', () => {
    const params = CreateCollectionByFileIdBodySchema.parse({
      datasetId: objectId,
      fileId: 'dataset/example.pdf',
      chunkTriggerMinSize: '100',
      paragraphChunkDeep: '5',
      paragraphChunkMinSize: '100',
      chunkSize: '512',
      indexSize: '768'
    });

    expect(params).toMatchObject({
      chunkTriggerMinSize: 100,
      paragraphChunkDeep: 5,
      paragraphChunkMinSize: 100,
      chunkSize: 512,
      indexSize: 768
    });
  });

  it('documents that Dataset collaborator updates require at least one collaborator', () => {
    const requestBody =
      openAPIDocument.paths?.['/proApi/core/dataset/collaborator/update']?.post?.requestBody;
    const requestSchema =
      requestBody && 'content' in requestBody
        ? requestBody.content?.['application/json']?.schema
        : undefined;

    expect(requestSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          collaborators: expect.objectContaining({ minItems: 1 })
        })
      })
    );
  });
});
