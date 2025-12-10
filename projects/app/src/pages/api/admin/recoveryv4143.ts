import { NextAPI } from '@/service/middleware/entry';
import { addLog } from '@fastgpt/service/common/system/log';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { type NextApiRequest, type NextApiResponse } from 'next';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import {
  getDownloadStream,
  getGFSCollection
} from '@fastgpt/service/common/file/gridfs/controller';
import pLimit from 'p-limit';
import { MongoDatasetMigrationLog } from '@fastgpt/service/core/dataset/migration/schema';
import { randomUUID } from 'crypto';
import {
  uploadImage2S3Bucket,
  removeS3TTL,
  truncateFilename
} from '@fastgpt/service/common/s3/utils';
import { connectionMongo, Types } from '@fastgpt/service/common/mongo';

// 将 GridFS 的流转换为 Buffer
async function gridFSStreamToBuffer(
  stream: Awaited<ReturnType<typeof getDownloadStream>>
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  stream.on('data', (chunk) => chunks.push(chunk));

  await new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });

  return Buffer.concat(chunks);
}

// 获取 dataset_image 的 GridFS bucket
function getDatasetImageGridBucket() {
  return new connectionMongo.mongo.GridFSBucket(connectionMongo.connection.db!, {
    bucketName: 'dataset_image'
  });
}

// 恢复单个 collection 文件
async function recoverCollectionFile({
  batchId,
  migrationLog
}: {
  batchId: string;
  migrationLog: any;
}) {
  const { sourceStorage, targetStorage, resourceId } = migrationLog;

  try {
    addLog.info(
      `[Recovery ${batchId}] Recovering collection file. ResourceId: ${resourceId}, GridFS FileId: ${sourceStorage.fileId}, S3 Key: ${targetStorage.key}`
    );

    // 阶段 1: 从 GridFS 下载
    const downloadStartTime = Date.now();
    let buffer: Buffer;
    try {
      const stream = await getDownloadStream({
        bucketName: 'dataset',
        fileId: sourceStorage.fileId
      });
      buffer = await gridFSStreamToBuffer(stream);

      addLog.info(
        `[Recovery ${batchId}] Downloaded from GridFS. Size: ${buffer.length} bytes, Duration: ${Date.now() - downloadStartTime}ms`
      );
    } catch (error) {
      addLog.error(
        `[Recovery ${batchId}] Failed to download from GridFS for resource ${resourceId}:`,
        error
      );
      throw error;
    }

    // 阶段 2: 上传到 S3（使用原来的 key）
    const uploadStartTime = Date.now();
    try {
      const s3Key = targetStorage.key;
      const filename = migrationLog.metadata?.fileName || 'file';

      // 直接使用 bucket.putObject 上传到指定的 key
      const s3Source = getS3DatasetSource();
      await s3Source.client.putObject(s3Source.bucketName, s3Key, buffer, buffer.length, {
        'content-type': 'application/octet-stream',
        'upload-time': new Date().toISOString(),
        'origin-filename': encodeURIComponent(filename)
      });

      addLog.info(
        `[Recovery ${batchId}] Uploaded to S3. Key: ${s3Key}, Duration: ${Date.now() - uploadStartTime}ms`
      );
    } catch (error) {
      addLog.error(
        `[Recovery ${batchId}] Failed to upload to S3 for resource ${resourceId}:`,
        error
      );
      throw error;
    }

    // 阶段 3: 立即移除 TTL
    try {
      await removeS3TTL({ key: [targetStorage.key], bucketName: 'private' });
      addLog.info(`[Recovery ${batchId}] Removed TTL for ${targetStorage.key}`);
    } catch (error) {
      addLog.warn(`[Recovery ${batchId}] Failed to remove TTL (non-critical): ${error}`);
    }

    return { success: true, resourceId };
  } catch (error) {
    addLog.error(`[Recovery ${batchId}] Failed to recover resource ${resourceId}: ${error}`);
    return { success: false, resourceId, error };
  }
}

