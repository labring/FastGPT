import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../openapi/provider/devapi';
import { apiDocOpenAPIDocument } from '../../../openapi/provider/systemopenapi';
import { openAPITagGroups } from '../../../openapi/path';
import { DevApiTagsMap } from '../../../openapi/tag';
import {
  ChangeDatasetOwnerBodySchema,
  ChangeDatasetOwnerResponseSchema,
  GetDatasetCollaboratorListQuerySchema,
  GetDatasetCollaboratorListResponseSchema,
  UpdateDatasetCollaboratorBodySchema,
  UpdateDatasetCollaboratorResponseSchema,
  PostDatasetSyncBodySchema,
  SearchDatasetTestBodySchema
} from '../../../openapi/core/dataset/api';
import { CreateCollectionByFileIdBodySchema } from '../../../openapi/core/dataset/collection/createApi';
import {
  ChangeCollectionOwnerBodySchema,
  ChangeCollectionOwnerResponseSchema,
  GetCollectionCollaboratorListQuerySchema,
  GetCollectionCollaboratorListResponseSchema,
  ResumeCollectionInheritPermissionBodySchema,
  UpdateCollectionCollaboratorBodySchema,
  UpdateCollectionCollaboratorResponseSchema
} from '../../../openapi/core/dataset/collection/api';
import {
  DatasetItemSchema,
  DatasetListItemSchema,
  DatasetSchema
} from '../../../core/dataset/type';

const objectId = '68ad85a7463006c963799a05';

const expectedPaths = {
  '/proApi/core/dataset/changeOwner': 'post',
  '/proApi/core/dataset/collaborator/list': 'get',
  '/proApi/core/dataset/collaborator/update': 'post',
  '/proApi/core/dataset/datasetSync': 'post',
  '/proApi/core/dataset/collection/changeOwner': 'post',
  '/proApi/core/dataset/collection/collaborator/list': 'get',
  '/proApi/core/dataset/collection/collaborator/update': 'post',
  '/core/dataset/collection/resumeInheritPermission': 'put'
} as const;

describe('SearchDatasetTestBodySchema', () => {
  const imageKeys = ['temp/teamId/search-image.png'];

  it.each([
    [{ text: ' question ' }, { text: ' question ', queryImageUrls: [] }],
    [{ queryImageUrls: imageKeys }, { text: '', queryImageUrls: imageKeys }],
    [
      { text: 'question', queryImageUrls: imageKeys },
      { text: 'question', queryImageUrls: imageKeys }
    ],
    [
      { text: '  ', queryImageUrls: imageKeys },
      { text: '  ', queryImageUrls: imageKeys }
    ],
    [
      { queryImageUrls: Array(10).fill(imageKeys[0]) },
      { text: '', queryImageUrls: Array(10).fill(imageKeys[0]) }
    ]
  ])('accepts text, images or both without dropping either input: %j', (input, expected) => {
    expect(SearchDatasetTestBodySchema.parse({ datasetId: objectId, ...input })).toEqual({
      datasetId: objectId,
      ...expected
    });
  });

  it.each([
    {},
    { text: ' \n ', queryImageUrls: [] },
    { queryImageUrls: [] },
    { text: 'question', queryImageUrls: [''] },
    { text: 'question', queryImageUrls: Array(11).fill(imageKeys[0]) },
    { text: null, queryImageUrls: imageKeys },
    { queryImageUrls: imageKeys[0] }
  ])('rejects empty input or malformed image lists: %j', (input) => {
    expect(SearchDatasetTestBodySchema.safeParse({ datasetId: objectId, ...input }).success).toBe(
      false
    );
  });

  it.each([
    ['DevAPI', openAPIDocument],
    ['System OpenAPI', apiDocOpenAPIDocument]
  ] as const)('documents named search input choices and response fields in %s', (_, document) => {
    const operation = document.paths!['/core/dataset/searchTest']!.post!;
    const body = operation.requestBody!;
    if ('$ref' in body) throw new Error('Unexpected body reference');
    const media = body.content['application/json'];
    const schema = media.schema!;
    if ('$ref' in schema) throw new Error('Unexpected body schema reference');
    expect(schema.anyOf?.map((branch) => branch.title)).toEqual(['文本检索', '图片检索']);
    const [text, images] = schema.anyOf!;
    expect(Object.keys(text.properties!)[0]).toBe('text');
    expect(text.required).toEqual(expect.arrayContaining(['text', 'datasetId']));
    expect(text.required).not.toContain('queryImageUrls');
    expect(text.properties!.queryImageUrls).toMatchObject({ default: [], maxItems: 10 });
    expect(Object.keys(images.properties!)[0]).toBe('queryImageUrls');
    expect(images.required).toEqual(expect.arrayContaining(['queryImageUrls', 'datasetId']));
    expect(images.required).not.toContain('text');
    expect(images.properties!.queryImageUrls).toMatchObject({ minItems: 1, maxItems: 10 });
    expect(images.properties!.text).toMatchObject({ default: '' });
    expect(media.example).toEqual({ text: 'FastGPT 是什么', datasetId: objectId });
    expect(media.examples).toBeUndefined();
    expect(SearchDatasetTestBodySchema.safeParse(media.example).success).toBe(true);
    expect(operation.responses![200]).toMatchObject({
      content: {
        'application/json': {
          schema: {
            properties: {
              list: { type: 'array' },
              duration: { type: 'string' },
              limit: { type: 'number' }
            }
          }
        }
      }
    });
  });
});

