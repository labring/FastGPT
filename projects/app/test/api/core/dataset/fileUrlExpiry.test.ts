import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import type { GetTrainingDataDetailResponse } from '@fastgpt/global/openapi/core/dataset/training/api';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, vi } from 'vitest';

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * 知识库图片预览短链的有效期必须由 FILE_URL_EXPIRED_HOURS 控制。
 *
 * env 在模块加载时取值，因此这里重新加载路由模块后再请求接口，验证真实签发结果，
 * 而不是断言路由传给签发函数的参数。
 */
describe('file access link expiry', () => {
  it('signs the knowledge base image preview url with FILE_URL_EXPIRED_HOURS', async () => {
    vi.resetModules();
    vi.stubEnv('FILE_URL_EXPIRED_HOURS', '6');

    const [{ default: handler }, { verifyS3DownloadAccess }] = await Promise.all([
      import('@/pages/api/core/dataset/training/getTrainingDataDetail'),
      vi.importActual<typeof import('@fastgpt/service/common/s3/accessLink')>(
        '@fastgpt/service/common/s3/accessLink'
      )
    ]);

    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'test',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModel: 'test',
      agentModel: 'test'
    });
    const collection = await MongoDatasetCollection.create({
      name: 'test',
      type: DatasetCollectionTypeEnum.file,
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id
    });
    const trainingData = await MongoDatasetTraining.create({
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: dataset._id,
      collectionId: collection._id,
      billId: 'test',
      mode: TrainingModeEnum.chunk,
      q: 'test',
      a: 'test',
      imageId: 'dataset/team-1/kb-image.png'
    });

    const res = await Call<unknown, Record<string, never>, GetTrainingDataDetailResponse>(handler, {
      auth: root,
      body: { collectionId: collection._id, dataId: trainingData._id }
    });

    expect(res.code).toBe(200);
    const previewUrl = res.data?.imagePreviewUrl;
    expect(previewUrl).toBeDefined();

    const { expiresAt } = await verifyS3DownloadAccess(previewUrl!.split('/').pop() || '');
    // 短链过期时间按 1 小时分桶向上取整，不会缩短请求时长。
    const ttlMs = expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(6 * ONE_HOUR_MS - 60_000);
    expect(ttlMs).toBeLessThan(7 * ONE_HOUR_MS);
  });
});
