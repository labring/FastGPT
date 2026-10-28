import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeDatasetDataImages } from '@fastgpt/service/core/dataset/data/inlineImages/service';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import * as s3Utils from '@fastgpt/service/common/s3/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  preCreateDatasetDataAndPushToTrainingQueue,
  pushDataListToTrainingQueue
} from '@fastgpt/service/core/dataset/training/controller';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getModelTestDefaults } from '@test/modelCache';
import { getRootUser } from '@test/datas/users';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const datasetId = '507f1f77bcf86cd799439011';
const collectionId = '507f1f77bcf86cd799439012';
const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk1kAAAAASUVORK5CYII=';

describe('API dataset inline images', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(s3Utils, 'uploadImage2S3Bucket').mockImplementation(async (_bucket, params) => {
      // 登记必须先于存储写入，失败结果不确定时仍需有清理依据。
      expect(await MongoS3TTL.countDocuments({ minioKey: params.uploadKey })).toBe(1);
      return params.uploadKey;
    });
  });

  it('preserves markdown, HTML, chunk fields and external image URLs while deduplicating q/a images', async () => {
    const external = '![external](https://example.com/a(1).png "title")';
    const data = [
      {
        q: `  before\n\n![one](${image} "caption")\n${external}`,
        chunkIndex: 7,
        metadata: { tag: 'one' }
      },
      { q: 'next', a: `<table><tr><td><img alt="two" src="${image}" width="12"></td></tr></table>` }
    ];
    const normalized = await normalizeDatasetDataImages({ datasetId, data });
    const key = vi.mocked(s3Utils.uploadImage2S3Bucket).mock.calls[0][1].uploadKey;

    expect(normalized[0]).toEqual({ ...data[0], q: data[0].q.replace(image, key) });
    expect(normalized[1]).toEqual({ ...data[1], a: data[1].a!.replace(image, key) });
    expect(normalized[0].q).toContain(external);
    expect(data[0].q).toContain(image);
    expect(key).toMatch(new RegExp(`^dataset/${datasetId}/file/[a-f0-9]{32}\\.png$`));
    expect(s3Utils.uploadImage2S3Bucket).toHaveBeenCalledTimes(1);
    expect(await MongoS3TTL.countDocuments()).toBe(1);
  });

  it('leaves plain text and existing keys byte-for-byte unchanged without uploading', async () => {
    const data = [
      { q: '  text\n\n\n\\[literal\\]', a: `![stored](dataset/${datasetId}/file.png)` },
      {}
    ];
    expect(await normalizeDatasetDataImages({ datasetId, data })).toEqual(data);
    expect(s3Utils.uploadImage2S3Bucket).not.toHaveBeenCalled();
    expect(await MongoS3TTL.countDocuments()).toBe(0);
  });

  it('passes decoded image bytes and MIME to the upload helper', async () => {
    const data = await normalizeDatasetDataImages({
      datasetId,
      data: [{ q: `![pixel](${image})` }]
    });
    expect(s3Utils.uploadImage2S3Bucket).toHaveBeenCalledWith(
      'private',
      expect.objectContaining({
        buffer: Buffer.from(image.split(',')[1], 'base64'),
        mimetype: 'image/png',
        uploadKey: expect.stringContaining(`dataset/${datasetId}/file/`)
      })
    );
    expect(data[0].q).not.toContain('base64,');
    expect(await MongoS3TTL.countDocuments()).toBe(1);
  });

  it('retains earlier uploaded images for cleanup if a later image is invalid', async () => {
    await expect(
      normalizeDatasetDataImages({
        datasetId,
        data: [{ q: `![valid](${image})` }, { q: '![invalid](data:image/png;base64,not-valid!)' }]
      })
    ).rejects.toThrow();
    expect(s3Utils.uploadImage2S3Bucket).toHaveBeenCalledTimes(1);
    expect(await MongoS3TTL.countDocuments()).toBe(1);
  });

  it.each([
    'data:image/png;base64,not-base64!',
    'data:image/png;base64,',
    'data:image/png;base64,A',
    'data:image/unknown;base64,aGVsbG8=',
    'data:image/png;base64,aGVsbG8=',
    image.replace('image/png', 'image/jpeg')
  ])('rejects malformed or mismatched image content before uploading: %s', async (url) => {
    await expect(
      normalizeDatasetDataImages({ datasetId, data: [{ q: `![bad](${url})` }] })
    ).rejects.toThrow();
    expect(s3Utils.uploadImage2S3Bucket).not.toHaveBeenCalled();
    expect(await MongoS3TTL.countDocuments()).toBe(0);
  });

  it('propagates storage failures and retains the cleanup record', async () => {
    vi.mocked(s3Utils.uploadImage2S3Bucket).mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(
      normalizeDatasetDataImages({ datasetId, data: [{ q: `![one](${image})` }] })
    ).rejects.toThrow('storage unavailable');
    expect(await MongoS3TTL.countDocuments()).toBe(1);
  });

  it.each([TrainingModeEnum.index, TrainingModeEnum.qa])(
    'persists accepted %s images with the training transaction',
    async (mode) => {
      const root = await getRootUser();
      const data = await normalizeDatasetDataImages({
        datasetId,
        data: [{ q: `q ![one](${image})`, chunkIndex: 9 }]
      });
      const result = await mongoSessionRun((session) => {
        const props = {
          datasetId,
          collectionId,
          data,
          mode,
          session,
          teamId: root.teamId,
          tmbId: root.tmbId,
          billId: 'test',
          vectorModel: getModelTestDefaults().embedding!,
          agentModel: getModelTestDefaults().llm!
        };
        return mode === TrainingModeEnum.qa
          ? pushDataListToTrainingQueue(props)
          : preCreateDatasetDataAndPushToTrainingQueue(props);
      });
      expect(result.insertLen).toBe(1);
      expect(await MongoS3TTL.countDocuments()).toBe(0);
      expect(await MongoDatasetTraining.findOne({ datasetId }).lean()).toMatchObject({
        q: data[0].q,
        chunkIndex: 9
      });
      if (mode === TrainingModeEnum.index) {
        expect(await MongoDatasetData.findOne({ datasetId }).lean()).toMatchObject({
          q: data[0].q,
          chunkIndex: 9
        });
      }
    }
  );

  it('keeps TTL records when the training transaction rolls back', async () => {
    const root = await getRootUser();
    const data = await normalizeDatasetDataImages({
      datasetId,
      data: [{ q: `q ![one](${image})` }]
    });
    await expect(
      mongoSessionRun(async (session) => {
        await pushDataListToTrainingQueue({
          datasetId,
          collectionId,
          data,
          session,
          mode: TrainingModeEnum.index,
          teamId: root.teamId,
          tmbId: root.tmbId,
          billId: 'test',
          vectorModel: getModelTestDefaults().embedding!
        });
        throw new Error('abort training');
      })
    ).rejects.toThrow('abort training');
    expect(await MongoS3TTL.countDocuments()).toBe(1);
    expect(await MongoDatasetTraining.countDocuments()).toBe(0);
  });

  it('retains cleanup records for filtered chunks and foreign dataset references', async () => {
    const root = await getRootUser();
    const data = await normalizeDatasetDataImages({
      datasetId,
      data: [{ q: `q ![one](${image})` }]
    });
    const key = vi.mocked(s3Utils.uploadImage2S3Bucket).mock.calls[0][1].uploadKey;
    const foreignKey = 'dataset/507f1f77bcf86cd799439099/file.png';
    await MongoS3TTL.create({
      minioKey: foreignKey,
      bucketName: S3Buckets.private,
      expiredTime: new Date(Date.now() + 3600000)
    });
    const result = await mongoSessionRun((session) =>
      pushDataListToTrainingQueue({
        datasetId,
        collectionId,
        session,
        mode: TrainingModeEnum.qa,
        teamId: root.teamId,
        tmbId: root.tmbId,
        billId: 'test',
        vectorModel: getModelTestDefaults().embedding!,
        agentModel: {
          ...getModelTestDefaults().llm!,
          config: { ...getModelTestDefaults().llm!.config, maxContext: 4000 }
        },
        data: [
          { ...data[0], q: 'x'.repeat(4001) + data[0].q },
          { q: `accepted ![foreign](${foreignKey})` }
        ]
      })
    );
    expect(result.insertLen).toBe(1);
    expect(await MongoS3TTL.find({}).distinct('minioKey')).toEqual(
      expect.arrayContaining([key, foreignKey])
    );
  });
});
