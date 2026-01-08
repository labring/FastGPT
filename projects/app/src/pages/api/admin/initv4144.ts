import { NextAPI } from '@/service/middleware/entry';
import { addLog } from '@fastgpt/service/common/system/log';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { type NextApiRequest, type NextApiResponse } from 'next';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import {
  getDownloadStream,
  getGFSCollection
} from '@fastgpt/service/common/file/gridfs/controller';
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
import { migrateFeedbackFlags } from './initFeedbackFlags';

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

// 将 MongoDB 中 ObjectId 类型的 fileId 转换为字符串
async function convertFileIdToString(batchId: string) {
  addLog.info(`[Migration ${batchId}] Converting ObjectId fileId to String in database...`);

  // 查找所有 fileId 存在且不为 null 的 collection
  const collections = await MongoDatasetCollection.find(
    {
      fileId: { $exists: true, $ne: null }
    },
    '_id fileId'
  ).lean();

  if (collections.length === 0) {
    addLog.info(`[Migration ${batchId}] No collections with fileId found`);
    return { converted: 0 };
  }

  addLog.info(
    `[Migration ${batchId}] Found ${collections.length} collections with fileId, starting conversion...`
  );

  let convertedCount = 0;
  const limit = pLimit(50);

  const tasks = collections.map((collection) =>
    limit(async () => {
      try {
        // 确保 fileId 存在
        if (!collection.fileId) {
          return;
        }

        // 将 ObjectId 转换为字符串
        const fileIdStr = collection.fileId.toString();

        // 更新为字符串类型
        await MongoDatasetCollection.updateOne(
          { _id: collection._id },
          { $set: { fileId: fileIdStr } }
        );

        convertedCount++;
      } catch (error) {
        addLog.error(
          `[Migration ${batchId}] Failed to convert fileId for collection ${collection._id}:`,
          error
        );
      }
    })
  );

  await Promise.all(tasks);

  addLog.info(`[Migration ${batchId}] Converted ${convertedCount} fileId fields to String type`);

  return { converted: convertedCount };
}

// 从 GridFS 上传到 S3
async function migrateDatasetCollection({
  batchId,
  collection
}: {
  batchId: string;
  collection: DatasetCollectionSchemaType;
}) {
  const { fileId, datasetId, name, _id } = collection;
  const collectionId = _id.toString();

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
      const stream = await getDownloadStream({
        bucketName: 'dataset',
        fileId: fileId!
      });
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
                fileSize: buffer.length
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
      key = await getS3DatasetSource().upload({
        buffer,
        datasetId,
        filename: name
      });

      // 立即删除 TTL（uploadDatasetFileByBuffer 会创建 3 小时的 TTL）
      await removeS3TTL({ key, bucketName: 'private' });

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
      collectionId
    };
  } catch (error) {
    addLog.error(`[Migration ${batchId}] Failed to migrate collection ${collectionId}:`, error);
    throw error;
  }
}

