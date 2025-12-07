import { NextAPI } from '@/service/middleware/entry';
import { addLog } from '@fastgpt/service/common/system/log';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { type NextApiRequest, type NextApiResponse } from 'next';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import type { getDownloadStream } from '@fastgpt/service/common/file/gridfs/controller';
import { getGFSCollection } from '@fastgpt/service/common/file/gridfs/controller';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import pLimit from 'p-limit';
import { MongoDatasetMigrationLog } from '@fastgpt/service/core/dataset/migration/schema';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { randomUUID } from 'crypto';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  uploadImage2S3Bucket,
  removeS3TTL,
  getFileS3Key,
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

// ========== Dataset Image Migration Functions ==========

// 获取 dataset_image 的 GridFS bucket
function getDatasetImageGridBucket() {
  return new connectionMongo.mongo.GridFSBucket(connectionMongo.connection.db!, {
    bucketName: 'dataset_image'
  });
}

// 获取 dataset_image 的 GridFS collection
function getDatasetImageGFSCollection() {
  return connectionMongo.connection.db!.collection('dataset_image.files');
}

// 处理单批 image
async function processImageBatch({
  batchId,
  migrationVersion,
  offset,
  limit,
  concurrency
}: {
  batchId: string;
  migrationVersion: string;
  offset: number;
  limit: number;
  concurrency: number;
}) {
  // 1. 获取这一批的 GridFS 图片文件
  const imageFiles = await getDatasetImageGFSCollection()
    .find(
      {},
      {
        projection: {
          _id: 1,
          filename: 1,
          contentType: 1,
          length: 1,
          metadata: 1
        }
      }
    )
    .skip(offset)
    .limit(limit)
    .toArray();

  if (imageFiles.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  // 2. 获取所有的 imageId，并在 dataset_datas 中查找对应的记录
  const imageIds = imageFiles.map((file) => file._id.toString());
  const dataList = await MongoDatasetData.find(
    {
      imageId: { $in: imageIds }
    },
    '_id imageId teamId datasetId collectionId updateTime'
  ).lean();

  if (dataList.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  // 3. 过滤已完成的
  const completedMigrations = await MongoDatasetMigrationLog.find(
    {
      resourceType: 'data_image',
      resourceId: { $in: dataList.map((d) => d._id) },
      status: 'completed'
    },
    'resourceId'
  ).lean();

  const completedIds = new Set(completedMigrations.map((m) => m.resourceId.toString()));
  const pendingDataList = dataList.filter((d) => !completedIds.has(d._id.toString()));

  const skippedCount = dataList.length - pendingDataList.length;

  if (pendingDataList.length === 0) {
    addLog.info(
      `[Migration ${batchId}] Image batch all skipped. Total: ${dataList.length}, Skipped: ${skippedCount}`
    );
    return {
      processed: dataList.length,
      succeeded: 0,
      failed: 0,
      skipped: skippedCount
    };
  }

  addLog.info(
    `[Migration ${batchId}] Processing ${pendingDataList.length} images (${skippedCount} skipped)`
  );

  // 4. 创建 imageId 到 file 的映射
  const imageFileMap = new Map(imageFiles.map((file) => [file._id.toString(), file]));

  // 5. 为每个 data 关联对应的 image file
  const imageDataPairs = pendingDataList
    .map((data) => {
      const imageFile = imageFileMap.get(data.imageId!);
      if (!imageFile) {
        addLog.warn(
          `[Migration ${batchId}] Image file not found for imageId: ${data.imageId}, dataId: ${data._id}`
        );
        return null;
      }
      return { data, imageFile };
    })
    .filter((pair) => pair !== null);

  if (imageDataPairs.length === 0) {
    return { processed: dataList.length, succeeded: 0, failed: 0, skipped: dataList.length };
  }

  // 6. 创建迁移日志
  const imageMigrationLogs = imageDataPairs.map(({ data, imageFile }) => ({
    batchId,
    migrationVersion,
    resourceType: 'data_image' as const,
    resourceId: data._id,
    teamId: data.teamId,
    datasetId: data.datasetId,
    sourceStorage: {
      type: 'gridfs' as const,
      fileId: data.imageId,
      bucketName: 'dataset_image' as any
    },
    status: 'pending' as const,
    attemptCount: 0,
    maxAttempts: 3,
    verified: false,
    operations: [],
    metadata: {
      fileName: imageFile.filename,
      originalUpdateTime: data.updateTime,
      nodeEnv: process.env.NODE_ENV
    }
  }));

  if (imageMigrationLogs.length > 0) {
    await MongoDatasetMigrationLog.insertMany(imageMigrationLogs, { ordered: false });
  }

  // 7. 执行迁移
  const limitFn = pLimit(concurrency);
  let succeeded = 0;
  let failed = 0;

  const tasks = imageDataPairs.map(({ data, imageFile }) =>
    limitFn(async () => {
      try {
        const { key, dataId } = await migrateDatasetImage({ batchId, data, imageFile });
        await updateDatasetDataImageId({ batchId, dataId, key });
        succeeded++;
      } catch (error) {
        failed++;
        addLog.error(`[Migration ${batchId}] Failed to migrate image for data ${data._id}:`, error);
      }
    })
  );

  await Promise.allSettled(tasks);

  return {
    processed: dataList.length,
    succeeded,
    failed,
    skipped: skippedCount
  };
}

// 从 GridFS 迁移单个图片到 S3
async function migrateDatasetImage({
  batchId,
  data,
  imageFile
}: {
  batchId: string;
  data: DatasetDataSchemaType;
  imageFile: any;
}) {
  const { imageId, datasetId, _id } = data;
  const dataId = _id.toString();

  try {
    // 更新状态为处理中
    await MongoDatasetMigrationLog.updateOne(
      { batchId, resourceId: _id },
      {
        $set: {
          status: 'processing',
          startedAt: new Date(),
          lastAttemptAt: new Date()
        },
        $inc: { attemptCount: 1 }
      }
    );

    // 阶段 1: 从 GridFS 下载
    const downloadStartTime = Date.now();
    let buffer: Buffer;
    try {
      const bucket = getDatasetImageGridBucket();
      const stream = bucket.openDownloadStream(new Types.ObjectId(imageId!));
      buffer = await gridFSStreamToBuffer(stream);
      await MongoDatasetMigrationLog.updateOne(
        { batchId, resourceId: _id },
        {
          $push: {
            operations: {
              action: 'download_from_gridfs',
              timestamp: new Date(),
              success: true,
              duration: Date.now() - downloadStartTime,
              details: {
                fileSize: buffer.length,
                filename: imageFile.filename
              }
            }
          },
          $set: {
            'sourceStorage.fileSize': buffer.length
          }
        }
      );
    } catch (error) {
      await MongoDatasetMigrationLog.updateOne(
        { batchId, resourceId: _id },
        {
          $set: {
            status: 'failed',
            'error.message': error instanceof Error ? error.message : String(error),
            'error.stack': error instanceof Error ? error.stack : undefined,
            'error.phase': 'download'
          }
        }
      );
      throw error;
    }

    // 阶段 2: 上传到 S3
    const uploadStartTime = Date.now();
    let key: string;
    try {
      // 从文件名中提取扩展名
      const mimetype = imageFile.contentType || 'image/png';
      const filename = imageFile.filename || 'image.png';

      // 截断文件名以避免S3 key过长的问题
      const truncatedFilename = truncateFilename(filename);

      // 构造 S3 key
      const { fileKey: s3Key } = getFileS3Key.dataset({ datasetId, filename: truncatedFilename });

      // 使用 uploadImage2S3Bucket 上传图片（不设置过期时间）
      key = await uploadImage2S3Bucket('private', {
        base64Img: buffer.toString('base64'),
        uploadKey: s3Key,
        mimetype,
        filename: truncatedFilename,
        expiredTime: undefined // 不设置过期时间
      });

      await MongoDatasetMigrationLog.updateOne(
        { batchId, resourceId: _id },
        {
          $push: {
            operations: {
              action: 'upload_to_s3',
              timestamp: new Date(),
              success: true,
              duration: Date.now() - uploadStartTime,
              details: {
                s3Key: key
              }
            }
          },
          $set: {
            'targetStorage.key': key,
            'targetStorage.fileSize': buffer.length
          }
        }
      );
    } catch (error) {
      await MongoDatasetMigrationLog.updateOne(
        { batchId, resourceId: _id },
        {
          $set: {
            status: 'failed',
            'error.message': error instanceof Error ? error.message : String(error),
            'error.stack': error instanceof Error ? error.stack : undefined,
            'error.phase': 'upload'
          }
        }
      );
      throw error;
    }

    return {
      key,
      dataId
    };
  } catch (error) {
    addLog.error(`[Migration ${batchId}] Failed to migrate image for data ${dataId}:`, error);
    throw error;
  }
}

// 更新 dataset_datas 的 imageId 为 S3 的 key
async function updateDatasetDataImageId({
  batchId,
  dataId,
  key
}: {
  batchId: string;
  dataId: string;
  key: string;
}) {
  const updateStartTime = Date.now();

  try {
    // 更新 data imageId
    await MongoDatasetData.updateOne({ _id: dataId }, { $set: { imageId: key } });

    // 标记迁移为完成
    await MongoDatasetMigrationLog.updateOne(
      { batchId, resourceId: dataId },
      {
        $set: {
          status: 'completed',
          completedAt: new Date()
        },
        $push: {
          operations: {
            action: 'update_data_imageId',
            timestamp: new Date(),
            success: true,
            duration: Date.now() - updateStartTime,
            details: {
              newImageId: key
            }
          }
        }
      }
    );

    return {
      dataId,
      key
    };
  } catch (error) {
    // 标记迁移为失败
    await MongoDatasetMigrationLog.updateOne(
      { batchId, resourceId: dataId },
      {
        $set: {
          status: 'failed',
          'error.message': error instanceof Error ? error.message : String(error),
          'error.stack': error instanceof Error ? error.stack : undefined,
          'error.phase': 'update_db'
        }
      }
    );

    addLog.error(`[Migration ${batchId}] Failed to update data ${dataId}:`, error);
    throw error;
  }
}

// 批量删除已完成迁移的 S3 文件的 TTL
async function removeTTLForCompletedMigrations(batchId: string) {
  try {
    addLog.info(`[Migration ${batchId}] Removing TTL for completed migrations...`);

    // 分批删除，避免一次查询太多
    const BATCH_SIZE = 5000;
    let offset = 0;
    let totalRemoved = 0;

    while (true) {
      const completedMigrations = await MongoDatasetMigrationLog.find(
        {
          batchId,
          status: 'completed',
          'targetStorage.key': { $exists: true, $ne: null }
        },
        'targetStorage.key'
      )
        .skip(offset)
        .limit(BATCH_SIZE)
        .lean();

      if (completedMigrations.length === 0) break;

      const keys = completedMigrations
        .map((log) => log.targetStorage?.key)
        .filter(Boolean) as string[];

      if (keys.length > 0) {
        await removeS3TTL({ key: keys, bucketName: 'private' });
        totalRemoved += keys.length;
        addLog.info(`[Migration ${batchId}] Removed TTL for ${totalRemoved} objects so far`);
      }

      offset += BATCH_SIZE;

      if (completedMigrations.length < BATCH_SIZE) break;
    }

    addLog.info(`[Migration ${batchId}] Total TTL removed: ${totalRemoved}`);
  } catch (error) {
    addLog.error(`[Migration ${batchId}] Failed to remove TTL:`, error);
    // 不抛出错误，因为这不是致命问题
  }
}

async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  // 迁移配置
  const config = {
    collectionBatchSize: 500,
    collectionConcurrency: 10,
    imageBatchSize: 500,
    imageConcurrency: 5,
    pauseBetweenBatches: 1000 // ms
  };

  // 生成唯一的批次 ID
  const batchId = `migration_${Date.now()}_${randomUUID()}`;
  const migrationVersion = 'v4.14.3';

  addLog.info(`[Migration ${batchId}] Starting migration ${migrationVersion}`);
  addLog.info(
    `[Migration ${batchId}] Config: collectionBatch=${config.collectionBatchSize}, collectionConcurrency=${config.collectionConcurrency}, imageBatch=${config.imageBatchSize}, imageConcurrency=${config.imageConcurrency}`
  );

  // ========== Image Migration ==========
  addLog.info(`[Migration ${batchId}] Starting image migration...`);

  const totalImageFiles = await getDatasetImageGFSCollection().countDocuments({});
  addLog.info(`[Migration ${batchId}] Total image files in GridFS: ${totalImageFiles}`);

  let imageStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0
  };

  // 分批处理 images
  for (let offset = 0; offset < totalImageFiles; offset += config.imageBatchSize) {
    const currentBatch = Math.floor(offset / config.imageBatchSize) + 1;
    const totalBatches = Math.ceil(totalImageFiles / config.imageBatchSize);

    addLog.info(
      `[Migration ${batchId}] Processing images batch ${currentBatch}/${totalBatches} (${offset}-${offset + config.imageBatchSize})`
    );

    const batchStats = await processImageBatch({
      batchId,
      migrationVersion,
      offset,
      limit: config.imageBatchSize,
      concurrency: config.imageConcurrency
    });

    imageStats.processed += batchStats.processed;
    imageStats.succeeded += batchStats.succeeded;
    imageStats.failed += batchStats.failed;
    imageStats.skipped += batchStats.skipped;

    addLog.info(
      `[Migration ${batchId}] Batch ${currentBatch}/${totalBatches} completed. Batch: +${batchStats.succeeded} succeeded, +${batchStats.failed} failed. Total progress: ${imageStats.succeeded}/${totalImageFiles}`
    );

    // 暂停一下
    if (offset + config.imageBatchSize < totalImageFiles) {
      await new Promise((resolve) => setTimeout(resolve, config.pauseBetweenBatches));
    }
  }

  // ========== 批量删除已完成迁移的 TTL ==========
  await removeTTLForCompletedMigrations(batchId);

  // ========== 汇总统计 ==========
  addLog.info(`[Migration ${batchId}] ========== Migration Summary ==========`);

  addLog.info(
    `[Migration ${batchId}] Images - Total: ${totalImageFiles}, Succeeded: ${imageStats.succeeded}, Failed: ${imageStats.failed}, Skipped: ${imageStats.skipped}`
  );
  addLog.info(`[Migration ${batchId}] =======================================`);

  return {
    batchId,
    migrationVersion,
    summary: {
      images: {
        total: totalImageFiles,
        processed: imageStats.processed,
        succeeded: imageStats.succeeded,
        failed: imageStats.failed,
        skipped: imageStats.skipped
      }
    }
  };
}

export default NextAPI(handler);