// 恢复单个 image 文件
async function recoverImageFile({ batchId, migrationLog }: { batchId: string; migrationLog: any }) {
  const { sourceStorage, targetStorage, resourceId } = migrationLog;

  try {
    addLog.info(
      `[Recovery ${batchId}] Recovering image file. ResourceId: ${resourceId}, GridFS ImageId: ${sourceStorage.fileId}, S3 Key: ${targetStorage.key}`
    );

    // 阶段 1: 从 GridFS 下载
    const downloadStartTime = Date.now();
    let buffer: Buffer;
    try {
      const bucket = getDatasetImageGridBucket();
      const stream = bucket.openDownloadStream(new Types.ObjectId(sourceStorage.fileId));
      buffer = await gridFSStreamToBuffer(stream);

      addLog.info(
        `[Recovery ${batchId}] Downloaded image from GridFS. Size: ${buffer.length} bytes, Duration: ${Date.now() - downloadStartTime}ms`
      );
    } catch (error) {
      addLog.error(
        `[Recovery ${batchId}] Failed to download image from GridFS for resource ${resourceId}:`,
        error
      );
      throw error;
    }

    // 阶段 2: 上传到 S3（使用原来的 key）
    const uploadStartTime = Date.now();
    try {
      const s3Key = targetStorage.key;
      const filename = migrationLog.metadata?.fileName || 'image.png';
      const truncatedFilename = truncateFilename(filename);

      // 使用 uploadImage2S3Bucket 上传图片
      // 注意：uploadImage2S3Bucket 返回的是完整的 URL 或 key
      await uploadImage2S3Bucket('private', {
        base64Img: buffer.toString('base64'),
        uploadKey: s3Key,
        mimetype: 'image/png', // 默认值，实际会从文件判断
        filename: truncatedFilename,
        expiredTime: undefined // 不设置过期时间
      });

      addLog.info(
        `[Recovery ${batchId}] Uploaded image to S3. Key: ${s3Key}, Duration: ${Date.now() - uploadStartTime}ms`
      );
    } catch (error) {
      addLog.error(
        `[Recovery ${batchId}] Failed to upload image to S3 for resource ${resourceId}:`,
        error
      );
      throw error;
    }

    // 阶段 3: 立即移除 TTL
    try {
      await removeS3TTL({ key: [targetStorage.key], bucketName: 'private' });
      addLog.info(`[Recovery ${batchId}] Removed TTL for ${targetStorage.key}`);
    } catch (error) {
      addLog.warn(`[Recovery ${batchId}] Failed to remove TTL (non-critical): ${error}`);
    }

    return { success: true, resourceId };
  } catch (error) {
    addLog.error(`[Recovery ${batchId}] Failed to recover image ${resourceId}: ${error}`);
    return { success: false, resourceId, error };
  }
}