// 处理单批 collection
async function processCollectionBatch({
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
  // 1. 获取这一批的 GridFS 文件
  const files = await getGFSCollection('dataset')
    .find(
      {},
      {
        projection: {
          _id: 1,
          metadata: 1
        }
      }
    )
    .sort({ _id: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  if (files.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  // 2. 查找对应的 collections
  const fileIds = files.map((f) => f._id);
  const collections = await MongoDatasetCollection.find(
    {
      teamId: { $in: Array.from(new Set(files.map((f) => f.metadata?.teamId).filter(Boolean))) },
      fileId: { $in: fileIds, $not: { $regex: /^dataset\// } }
    },
    '_id fileId teamId datasetId type parentId name updateTime'
  ).lean();

  if (collections.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  // 3. 过滤已完成的
  const completedMigrations = await MongoDatasetMigrationLog.find(
    {
      resourceType: 'collection',
      resourceId: { $in: collections.map((c) => c._id) },
      status: 'completed'
    },
    'resourceId'
  ).lean();

  const completedIds = new Set(completedMigrations.map((m) => m.resourceId.toString()));
  const pendingCollections = collections.filter((c) => !completedIds.has(c._id.toString()));

  const skippedCount = collections.length - pendingCollections.length;

  if (pendingCollections.length === 0) {
    addLog.info(
      `[Migration ${batchId}] Batch all skipped. Total: ${collections.length}, Skipped: ${skippedCount}`
    );
    return {
      processed: collections.length,
      succeeded: 0,
      failed: 0,
      skipped: skippedCount
    };
  }

  addLog.info(
    `[Migration ${batchId}] Processing ${pendingCollections.length} collections (${skippedCount} skipped)`
  );

  // 4. 创建迁移日志
  const migrationLogs = pendingCollections.map((collection) => ({
    batchId,
    migrationVersion,
    resourceType: 'collection' as const,
    resourceId: collection._id,
    teamId: collection.teamId,
    datasetId: collection.datasetId,
    sourceStorage: {
      type: 'gridfs' as const,
      fileId: collection.fileId,
      bucketName: 'dataset'
    },
    status: 'pending' as const,
    attemptCount: 0,
    maxAttempts: 3,
    verified: false,
    operations: [],
    metadata: {
      fileName: collection.name,
      originalUpdateTime: collection.updateTime,
      nodeEnv: process.env.NODE_ENV
    }
  }));

  if (migrationLogs.length > 0) {
    await MongoDatasetMigrationLog.insertMany(migrationLogs, { ordered: false });
  }

  // 5. 执行迁移（降低并发）
  const limitFn = pLimit(concurrency);
  let succeeded = 0;
  let failed = 0;

  const tasks = pendingCollections.map((collection) =>
    limitFn(async () => {
      try {
        const { key, collectionId } = await migrateDatasetCollection({
          batchId,
          collection
        });
        await updateDatasetCollectionFileId({ batchId, collectionId, key });
        succeeded++;
      } catch (error) {
        failed++;
        addLog.error(
          `[Migration ${batchId}] Failed to migrate collection ${collection._id}:`,
          error
        );
      }
    })
  );

  await Promise.allSettled(tasks);

  return {
    processed: collections.length,
    succeeded,
    failed,
    skipped: skippedCount
  };
}

// 修改 dataset collection 的 fileId 为 S3 的 key
async function updateDatasetCollectionFileId({
  batchId,
  collectionId,
  key
}: {
  batchId: string;
  collectionId: string;
  key: string;
}) {
  const updateStartTime = Date.now();

  try {
    // 更新 collection fileId
    await MongoDatasetCollection.updateOne({ _id: collectionId }, { $set: { fileId: key } });

    // 标记迁移为完成
    await MongoDatasetMigrationLog.updateOne(
      { batchId, resourceId: collectionId },
      {
        $set: {
          status: 'completed',
          completedAt: new Date()
        },
        $push: {
          operations: {
            action: 'update_collection_fileId',
            timestamp: new Date(),
            success: true,
            duration: Date.now() - updateStartTime,
            details: {
              newFileId: key
            }
          }
        }
      }
    );

    return {
      collectionId,
      key
    };
  } catch (error) {
    // 标记迁移为失败
    await MongoDatasetMigrationLog.updateOne(
      { batchId, resourceId: collectionId },
      {
        $set: {
          status: 'failed',
          'error.message': error instanceof Error ? error.message : String(error),
          'error.stack': error instanceof Error ? error.stack : undefined,
          'error.phase': 'update_db'
        }
      }
    );

    addLog.error(`[Migration ${batchId}] Failed to update collection ${collectionId}:`, error);
    throw error;
  }
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
      teamId: { $in: Array.from(new Set(imageFiles.map((file) => file.metadata?.teamId))) },
      datasetId: { $in: Array.from(new Set(imageFiles.map((file) => file.metadata?.datasetId))) },
      collectionId: {
        $in: Array.from(new Set(imageFiles.map((file) => file.metadata?.collectionId)))
      },
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
    resourceType: 'dataset_image' as const,
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
  const migrationVersion = 'v4.14.4';

  addLog.info(`[Migration ${batchId}] Starting migration ${migrationVersion}`);
  addLog.info(
    `[Migration ${batchId}] Config: collectionBatch=${config.collectionBatchSize}, collectionConcurrency=${config.collectionConcurrency}, imageBatch=${config.imageBatchSize}, imageConcurrency=${config.imageConcurrency}`
  );

  // 步骤 0: 将现有数据库中的 ObjectId 类型的 fileId 转换为 String
  const { converted } = await convertFileIdToString(batchId);

  // ========== Collection 迁移 ==========
  const totalCollectionFiles = await getGFSCollection('dataset').countDocuments({
    uploadDate: { $gte: new Date('2025-11-20') }
  });
  addLog.info(`[Migration ${batchId}] Total collection files in GridFS: ${totalCollectionFiles}`);

  let collectionStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0
  };

  // 分批处理 collections
  for (let offset = 0; offset < totalCollectionFiles; offset += config.collectionBatchSize) {
    const currentBatch = Math.floor(offset / config.collectionBatchSize) + 1;
    const totalBatches = Math.ceil(totalCollectionFiles / config.collectionBatchSize);

    addLog.info(
      `[Migration ${batchId}] Processing collections batch ${currentBatch}/${totalBatches} (${offset}-${offset + config.collectionBatchSize})`
    );

    const batchStats = await processCollectionBatch({
      batchId,
      migrationVersion,
      offset,
      limit: config.collectionBatchSize,
      concurrency: config.collectionConcurrency
    });

    collectionStats.processed += batchStats.processed;
    collectionStats.succeeded += batchStats.succeeded;
    collectionStats.failed += batchStats.failed;
    collectionStats.skipped += batchStats.skipped;

    addLog.info(
      `[Migration ${batchId}] Batch ${currentBatch}/${totalBatches} completed. Batch: +${batchStats.succeeded} succeeded, +${batchStats.failed} failed. Total progress: ${collectionStats.succeeded}/${totalCollectionFiles}`
    );

    // 暂停一下
    if (offset + config.collectionBatchSize < totalCollectionFiles) {
      await new Promise((resolve) => setTimeout(resolve, config.pauseBetweenBatches));
    }
  }

  // ========== 批量删除已完成迁移的 TTL ==========
  await removeTTLForCompletedMigrations(batchId);

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
    `[Migration ${batchId}] Collections - Total: ${totalCollectionFiles}, Succeeded: ${collectionStats.succeeded}, Failed: ${collectionStats.failed}, Skipped: ${collectionStats.skipped}`
  );

  addLog.info(`[Migration ${batchId}] Converted fileId: ${converted}`);
  addLog.info(`[Migration ${batchId}] =======================================`);

  // 重新统计每一个 chat 的反馈情况
  migrateFeedbackFlags();

  return {
    batchId,
    migrationVersion,
    summary: {
      convertedFileIdCount: converted,
      collections: {
        total: totalCollectionFiles,
        processed: collectionStats.processed,
        succeeded: collectionStats.succeeded,
        failed: collectionStats.failed,
        skipped: collectionStats.skipped
      },
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
