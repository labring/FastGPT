import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeDatasetDataImages } from '@fastgpt/service/core/dataset/data/inlineImages/service';
import { createDatasetCollectionFixture } from '@test/datas/dataset';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import * as s3Utils from '@fastgpt/service/common/s3/utils';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCVsAAAAASUVORK5CYII=';
const url = `data:image/png;base64,${png}`;

describe('normalizeDatasetDataImages', () => {
  beforeEach(() => {
    vi.spyOn(s3Utils, 'uploadImage2S3Bucket').mockImplementation(
      async (_bucket, params) => params.uploadKey
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves chunk boundaries and markup while sharing an upload across q/a and chunks', async () => {
    const { scope } = await createDatasetCollectionFixture();
    const data = [
      {
        q: `before  ![figure](<${url}> "title")\nend`,
        a: `<img width='2' src='${url}' alt='same'>`,
        metadata: { tag: 'x' },
        indexes: ['draft']
      },
      { q: `![again](${url})`, a: 'unchanged' }
    ];
    const result = await normalizeDatasetDataImages({ ...scope, data });
    const [key] = result.imageUploadKeys;
    expect(result.imageUploadKeys).toHaveLength(1);
    expect(key).toMatch(
      new RegExp(
        `^dataset/${scope.datasetId}/chunk-images/${scope.collectionId}/file/[a-f0-9]{32}\\.png$`
      )
    );
    expect(result.data).toEqual([
      {
        ...data[0],
        q: `before  ![figure](<${key}> "title")\nend`,
        a: `<img width='2' src='${key}' alt='same'>`
      },
      { ...data[1], q: `![again](${key})` }
    ]);
    expect(s3Utils.uploadImage2S3Bucket).toHaveBeenCalledTimes(1);
    expect(await MongoS3TTL.findOne({ minioKey: key }).lean()).toMatchObject({
      minioKey: key
    });
    expect(
      (await MongoDatasetCollection.findById(scope.collectionId).lean())?.chunkImagePrefixId
    ).toBe(scope.collectionId);
  });

  it('does not initialize a prefix or upload plain text, existing keys or HTTP images', async () => {
    const { scope } = await createDatasetCollectionFixture();
    const data = [
      {
        q: '  text\n![remote](https://example.com/a.png)',
        a: `![old](dataset/${scope.datasetId}/parsed/file/a.png)`
      }
    ];
    expect(await normalizeDatasetDataImages({ ...scope, data })).toEqual({
      data,
      imageUploadKeys: []
    });
    expect(s3Utils.uploadImage2S3Bucket).not.toHaveBeenCalled();
    expect(
      (await MongoDatasetCollection.findById(scope.collectionId).lean())?.chunkImagePrefixId
    ).toBeUndefined();
  });

  it.each([
    'data:image/png;base64,@@@',
    'data:image/png;base64,YQ==junk',
    'data:image/png;base64,',
    'data:image/png;base64,aGk=',
    `data:image/png;base64,${png}=`
  ])('rejects invalid encoding or mismatched image content: %s', async (invalid) => {
    const { scope } = await createDatasetCollectionFixture();
    await expect(
      normalizeDatasetDataImages({ ...scope, data: [{ q: `![bad](${invalid})` }] })
    ).rejects.toThrow();
    expect(s3Utils.uploadImage2S3Bucket).not.toHaveBeenCalled();
    expect(await MongoS3TTL.countDocuments()).toBe(0);
  });

  it('registers cleanup before uploading and propagates storage failure', async () => {
    const { scope } = await createDatasetCollectionFixture();
    vi.mocked(s3Utils.uploadImage2S3Bucket).mockImplementationOnce(
      async (_bucket, { uploadKey }) => {
        expect(await MongoS3TTL.exists({ minioKey: uploadKey })).toBeTruthy();
        throw new Error('storage unavailable');
      }
    );
    await expect(
      normalizeDatasetDataImages({ ...scope, data: [{ q: `![image](${url})` }] })
    ).rejects.toThrow('storage unavailable');
    expect(await MongoS3TTL.countDocuments()).toBe(1);
  });

  it('concurrent first uploads acquire the same stable directory', async () => {
    const { scope } = await createDatasetCollectionFixture();
    const results = await Promise.all(
      [scope.collectionId.toUpperCase(), scope.collectionId].map((collectionId) =>
        normalizeDatasetDataImages({ ...scope, collectionId, data: [{ q: `![image](${url})` }] })
      )
    );
    expect(results.map((result) => result.imageUploadKeys[0].split('/')[3])).toEqual([
      scope.collectionId,
      scope.collectionId
    ]);
  });

  it('allows up to 3 inline images per data item and rejects 4+ before any DB or S3 writes', async () => {
    const { scope } = await createDatasetCollectionFixture();
    const three = await normalizeDatasetDataImages({
      ...scope,
      data: [{ q: `![1](${url}) ![2](${url})`, a: `<img src="${url}">` }]
    });
    expect(three.imageUploadKeys).toHaveLength(1);
    expect(s3Utils.uploadImage2S3Bucket).toHaveBeenCalledTimes(1);

    const { scope: scope2 } = await createDatasetCollectionFixture();
    vi.mocked(s3Utils.uploadImage2S3Bucket).mockClear();
    await expect(
      normalizeDatasetDataImages({
        ...scope2,
        data: [
          { q: `![ok](${url})` },
          { q: `![1](${url}) ![2](${url}) ![3](${url})`, a: `![4](${url})` }
        ]
      })
    ).rejects.toThrow('at most 3 inline images');
    expect(s3Utils.uploadImage2S3Bucket).not.toHaveBeenCalled();
    expect(
      (await MongoDatasetCollection.findById(scope2.collectionId).lean())?.chunkImagePrefixId
    ).toBeUndefined();

    // 编辑已有 3 张受管内联图的数据再追加第 4 张新图时也应被预检拒绝
    const existingKeys = Array.from(
      { length: 3 },
      (_, i) =>
        `dataset/${scope2.datasetId}/chunk-images/${scope2.collectionId}/file/${String(i).padStart(32, 'a')}.png`
    );
    await expect(
      normalizeDatasetDataImages({
        ...scope2,
        data: [
          {
            q: existingKeys.map((k, i) => `![e${i}](${k})`).join(' '),
            a: `![new4](${url})`
          }
        ]
      })
    ).rejects.toThrow('at most 3 inline images');
    expect(s3Utils.uploadImage2S3Bucket).not.toHaveBeenCalled();
  });

  it('rejects non-canonical trailing base64 bits and unpadded remainder=1 without touching storage', async () => {
    const { scope } = await createDatasetCollectionFixture();
    await expect(
      normalizeDatasetDataImages({
        ...scope,
        data: [{ q: '![badbits](data:image/png;base64,YR==)' }]
      })
    ).rejects.toThrow('Invalid inline base64 image');
    await expect(
      normalizeDatasetDataImages({
        ...scope,
        data: [{ q: '![badlen](data:image/png;base64,AAAAA)' }]
      })
    ).rejects.toThrow('Invalid inline base64 image');
    expect(s3Utils.uploadImage2S3Bucket).not.toHaveBeenCalled();
  });
});
