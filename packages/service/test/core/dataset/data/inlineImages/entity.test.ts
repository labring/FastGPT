import { describe, expect, it, vi } from 'vitest';
import { persistChunkImageReferences } from '@fastgpt/service/core/dataset/data/inlineImages/entity';
import { getChunkImageReferences } from '@fastgpt/service/core/dataset/data/inlineImages/utils';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import {
  getOrCreateChunkImagePrefixId,
  readChunkImagePrefixIdForRebuild
} from '@fastgpt/service/core/dataset/collection/entity';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const setup = async () => {
  const { root, scope } = await createDatasetCollectionFixture();
  await MongoDatasetCollection.updateOne(
    { _id: scope.collectionId },
    { chunkImagePrefixId: scope.collectionId }
  );
  const key = `dataset/${scope.datasetId}/chunk-images/${scope.collectionId}/file/${'a'.repeat(32)}.png`;
  const record = await MongoS3TTL.create({
    bucketName: S3Buckets.private,
    minioKey: key,
    expiredTime: new Date(Date.now() + 3600000)
  });
  return { root, scope, key, record };
};

describe('persistChunkImageReferences', () => {
  it('commits data and TTL removal together without persisting a reference list', async () => {
    const { scope, key } = await setup();
    await mongoSessionRun(async (session) => {
      await MongoDatasetData.create([{ ...scope, q: `![image](${key})` }], { session });
      await persistChunkImageReferences({
        ...scope,
        data: [{ q: `![image](${key})` }],
        imageUploadKeys: [key],
        session
      });
    });
    expect(await MongoS3TTL.countDocuments({ minioKey: key })).toBe(0);
    expect(
      await MongoDatasetData.findOne({ collectionId: scope.collectionId }).lean()
    ).not.toHaveProperty('relatedImgId');
  });

  it('reads a newly initialized prefix inside rebuild transactions instead of a stale snapshot', async () => {
    const { scope, collection } = await createDatasetCollectionFixture();
    expect(collection.chunkImagePrefixId).toBeUndefined();
    await getOrCreateChunkImagePrefixId(scope);
    const current = await mongoSessionRun((session) =>
      readChunkImagePrefixIdForRebuild({ ...scope, session })
    );
    expect(current).toBe(scope.collectionId);
  });

  it('rolls back data and TTL removal together', async () => {
    const { scope, key } = await setup();
    await expect(
      mongoSessionRun(async (session) => {
        await MongoDatasetData.create([{ ...scope, q: `![image](${key})` }], { session });
        await persistChunkImageReferences({
          ...scope,
          data: [{ q: `![image](${key})` }],
          imageUploadKeys: [key],
          session
        });
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');
    expect(await MongoDatasetData.countDocuments({ collectionId: scope.collectionId })).toBe(0);
    expect(await MongoS3TTL.countDocuments({ minioKey: key })).toBe(1);
  });

  it('only promotes keys actually referenced by accepted content', async () => {
    const { scope, key, record } = await setup();
    await mongoSessionRun((session) =>
      persistChunkImageReferences({
        ...scope,
        data: [{ q: 'filtered image no longer present' }],
        imageUploadKeys: [key],
        session
      })
    );
    expect(await MongoS3TTL.findById(record._id)).toBeTruthy();
  });

  it('rejects a new upload whose temporary record is missing', async () => {
    const { scope, key, record } = await setup();
    await MongoS3TTL.deleteOne({ _id: record._id });
    await expect(
      mongoSessionRun((session) =>
        persistChunkImageReferences({
          ...scope,
          data: [{ q: `![image](${key})` }],
          imageUploadKeys: [key],
          session
        })
      )
    ).rejects.toThrow('no longer available');
  });

  it('rejects pending uploads being reused outside their upload request', async () => {
    const { scope, key } = await setup();
    await expect(
      mongoSessionRun((session) =>
        persistChunkImageReferences({ ...scope, data: [{ q: `[image](${key})` }], session })
      )
    ).rejects.toThrow('not been committed');
  });

  it.each(['image', 'link', 'html', 'index', 'imageId'])(
    'rejects foreign collection ownership via %s',
    async (syntax) => {
      const { root, scope, key } = await setup();
      const { scope: other } = await createDatasetCollectionFixture({ user: root });
      const data =
        syntax === 'image'
          ? { q: `![image](${key})` }
          : syntax === 'link'
            ? { a: `[image](<${key.replace(/[./-]/g, '\\$&')}> "title")` }
            : syntax === 'html'
              ? { q: `<img src='${key}'>` }
              : syntax === 'index'
                ? { indexes: [{ text: `[image](${key})` }] }
                : { imageId: key };
      await MongoDatasetCollection.updateOne(
        { _id: other.collectionId },
        { datasetId: scope.datasetId }
      );
      await expect(
        mongoSessionRun((session) =>
          persistChunkImageReferences({
            ...other,
            datasetId: scope.datasetId,
            data: [data],
            session
          })
        )
      ).rejects.toThrow('does not belong');
    }
  );

  it('deduplicates plain links and full image syntax without changing text', async () => {
    const { key } = await setup();
    const text = `![one](${key}) [two](<${key}> "title") <img src='${key}'>`;
    expect([...getChunkImageReferences([{ q: text }, { imageId: key }])]).toEqual([key]);
  });
});
