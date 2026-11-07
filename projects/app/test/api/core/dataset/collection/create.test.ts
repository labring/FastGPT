import { describe, it, expect, afterEach, vi } from 'vitest';
import createHandler from '@/pages/api/core/dataset/collection/create';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionSyncResultEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  createCollections,
  bulkInsertFolderCollections,
  createApiFileCollectionsBatch
} from '@fastgpt/service/core/dataset/collection/controller';
import { defaultSubtreeMaxDepth } from '@fastgpt/global/common/parentFolder/subtree';
import { syncCollection } from '@fastgpt/service/core/dataset/collection/utils';
import * as datasetRead from '@fastgpt/service/core/dataset/read';
import * as datasetS3 from '@fastgpt/service/common/s3/sources/dataset';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { serviceEnv } from '@fastgpt/service/env';
import { Types } from '@fastgpt/service/common/mongo';
import { getFakeUsers } from '@test/datas/users';
import { getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';

describe('create collection parent checks', () => {
  afterEach(() => vi.restoreAllMocks());
  const fixture = async () => {
    const { owner } = await getFakeUsers(1);
    const defaults = getModelTestDefaults();
    const dataset = await MongoDataset.create({
      name: 'dataset',
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      agentModelId: defaults.llm!.modelId,
      vectorModelId: defaults.embedding!.modelId
    });
    return {
      owner,
      dataset,
      scope: { teamId: owner.teamId, tmbId: owner.tmbId, datasetId: String(dataset._id) }
    };
  };

  it('imports and syncs external resources through 20 folder levels while manual creation keeps its configured limit', async () => {
    const { owner, dataset, scope } = await fixture();
    let parentId: Types.ObjectId | null = null;
    for (let depth = 1; depth <= defaultSubtreeMaxDepth; depth++) {
      const _id = new Types.ObjectId();
      const result = await bulkInsertFolderCollections({
        ...scope,
        docs: [
          {
            _id,
            name: `external-${depth}`,
            type: DatasetCollectionTypeEnum.folder,
            apiFileId: `folder-${depth}`,
            parentId
          }
        ]
      });
      expect(result).toEqual({ successApiFileIds: [`folder-${depth}`], failedApiFileIds: [] });
      parentId = _id;
    }
    const files = [{ name: 'external-file', apiFileId: 'file-20', parentId: String(parentId) }];
    const createCollectionParams = { ...scope, type: DatasetCollectionTypeEnum.apiFile };
    const result = await createApiFileCollectionsBatch({
      dataset: dataset.toObject(),
      files,
      createCollectionParams
    });
    expect(result.collectionIds).toHaveLength(1);

    const file = await MongoDatasetCollection.findById(result.collectionIds[0]).lean();
    expect(String(file?.parentId)).toBe(String(parentId));
    vi.spyOn(datasetRead, 'readDatasetSourceRawText').mockResolvedValue({
      title: 'synced-file',
      rawText: 'updated external body'
    });
    // 补齐全局 S3 替身尚未实现的批量清理方法，目录与文件重建仍走真实数据库流程。
    const s3Source = datasetS3.getS3DatasetSource();
    s3Source.deleteDatasetFilesByKeys = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(datasetS3, 'getS3DatasetSource').mockReturnValue(s3Source);
    expect(
      await syncCollection({ ...file!, hashRawText: 'old-hash', dataset: dataset.toObject() })
    ).toBe(DatasetCollectionSyncResultEnum.success);
    const synced = await MongoDatasetCollection.findOne({
      apiFileId: 'file-20',
      name: 'synced-file'
    }).lean();
    expect(String(synced?.parentId)).toBe(String(parentId));

    // 同父级混合批次也不能复用外部资源的深度校验结果，绕过普通创建限制。
    await expect(
      createCollections({
        collections: [
          {
            ...scope,
            name: 'mixed-external',
            parentId: String(parentId),
            type: DatasetCollectionTypeEnum.apiFile,
            apiFileId: 'mixed-api-file'
          },
          {
            ...scope,
            name: 'mixed-manual',
            parentId: String(parentId),
            type: DatasetCollectionTypeEnum.virtual
          }
        ]
      })
    ).rejects.toBe(CommonErrEnum.folderDepthLimit);
    expect(
      await MongoDatasetCollection.countDocuments({
        name: { $in: ['mixed-external', 'mixed-manual'] }
      })
    ).toBe(0);
    const manual = await Call(createHandler, {
      auth: owner,
      body: {
        ...scope,
        parentId: String(parentId),
        name: 'manual',
        type: DatasetCollectionTypeEnum.virtual,
        apiFileId: 'forged',
        maxDepth: 20
      }
    });
    expect(manual.error).toBe(CommonErrEnum.folderDepthLimit);

    const overflowId = new Types.ObjectId();
    const overflow = await bulkInsertFolderCollections({
      ...scope,
      docs: [
        {
          _id: overflowId,
          name: 'overflow',
          type: DatasetCollectionTypeEnum.folder,
          apiFileId: 'folder-21',
          parentId
        }
      ]
    });
    expect(overflow).toEqual({ successApiFileIds: [], failedApiFileIds: ['folder-21'] });
    expect(await MongoDatasetCollection.countDocuments({ _id: overflowId })).toBe(0);
    // 模拟已有的超深脏数据：不能在第 21 层继续补建外部正文。
    const historical = await MongoDatasetCollection.create({
      ...scope,
      name: 'historical-21',
      type: DatasetCollectionTypeEnum.folder,
      parentId
    });
    await expect(
      createApiFileCollectionsBatch({
        dataset: dataset.toObject(),
        files: [{ ...files[0], apiFileId: 'file-21', parentId: String(historical._id) }],
        createCollectionParams
      })
    ).rejects.toBe(CommonErrEnum.folderDepthLimit);
    expect(await MongoDatasetCollection.countDocuments({ apiFileId: 'file-21' })).toBe(0);
  });

  it('enforces depth for generic and shared folder creation, and allows a leaf at the boundary', async () => {
    const { owner, scope } = await fixture();
    let parentId: string | null = null;
    for (let i = 0; i < serviceEnv.MAX_FOLDER_DEPTH - 1; i++) {
      const folder: { _id: unknown } = await MongoDatasetCollection.create({
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
    const historical = await MongoDatasetCollection.create({
      ...scope,
      name: 'historical-deep-folder',
      type: DatasetCollectionTypeEnum.folder,
      parentId: last.data
    });
    const deepLeaf = await Call(createHandler, {
      auth: owner,
      body: {
        datasetId: scope.datasetId,
        name: 'invalid-deep-leaf',
        type: DatasetCollectionTypeEnum.virtual,
        parentId: String(historical._id)
      }
    });
    expect(deepLeaf.error).toBe(CommonErrEnum.folderDepthLimit);
    expect(await MongoDatasetCollection.countDocuments({ name: 'invalid-deep-leaf' })).toBe(0);
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
