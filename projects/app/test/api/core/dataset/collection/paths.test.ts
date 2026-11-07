import { describe, it, expect } from 'vitest';
import { getDatasetCollectionPaths } from '@/pages/api/core/dataset/collection/paths';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { defaultSubtreeMaxDepth } from '@fastgpt/global/common/parentFolder/subtree';
import { Types } from '@fastgpt/service/common/mongo';
import { getFakeUsers } from '@test/datas/users';

describe('getDatasetCollectionPaths', () => {
  const fixture = async () => {
    const { owner } = await getFakeUsers(1);
    const scope = { teamId: owner.teamId, datasetId: new Types.ObjectId().toHexString() };
    const create = (name: string, parentId?: string, type = DatasetCollectionTypeEnum.folder) =>
      MongoDatasetCollection.create({ ...scope, tmbId: owner.tmbId, name, parentId, type });
    return { scope, create };
  };

  it('returns empty paths for the root and missing collections', async () => {
    const { scope } = await fixture();
    await expect(getDatasetCollectionPaths(scope)).resolves.toEqual([]);
    await expect(
      getDatasetCollectionPaths({ ...scope, parentId: new Types.ObjectId().toHexString() })
    ).resolves.toEqual([]);
  });

  it('returns root-to-current paths including a leaf collection', async () => {
    const { scope, create } = await fixture();
    const root = await create('root');
    const folder = await create('folder', String(root._id));
    const leaf = await create('leaf', String(folder._id), DatasetCollectionTypeEnum.virtual);
    expect(await getDatasetCollectionPaths({ ...scope, parentId: String(leaf._id) })).toEqual([
      { parentId: String(root._id), parentName: 'root' },
      { parentId: String(folder._id), parentName: 'folder' },
      { parentId: String(leaf._id), parentName: 'leaf' }
    ]);
  });

  it.each(['self', 'two-node'] as const)(
    'terminates on a %s cycle without repeating IDs',
    async (cycle) => {
      const { scope, create } = await fixture();
      const a = await create('A');
      const b = cycle === 'self' ? a : await create('B', String(a._id));
      await MongoDatasetCollection.updateOne({ _id: a._id }, { parentId: b._id });
      const paths = await getDatasetCollectionPaths({ ...scope, parentId: String(a._id) });
      expect(paths.map(({ parentId }) => parentId)).toEqual(
        cycle === 'self' ? [String(a._id)] : [String(b._id), String(a._id)]
      );
    }
  );

  it('caps traversal while preserving historical deep paths', async () => {
    const { scope, create } = await fixture();
    const ids: string[] = [];
    for (let i = 0; i < defaultSubtreeMaxDepth + 1; i++) {
      const folder = await create(`level-${i}`, ids.at(-1));
      ids.push(String(folder._id));
    }
    const paths = await getDatasetCollectionPaths({ ...scope, parentId: ids.at(-1) });
    expect(paths.map(({ parentId }) => parentId)).toEqual(ids.slice(1));
  });

  it.each(['team', 'dataset', 'type'] as const)(
    'stops at an ancestor outside the %s scope',
    async (mismatch) => {
      const { scope, create } = await fixture();
      const parent = await create('invalid-parent');
      const child = await create('child', String(parent._id));
      await MongoDatasetCollection.updateOne(
        { _id: parent._id },
        {
          ...(mismatch === 'team' ? { teamId: new Types.ObjectId() } : {}),
          ...(mismatch === 'dataset' ? { datasetId: new Types.ObjectId() } : {}),
          ...(mismatch === 'type' ? { type: DatasetCollectionTypeEnum.virtual } : {})
        }
      );
      expect(await getDatasetCollectionPaths({ ...scope, parentId: String(child._id) })).toEqual([
        { parentId: String(child._id), parentName: 'child' }
      ]);
    }
  );
});
