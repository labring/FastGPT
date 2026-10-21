import { describe, it, expect } from 'vitest';
import handler from '@/pages/api/core/dataset/paths';
import detailHandler from '@/pages/api/core/dataset/detail';
import { getFolderParentPathItems } from '@fastgpt/service/common/parentFolder/ancestorIds';
import {
  GetDatasetPathsResponseSchema,
  type GetDatasetPathsQuery,
  type GetDatasetPathsResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { ParentIdSchema } from '@fastgpt/global/common/parentFolder/type';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';

class FakeObjectId {
  constructor(private readonly hex: string) {}
  toString() {
    return this.hex;
  }
}

describe('getFolderParentPathItems', () => {
  it('returns an empty path for a missing source or parent record', async () => {
    await expect(
      getFolderParentPathItems({ folderId: null, findFolder: async () => null })
    ).resolves.toEqual([]);
    await expect(
      getFolderParentPathItems({ folderId: 'missing', findFolder: async () => null })
    ).resolves.toEqual([]);
  });

  it('returns paths from the root through the requested folder', async () => {
    const folders = new Map([
      ['child', { _id: 'child', name: 'Child', parentId: 'parent' }],
      ['parent', { _id: 'parent', name: 'Parent', parentId: null }]
    ]);
    const result = await getFolderParentPathItems({
      folderId: 'child',
      findFolder: async (id) => folders.get(id) ?? null
    });
    expect(result).toEqual([
      { parentId: 'parent', parentName: 'Parent' },
      { parentId: 'child', parentName: 'Child' }
    ]);
  });

  it('stops cycles and limits the path depth', async () => {
    const cyclic = new Map([
      ['first', { _id: 'first', name: 'First', parentId: 'second' }],
      ['second', { _id: 'second', name: 'Second', parentId: 'first' }]
    ]);
    await expect(
      getFolderParentPathItems({
        folderId: 'first',
        findFolder: async (id) => cyclic.get(id) ?? null
      })
    ).resolves.toEqual([
      { parentId: 'second', parentName: 'Second' },
      { parentId: 'first', parentName: 'First' }
    ]);

    await expect(
      getFolderParentPathItems({
        folderId: 'first',
        maxDepth: 1,
        findFolder: async (id) => cyclic.get(id) ?? null
      })
    ).resolves.toEqual([{ parentId: 'first', parentName: 'First' }]);
  });

  it('keeps ObjectId path identifiers valid for the response schema', async () => {
    const childHex = '69e5ca9ce4f63f23d53848da';
    const parentHex = '69e5ca9ce4f63f23d53848db';
    const childObjectId = new FakeObjectId(childHex);
    const parentObjectId = new FakeObjectId(parentHex);
    const folders = new Map([
      [childHex, { _id: childObjectId, name: 'Child', parentId: parentObjectId }],
      [parentHex, { _id: parentObjectId, name: 'Parent', parentId: null }]
    ]);
    const result = await getFolderParentPathItems({
      folderId: childHex,
      findFolder: async (id) => folders.get(id) ?? null
    });

    expect(GetDatasetPathsResponseSchema.parse(result)).toEqual([
      { parentId: parentHex, parentName: 'Parent' },
      { parentId: childHex, parentName: 'Child' }
    ]);
  });
});

describe('GET /api/core/dataset/paths', () => {
  it('returns a navigable folder breadcrumb and denies an empty inaccessible folder', async () => {
    const { owner, members } = await getFakeUsers(1);
    const [rootFolder, childFolder, readableDataset, hiddenFolder, readableFolder] =
      await MongoDataset.create([
        { name: 'Root', type: DatasetTypeEnum.folder, teamId: owner.teamId, tmbId: owner.tmbId },
        { name: 'Child', type: DatasetTypeEnum.folder, teamId: owner.teamId, tmbId: owner.tmbId },
        {
          name: 'Readable Dataset',
          type: DatasetTypeEnum.dataset,
          teamId: owner.teamId,
          tmbId: owner.tmbId
        },
        { name: 'Hidden', type: DatasetTypeEnum.folder, teamId: owner.teamId, tmbId: owner.tmbId },
        {
          name: 'Readable folder',
          type: DatasetTypeEnum.folder,
          teamId: owner.teamId,
          tmbId: owner.tmbId
        }
      ]);
    await MongoDataset.updateOne({ _id: childFolder._id }, { $set: { parentId: rootFolder._id } });
    await MongoDataset.updateOne(
      { _id: readableDataset._id },
      { $set: { parentId: childFolder._id } }
    );
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId: owner.teamId,
        resourceId: readableDataset._id,
        tmbId: members[0].tmbId,
        permission: ReadPermissionVal
      },
      {
        resourceType: PerResourceTypeEnum.dataset,
        teamId: owner.teamId,
        resourceId: readableFolder._id,
        tmbId: members[0].tmbId,
        permission: ReadPermissionVal
      }
    ]);

    const response = await Call<
      Record<string, never>,
      GetDatasetPathsQuery,
      GetDatasetPathsResponse
    >(handler, {
      auth: members[0],
      query: { sourceId: String(childFolder._id), type: 'current' }
    });
    expect(response.code).toBe(200);
    expect(response.data).toEqual([
      { parentId: String(rootFolder._id), parentName: 'Root' },
      {
        parentId: String(childFolder._id),
        parentName: 'Child',
        folderAccessMode: 'navigate'
      }
    ]);
    expect(JSON.stringify(response.data)).not.toContain('Readable Dataset');

    const readableFolderPath = await Call<
      Record<string, never>,
      GetDatasetPathsQuery,
      GetDatasetPathsResponse
    >(handler, {
      auth: members[0],
      query: { sourceId: String(readableFolder._id), type: 'current' }
    });
    expect(readableFolderPath.data.at(-1)?.folderAccessMode).toBe('read');

    const deniedDetail = await Call(detailHandler, {
      auth: members[0],
      query: { id: String(childFolder._id) }
    });
    expect(deniedDetail.error).toBe(DatasetErrEnum.unAuthDataset);

    const denied = await Call<Record<string, never>, GetDatasetPathsQuery, GetDatasetPathsResponse>(
      handler,
      { auth: members[0], query: { sourceId: String(hiddenFolder._id), type: 'current' } }
    );
    expect(denied.error).toBe(DatasetErrEnum.unAuthDataset);
  });

  it('returns the containing folder path for a non-folder Dataset source in parent mode', async () => {
    const { owner } = await getFakeUsers(1);
    const folder = await MongoDataset.create({
      name: 'Datasets folder',
      type: DatasetTypeEnum.folder,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    const dataset = await MongoDataset.create({
      name: 'Dataset',
      type: DatasetTypeEnum.dataset,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      parentId: folder._id
    });

    const response = await Call<
      Record<string, never>,
      GetDatasetPathsQuery,
      GetDatasetPathsResponse
    >(handler, { auth: owner, query: { sourceId: String(dataset._id), type: 'parent' } });

    expect(response.code).toBe(200);
    expect(response.data).toEqual([
      { parentId: String(folder._id), parentName: 'Datasets folder' }
    ]);
  });
});

