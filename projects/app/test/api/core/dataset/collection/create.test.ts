import { describe, it, expect } from 'vitest';
import createHandler from '@/pages/api/core/dataset/collection/create';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { createCollections } from '@fastgpt/service/core/dataset/collection/controller';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { serviceEnv } from '@fastgpt/service/env';
import { Types } from '@fastgpt/service/common/mongo';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('create collection parent checks', () => {
  const fixture = async () => {
    const { owner } = await getFakeUsers(1);
    const dataset = await MongoDataset.create({
      name: 'dataset',
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    return {
      owner,
      scope: { teamId: owner.teamId, tmbId: owner.tmbId, datasetId: String(dataset._id) }
    };
  };

  it('enforces depth for generic and shared folder creation, and allows a leaf at the boundary', async () => {
    const { owner, scope } = await fixture();
    let parentId: string | null = null;
    for (let i = 0; i < serviceEnv.MAX_FOLDER_DEPTH - 1; i++) {
      const folder = await MongoDatasetCollection.create({
        ...scope,
        name: `level-${i}`,
        type: DatasetCollectionTypeEnum.folder,
        parentId
      });
      parentId = String(folder._id);
    }
    const last = await Call(createHandler, {
      auth: owner,
      body: {
        datasetId: scope.datasetId,
        name: 'last',
        type: DatasetCollectionTypeEnum.folder,
        parentId
      }
    });
    expect(last.code).toBe(200);
    const props = {
      ...scope,
      name: 'overflow',
      type: DatasetCollectionTypeEnum.folder,
      parentId: String(last.data)
    };
    const overflow = await Call(createHandler, { auth: owner, body: props });
    expect(overflow.error).toBe(CommonErrEnum.folderDepthLimit);
    await expect(createCollections({ collections: [props] })).rejects.toBe(
      CommonErrEnum.folderDepthLimit
    );
    expect(await MongoDatasetCollection.countDocuments({ name: 'overflow' })).toBe(0);
    const leaf = await Call(createHandler, {
      auth: owner,
      body: { ...props, name: 'leaf', type: DatasetCollectionTypeEnum.virtual }
    });
    expect(leaf.code).toBe(200);
  });

  it.each(['type', 'dataset'] as const)(
    'rejects an invalid %s parent in shared persistence',
    async (mismatch) => {
      const { owner, scope } = await fixture();
      const parent = await MongoDatasetCollection.create({
        ...scope,
        name: 'parent',
        type:
          mismatch === 'type'
            ? DatasetCollectionTypeEnum.virtual
            : DatasetCollectionTypeEnum.folder,
        ...(mismatch === 'dataset' ? { datasetId: new Types.ObjectId() } : {})
      });
      const props = {
        ...scope,
        name: 'invalid',
        type: DatasetCollectionTypeEnum.virtual,
        parentId: String(parent._id)
      };
      const response = await Call(createHandler, { auth: owner, body: props });
      expect(response.code).not.toBe(200);
      await expect(createCollections({ collections: [props] })).rejects.toBe(
        CommonErrEnum.invalidParams
      );
      expect(await MongoDatasetCollection.countDocuments({ name: 'invalid' })).toBe(0);
    }
  );
});