describe('Dataset OpenAPI contracts', () => {
  it('keeps ancestor paths in storage types only and documents folder access modes', () => {
    expect(DatasetSchema.shape.ancestorIds).toBeDefined();
    expect(DatasetItemSchema.shape).not.toHaveProperty('ancestorIds');
    expect(DatasetListItemSchema.shape).not.toHaveProperty('ancestorIds');
    expect(DatasetListItemSchema.shape.folderAccessMode).toBeDefined();
    expect(
      openAPIDocument.paths?.['/core/dataset/folder/create']?.post?.responses?.[200]?.content
    ).toBeUndefined();
  });

  it.each([undefined, null])('defaults a missing or null dataset avatar (%s)', (avatar) => {
    expect(DatasetItemSchema.shape.avatar.parse(avatar)).toBe('/icon/logo.svg');
    expect(DatasetListItemSchema.shape.avatar.parse(avatar)).toBe('/icon/logo.svg');
  });

  it('omits creation time from detail while retaining the list field', () => {
    expect(DatasetItemSchema.shape).not.toHaveProperty('createTime');
    expect(DatasetListItemSchema.shape).toHaveProperty('createTime');
    const response = openAPIDocument.paths?.['/core/dataset/detail']?.get?.responses?.[200];
    expect(response).toEqual(
      expect.objectContaining({
        content: expect.objectContaining({
          'application/json': expect.objectContaining({
            schema: expect.objectContaining({ properties: expect.any(Object) })
          })
        })
      })
    );
    if (response && 'content' in response) {
      const schema = response.content?.['application/json']?.schema;
      expect(schema).not.toHaveProperty('properties.createTime');
    }
  });

  it.each(Object.entries(expectedPaths))('registers %s as %s', (path, method) => {
    expect(openAPIDocument.paths?.[path]?.[method]).toBeDefined();
  });

  it('deprecates the legacy dataset list API and keeps V2 available', () => {
    expect(openAPIDocument.paths?.['/core/dataset/list']?.post).toMatchObject({
      deprecated: true,
      description: expect.stringContaining('/core/dataset/listV2')
    });
    expect(openAPIDocument.paths?.['/core/dataset/listV2']?.post).toBeDefined();
    expect(openAPIDocument.paths?.['/core/dataset/listV2']?.post?.deprecated).not.toBe(true);
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

  it('allows list and detail responses to omit unavailable display models', () => {
    expect(DatasetListItemSchema.shape.vectorModel.safeParse(undefined).success).toBe(true);
    expect(DatasetItemSchema.shape.vectorModel.safeParse(undefined).success).toBe(true);
    expect(DatasetItemSchema.shape.agentModel.safeParse(undefined).success).toBe(true);
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

  it('groups collection permission APIs and validates their contracts', () => {
    expect(
      openAPIDocument.paths?.['/proApi/core/dataset/collection/changeOwner']?.post?.tags
    ).toEqual([DevApiTagsMap.permissionResource, DevApiTagsMap.datasetPermission]);
    expect(
      openAPIDocument.paths?.['/proApi/core/dataset/collection/collaborator/list']?.get?.tags
    ).toEqual([DevApiTagsMap.permissionCollaborator, DevApiTagsMap.datasetPermission]);
    expect(
      openAPIDocument.paths?.['/proApi/core/dataset/collection/collaborator/update']?.post?.tags
    ).toEqual([DevApiTagsMap.permissionCollaborator, DevApiTagsMap.datasetPermission]);
    expect(
      openAPIDocument.paths?.['/core/dataset/collection/resumeInheritPermission']?.put?.tags
    ).toEqual([DevApiTagsMap.datasetPermission]);

    expect(GetCollectionCollaboratorListQuerySchema.parse({ collectionId: objectId })).toEqual({
      collectionId: objectId
    });
    expect(GetCollectionCollaboratorListResponseSchema.parse({ clbs: [] })).toEqual({ clbs: [] });

    expect(() =>
      UpdateCollectionCollaboratorBodySchema.parse({ collectionId: objectId, collaborators: [] })
    ).toThrow();
    expect(
      UpdateCollectionCollaboratorBodySchema.parse({
        collectionId: objectId,
        collaborators: [{ tmbId: objectId, permission: 4 }]
      })
    ).toEqual({
      collectionId: objectId,
      collaborators: [{ tmbId: objectId, permission: 4 }]
    });
    expect(UpdateCollectionCollaboratorResponseSchema.parse(undefined)).toBeUndefined();

    expect(ResumeCollectionInheritPermissionBodySchema.parse({ collectionId: objectId })).toEqual({
      collectionId: objectId
    });

    expect(
      ChangeCollectionOwnerBodySchema.parse({ collectionId: objectId, ownerId: objectId })
    ).toEqual({ collectionId: objectId, ownerId: objectId });
    expect(ChangeCollectionOwnerResponseSchema.parse(undefined)).toBeUndefined();
  });
});