// 批量恢复 collections
async function recoverCollectionBatch({
  batchId,
  offset,
  limit,
  concurrency,
  migrationBatchId
}: {
  batchId: string;
  offset: number;
  limit: number;
  concurrency: number;
  migrationBatchId?: string;
}) {
  // 查找已完成的 collection 迁移记录
  const query: any = {
    resourceType: 'collection',
    status: 'completed',
    'sourceStorage.fileId': { $exists: true, $ne: null },
    'targetStorage.key': { $exists: true, $ne: null }
  };

  if (migrationBatchId) {
    query.batchId = migrationBatchId;
  }

  const migrationLogs = await MongoDatasetMigrationLog.find(query).skip(offset).limit(limit).lean();

  if (migrationLogs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  addLog.info(`[Recovery ${batchId}] Found ${migrationLogs.length} collections to recover`);

  const limitFn = pLimit(concurrency);
  let succeeded = 0;
  let failed = 0;

  const tasks = migrationLogs.map((log) =>
    limitFn(async () => {
      const result = await recoverCollectionFile({ batchId, migrationLog: log });
      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
    })
  );

  await Promise.allSettled(tasks);

  return {
    processed: migrationLogs.length,
    succeeded,
    failed
  };
}

// 批量恢复 images
async function recoverImageBatch({
  batchId,
  offset,
  limit,
  concurrency,
  migrationBatchId
}: {
  batchId: string;
  offset: number;
  limit: number;
  concurrency: number;
  migrationBatchId?: string;
}) {
  // 查找已完成的 image 迁移记录
  const query: any = {
    resourceType: 'data_image',
    status: 'completed',
    'sourceStorage.fileId': { $exists: true, $ne: null },
    'targetStorage.key': { $exists: true, $ne: null }
  };

  if (migrationBatchId) {
    query.batchId = migrationBatchId;
  }

  const migrationLogs = await MongoDatasetMigrationLog.find(query).skip(offset).limit(limit).lean();

  if (migrationLogs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  addLog.info(`[Recovery ${batchId}] Found ${migrationLogs.length} images to recover`);

  const limitFn = pLimit(concurrency);
  let succeeded = 0;
  let failed = 0;

  const tasks = migrationLogs.map((log) =>
    limitFn(async () => {
      const result = await recoverImageFile({ batchId, migrationLog: log });
      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
    })
  );

  await Promise.allSettled(tasks);

  return {
    processed: migrationLogs.length,
    succeeded,
    failed
  };
}

async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  // 恢复配置
  const config = {
    collectionBatchSize: 500,
    collectionConcurrency: 10,
    imageBatchSize: 500,
    imageConcurrency: 5,
    pauseBetweenBatches: 1000, // ms
    // 可选：指定要恢复的迁移批次ID，如果不指定则恢复所有
    migrationBatchId: req.body?.migrationBatchId as string | undefined
  };

  // 生成唯一的恢复批次 ID
  const recoveryBatchId = `recovery_${Date.now()}_${randomUUID()}`;

  addLog.info(`[Recovery ${recoveryBatchId}] Starting recovery process`);
  if (config.migrationBatchId) {
    addLog.info(`[Recovery ${recoveryBatchId}] Target migration batch: ${config.migrationBatchId}`);
  }

  // ========== 恢复 Collections ==========
  addLog.info(`[Recovery ${recoveryBatchId}] Starting collection recovery...`);

  // 获取总数
  const collectionQuery: any = {
    resourceType: 'collection',
    status: 'completed',
    'sourceStorage.fileId': { $exists: true, $ne: null },
    'targetStorage.key': { $exists: true, $ne: null }
  };
  if (config.migrationBatchId) {
    collectionQuery.batchId = config.migrationBatchId;
  }

  const totalCollections = await MongoDatasetMigrationLog.countDocuments(collectionQuery);
  addLog.info(`[Recovery ${recoveryBatchId}] Total collections to recover: ${totalCollections}`);

  let collectionStats = {
    processed: 0,
    succeeded: 0,
    failed: 0
  };

  // 分批恢复 collections
  for (let offset = 0; offset < totalCollections; offset += config.collectionBatchSize) {
    const currentBatch = Math.floor(offset / config.collectionBatchSize) + 1;
    const totalBatches = Math.ceil(totalCollections / config.collectionBatchSize);

    addLog.info(
      `[Recovery ${recoveryBatchId}] Processing collections batch ${currentBatch}/${totalBatches} (${offset}-${offset + config.collectionBatchSize})`
    );

    const batchStats = await recoverCollectionBatch({
      batchId: recoveryBatchId,
      offset,
      limit: config.collectionBatchSize,
      concurrency: config.collectionConcurrency,
      migrationBatchId: config.migrationBatchId
    });

    collectionStats.processed += batchStats.processed;
    collectionStats.succeeded += batchStats.succeeded;
    collectionStats.failed += batchStats.failed;

    addLog.info(
      `[Recovery ${recoveryBatchId}] Batch ${currentBatch}/${totalBatches} completed. Batch: +${batchStats.succeeded} succeeded, +${batchStats.failed} failed. Total progress: ${collectionStats.succeeded}/${totalCollections}`
    );

    // 暂停一下
    if (offset + config.collectionBatchSize < totalCollections) {
      await new Promise((resolve) => setTimeout(resolve, config.pauseBetweenBatches));
    }
  }

  // ========== 恢复 Images ==========
  addLog.info(`[Recovery ${recoveryBatchId}] Starting image recovery...`);

  const imageQuery: any = {
    resourceType: 'data_image',
    status: 'completed',
    'sourceStorage.fileId': { $exists: true, $ne: null },
    'targetStorage.key': { $exists: true, $ne: null }
  };
  if (config.migrationBatchId) {
    imageQuery.batchId = config.migrationBatchId;
  }

  const totalImages = await MongoDatasetMigrationLog.countDocuments(imageQuery);
  addLog.info(`[Recovery ${recoveryBatchId}] Total images to recover: ${totalImages}`);

  let imageStats = {
    processed: 0,
    succeeded: 0,
    failed: 0
  };

  // 分批恢复 images
  for (let offset = 0; offset < totalImages; offset += config.imageBatchSize) {
    const currentBatch = Math.floor(offset / config.imageBatchSize) + 1;
    const totalBatches = Math.ceil(totalImages / config.imageBatchSize);

    addLog.info(
      `[Recovery ${recoveryBatchId}] Processing images batch ${currentBatch}/${totalBatches} (${offset}-${offset + config.imageBatchSize})`
    );

    const batchStats = await recoverImageBatch({
      batchId: recoveryBatchId,
      offset,
      limit: config.imageBatchSize,
      concurrency: config.imageConcurrency,
      migrationBatchId: config.migrationBatchId
    });

    imageStats.processed += batchStats.processed;
    imageStats.succeeded += batchStats.succeeded;
    imageStats.failed += batchStats.failed;

    addLog.info(
      `[Recovery ${recoveryBatchId}] Batch ${currentBatch}/${totalBatches} completed. Batch: +${batchStats.succeeded} succeeded, +${batchStats.failed} failed. Total progress: ${imageStats.succeeded}/${totalImages}`
    );

    // 暂停一下
    if (offset + config.imageBatchSize < totalImages) {
      await new Promise((resolve) => setTimeout(resolve, config.pauseBetweenBatches));
    }
  }

  // ========== 汇总统计 ==========
  addLog.info(`[Recovery ${recoveryBatchId}] ========== Recovery Summary ==========`);
  addLog.info(
    `[Recovery ${recoveryBatchId}] Collections - Total: ${totalCollections}, Succeeded: ${collectionStats.succeeded}, Failed: ${collectionStats.failed}`
  );
  addLog.info(
    `[Recovery ${recoveryBatchId}] Images - Total: ${totalImages}, Succeeded: ${imageStats.succeeded}, Failed: ${imageStats.failed}`
  );
  addLog.info(`[Recovery ${recoveryBatchId}] =======================================`);

  return {
    recoveryBatchId,
    migrationBatchId: config.migrationBatchId,
    summary: {
      collections: {
        total: totalCollections,
        processed: collectionStats.processed,
        succeeded: collectionStats.succeeded,
        failed: collectionStats.failed
      },
      images: {
        total: totalImages,
        processed: imageStats.processed,
        succeeded: imageStats.succeeded,
        failed: imageStats.failed
      }
    }
  };
}

export default NextAPI(handler);
