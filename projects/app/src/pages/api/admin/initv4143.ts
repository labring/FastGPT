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
import { uploadImage2S3Bucket } from '@fastgpt/service/common/s3/utils';
import { addDays } from 'date-fns';
import path from 'path';
import { S3Sources } from '@fastgpt/service/common/s3/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
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
      key = await getS3DatasetSource().uploadDatasetFileByBuffer({
        buffer,
        datasetId,
        filename: name
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
      collectionId
    };
  } catch (error) {
    addLog.error(`[Migration ${batchId}] Failed to migrate collection ${collectionId}:`, error);
    throw error;
  }
}

// 遍历 dataset_collections 中的所有文件，获取 fileId 和 teamId
async function walkDatasetFiles(batchId: string) {
  const files = await getGFSCollection('dataset')
    .find(
      {},
      {
        projection: {
          _id: 1,
          metadata: {
            teamId: 1
          }
        }
      }
    )
    .toArray();

  if (files.length === 0) return { collectionIndexPairs: [], collections: [], skippedCount: 0 };

  const collectionIndexPairs = files.slice(0, 1000).map((file) => ({
    fileId: file._id,
    teamId: file.metadata.teamId as string
  }));

  const collections = await MongoDatasetCollection.find(
    {
      $or: collectionIndexPairs
    },
    '_id fileId teamId datasetId type parentId name updateTime'
  ).lean();

  // 查询迁移日志，找到已经完成的迁移（从检查点恢复）
  const completedMigrations = await MongoDatasetMigrationLog.find(
    {
      resourceType: 'collection',
      status: 'completed'
    },
    'resourceId'
  ).lean();

  const completedResourceIds = new Set(completedMigrations.map((log) => log.resourceId.toString()));

  // 过滤出已经完成的 collection
  const pendingCollections = collections.filter(
    (collection) => !completedResourceIds.has(collection._id.toString())
  );

  const skippedCount = collections.length - pendingCollections.length;

  addLog.info(
    `[Migration ${batchId}] Total collections: ${collections.length}, Skipped: ${skippedCount}, Pending: ${pendingCollections.length}`
  );

  return {
    collectionIndexPairs,
    collections: pendingCollections,
    skippedCount
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

// 将 MongoDB 中 ObjectId 类型的 imageId 转换为字符串
async function convertImageIdToString(batchId: string) {
  addLog.info(`[Migration ${batchId}] Converting ObjectId imageId to String in database...`);

  // 查找所有 imageId 存在且不为 null 的 data
  const dataList = await MongoDatasetData.find(
    {
      imageId: { $exists: true, $ne: null }
    },
    '_id imageId'
  ).lean();

  if (dataList.length === 0) {
    addLog.info(`[Migration ${batchId}] No data with imageId found`);
    return { converted: 0 };
  }

  addLog.info(
    `[Migration ${batchId}] Found ${dataList.length} data with imageId, starting conversion...`
  );

  let convertedCount = 0;
  const limit = pLimit(50);

  const tasks = dataList.map((data) =>
    limit(async () => {
      try {
        // 确保 imageId 存在
        if (!data.imageId) {
          return;
        }

        // 将 ObjectId 转换为字符串
        const imageIdStr = data.imageId.toString();

        // 更新为字符串类型
        await MongoDatasetData.updateOne({ _id: data._id }, { $set: { imageId: imageIdStr } });

        convertedCount++;
      } catch (error) {
        addLog.error(
          `[Migration ${batchId}] Failed to convert imageId for data ${data._id}:`,
          error
        );
      }
    })
  );

  await Promise.all(tasks);

  addLog.info(`[Migration ${batchId}] Converted ${convertedCount} imageId fields to String type`);

  return { converted: convertedCount };
}

// 遍历 dataset_image.files 中的所有图片文件
async function walkDatasetImages(batchId: string) {
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
    .toArray();

  if (imageFiles.length === 0)
    return { imageDataPairs: [], dataList: [], skippedCount: 0, totalImages: 0 };

  addLog.info(`[Migration ${batchId}] Found ${imageFiles.length} images in GridFS`);

  // 获取所有的 imageId
  const imageIds = imageFiles.map((file) => file._id.toString());

  // 在 dataset_datas 中查找对应的记录
  const dataList = await MongoDatasetData.find(
    {
      imageId: { $in: imageIds }
    },
    '_id imageId teamId datasetId collectionId updateTime'
  ).lean();

  addLog.info(`[Migration ${batchId}] Found ${dataList.length} data records with imageId`);

  // 查询迁移日志，找到已经完成的迁移（从检查点恢复）
  const completedMigrations = await MongoDatasetMigrationLog.find(
    {
      resourceType: 'data_image',
      status: 'completed'
    },
    'resourceId'
  ).lean();

  const completedResourceIds = new Set(completedMigrations.map((log) => log.resourceId.toString()));

  // 过滤出已经完成的 data
  const pendingDataList = dataList.filter((data) => !completedResourceIds.has(data._id.toString()));

  const skippedCount = dataList.length - pendingDataList.length;

  addLog.info(
    `[Migration ${batchId}] Total data with images: ${dataList.length}, Skipped: ${skippedCount}, Pending: ${pendingDataList.length}`
  );

  // 创建 imageId 到 file 的映射
  const imageFileMap = new Map(imageFiles.map((file) => [file._id.toString(), file]));

  // 为每个 data 关联对应的 image file
  const imageDataPairs = pendingDataList
    .map((data) => {
      const imageFile = imageFileMap.get(data.imageId!);
      if (!imageFile) {
        addLog.warn(
          `[Migration ${batchId}] Image file not found for imageId: ${data.imageId}, dataId: ${data._id}`
        );
        return null;
      }
      return {
        data,
        imageFile
      };
    })
    .filter((pair) => pair !== null);

  return {
    imageDataPairs,
    dataList: pendingDataList,
    skippedCount,
    totalImages: imageFiles.length
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

      // 构造 S3 key
      const s3Key = [S3Sources.dataset, datasetId, `${getNanoid(6)}-${filename}`].join('/');

      // 使用 uploadImage2S3Bucket 上传图片
      key = await uploadImage2S3Bucket('private', {
        base64Img: buffer.toString('base64'),
        uploadKey: s3Key,
        mimetype,
        filename,
        expiredTime: addDays(new Date(), 7)
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

async function handler(req: NextApiRequest, _res: NextApiResponse) {
  // await authCert({ req, authRoot: true });

  // 生成唯一的批次 ID
  const batchId = `migration_${Date.now()}_${randomUUID()}`;
  const migrationVersion = 'v4.14.3';

  addLog.info(`[Migration ${batchId}] Starting migration ${migrationVersion}`);

  // 步骤 0: 将现有数据库中的 ObjectId 类型的 fileId 转换为 String
  const { converted } = await convertFileIdToString(batchId);

  const failedGridFSToS3: { collectionId: string; reason: string }[] = [];
  const successGridFSToS3: { collectionId: string; key: string }[] = [];

  const { collections, skippedCount } = await walkDatasetFiles(batchId);

  // 创建迁移日志
  if (collections.length > 0) {
    addLog.info(
      `[Migration ${batchId}] Creating migration logs for ${collections.length} collections`
    );

    const migrationLogs = collections.map((collection) => ({
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

    await MongoDatasetMigrationLog.insertMany(migrationLogs, { ordered: false });
    addLog.info(`[Migration ${batchId}] Created ${migrationLogs.length} migration log records`);
  }

  const limitGridFSToS3 = pLimit(20);
  const tasksGridFSToS3 = collections.map((collection) => {
    return limitGridFSToS3(() => migrateDatasetCollection({ batchId, collection }));
  });

  await Promise.allSettled(tasksGridFSToS3).then((results) => {
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        successGridFSToS3.push(result.value);
      } else {
        failedGridFSToS3.push(result.reason);
      }
    });
  });

  const failedUpdateDatasetCollectionFileId: { collectionId: string; reason: string }[] = [];
  const successUpdateDatasetCollectionFileId: { collectionId: string; key: string }[] = [];
  const limitUpdateDatasetCollectionFileId = pLimit(20);
  const tasksUpdateDatasetCollectionFileId = successGridFSToS3.map((item) => {
    return limitUpdateDatasetCollectionFileId(() =>
      updateDatasetCollectionFileId({ batchId, collectionId: item.collectionId, key: item.key })
    );
  });

  await Promise.allSettled(tasksUpdateDatasetCollectionFileId).then((results) => {
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        successUpdateDatasetCollectionFileId.push(result.value);
      } else {
        failedUpdateDatasetCollectionFileId.push(result.reason);
      }
    });
  });

  // ========== Image Migration ==========
  addLog.info(`[Migration ${batchId}] Starting image migration...`);

  // 步骤 1: 将现有数据库中的 ObjectId 类型的 imageId 转换为 String
  const { converted: convertedImageIds } = await convertImageIdToString(batchId);

  const failedImageGridFSToS3: { dataId: string; reason: string }[] = [];
  const successImageGridFSToS3: { dataId: string; key: string }[] = [];

  const {
    imageDataPairs,
    skippedCount: skippedImageCount,
    totalImages
  } = await walkDatasetImages(batchId);

  // 创建迁移日志
  if (imageDataPairs.length > 0) {
    addLog.info(
      `[Migration ${batchId}] Creating migration logs for ${imageDataPairs.length} images`
    );

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

    await MongoDatasetMigrationLog.insertMany(imageMigrationLogs, { ordered: false });
    addLog.info(
      `[Migration ${batchId}] Created ${imageMigrationLogs.length} image migration log records`
    );
  }

  const limitImageGridFSToS3 = pLimit(20);
  const tasksImageGridFSToS3 = imageDataPairs.map(({ data, imageFile }) => {
    return limitImageGridFSToS3(() => migrateDatasetImage({ batchId, data, imageFile }));
  });

  await Promise.allSettled(tasksImageGridFSToS3).then((results) => {
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        successImageGridFSToS3.push(result.value);
      } else {
        failedImageGridFSToS3.push(result.reason);
      }
    });
  });

  const failedUpdateDatasetDataImageId: { dataId: string; reason: string }[] = [];
  const successUpdateDatasetDataImageId: { dataId: string; key: string }[] = [];
  const limitUpdateDatasetDataImageId = pLimit(20);
  const tasksUpdateDatasetDataImageId = successImageGridFSToS3.map((item) => {
    return limitUpdateDatasetDataImageId(() =>
      updateDatasetDataImageId({ batchId, dataId: item.dataId, key: item.key })
    );
  });

  await Promise.allSettled(tasksUpdateDatasetDataImageId).then((results) => {
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        successUpdateDatasetDataImageId.push(result.value);
      } else {
        failedUpdateDatasetDataImageId.push(result.reason);
      }
    });
  });

  // 聚合迁移日志的统计信息
  const migrationStats = await MongoDatasetMigrationLog.aggregate([
    { $match: { batchId } },
    {
      $group: {
        _id: '$resourceType',
        statuses: {
          $push: '$status'
        }
      }
    }
  ]);

  const collectionStats = {
    completed: 0,
    failed: 0,
    processing: 0,
    pending: 0
  };
  const imageStats = {
    completed: 0,
    failed: 0,
    processing: 0,
    pending: 0
  };

  migrationStats.forEach((stat) => {
    const statusCount = stat.statuses.reduce((acc: Record<string, number>, status: string) => {
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    if (stat._id === 'collection') {
      collectionStats.completed = statusCount['completed'] || 0;
      collectionStats.failed = statusCount['failed'] || 0;
      collectionStats.processing = statusCount['processing'] || 0;
      collectionStats.pending = statusCount['pending'] || 0;
    } else if (stat._id === 'data_image') {
      imageStats.completed = statusCount['completed'] || 0;
      imageStats.failed = statusCount['failed'] || 0;
      imageStats.processing = statusCount['processing'] || 0;
      imageStats.pending = statusCount['pending'] || 0;
    }
  });

  const totalCollections = collections.length;
  const totalDataImages = imageDataPairs.length;

  addLog.info(
    `[Migration ${batchId}] Migration completed. Collections - Total: ${totalCollections}, Completed: ${collectionStats.completed}, Failed: ${collectionStats.failed}, Skipped: ${skippedCount}`
  );
  addLog.info(
    `[Migration ${batchId}] Migration completed. Images - Total: ${totalDataImages}, Completed: ${imageStats.completed}, Failed: ${imageStats.failed}, Skipped: ${skippedImageCount}`
  );

  return {
    batchId,
    migrationVersion,
    summary: {
      convertedFileIdCount: converted,
      convertedImageIdCount: convertedImageIds,
      collections: {
        total: totalCollections,
        skipped: skippedCount,
        completed: collectionStats.completed,
        failed: collectionStats.failed,
        processing: collectionStats.processing,
        pending: collectionStats.pending
      },
      images: {
        totalInGridFS: totalImages,
        total: totalDataImages,
        skipped: skippedImageCount,
        completed: imageStats.completed,
        failed: imageStats.failed,
        processing: imageStats.processing,
        pending: imageStats.pending
      }
    },
    details: {
      failedGridFSToS3: failedGridFSToS3.map((f) => ({
        collectionId: f.collectionId,
        error: f.reason
      })),
      failedUpdateFileId: failedUpdateDatasetCollectionFileId.map((f) => ({
        collectionId: f.collectionId,
        error: f.reason
      })),
      failedImageGridFSToS3: failedImageGridFSToS3.map((f) => ({
        dataId: f.dataId,
        error: f.reason
      })),
      failedUpdateImageId: failedUpdateDatasetDataImageId.map((f) => ({
        dataId: f.dataId,
        error: f.reason
      }))
    }
  };
}

export default NextAPI(handler);