describe('ParentIdSchema', () => {
  const validHex = '69e5ca9ce4f63f23d53848da';

  describe('accepts', () => {
    it('24-char lowercase hex string (ObjectId shape)', () => {
      expect(ParentIdSchema.parse(validHex)).toBe(validHex);
    });

    it('24-char uppercase / mixed-case hex string', () => {
      const upper = 'ABCDEF0123456789ABCDEF01';
      const mixed = 'AbCdEf0123456789abcdef01';
      expect(ParentIdSchema.parse(upper)).toBe(upper);
      expect(ParentIdSchema.parse(mixed)).toBe(mixed);
    });

    it('empty string (root sentinel)', () => {
      expect(ParentIdSchema.parse('')).toBe('');
    });

    it('null', () => {
      expect(ParentIdSchema.parse(null)).toBeNull();
    });

    it('undefined', () => {
      expect(ParentIdSchema.parse(undefined)).toBeUndefined();
    });

    it('ObjectId-like object with toString', () => {
      const oid = new FakeObjectId(validHex);
      expect(ParentIdSchema.parse(oid)).toBe(validHex);
    });
  });

  describe('rejects', () => {
    it('arbitrary non-hex string', () => {
      expect(() => ParentIdSchema.parse('parent1-id')).toThrow();
      expect(() => ParentIdSchema.parse('not-an-id')).toThrow();
    });

    it('hex string with wrong length', () => {
      // 23 chars
      expect(() => ParentIdSchema.parse('69e5ca9ce4f63f23d53848d')).toThrow();
      // 25 chars
      expect(() => ParentIdSchema.parse('69e5ca9ce4f63f23d53848daa')).toThrow();
    });

    it('24-char string containing non-hex character', () => {
      expect(() => ParentIdSchema.parse('69e5ca9ce4f63f23d53848dz')).toThrow();
    });

    it('number', () => {
      expect(() => ParentIdSchema.parse(123)).toThrow();
    });

    it('boolean', () => {
      expect(() => ParentIdSchema.parse(true)).toThrow();
      expect(() => ParentIdSchema.parse(false)).toThrow();
    });

    it('plain object whose toString produces non-hex', () => {
      // String({}) -> "[object Object]" -> regex fails
      expect(() => ParentIdSchema.parse({})).toThrow();
      expect(() => ParentIdSchema.parse({ foo: 'bar' })).toThrow();
    });

    it('array', () => {
      // String([1, 2]) -> "1,2" -> regex fails
      expect(() => ParentIdSchema.parse([1, 2])).toThrow();
    });

    it('ObjectId-like object whose toString produces invalid hex', () => {
      const bad = new FakeObjectId('not-hex');
      expect(() => ParentIdSchema.parse(bad)).toThrow();
    });
  });
});
