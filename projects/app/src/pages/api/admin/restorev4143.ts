import { NextAPI } from '@/service/middleware/entry';
import { addLog } from '@fastgpt/service/common/system/log';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { type NextApiRequest, type NextApiResponse } from 'next';
import { getGFSCollection } from '@fastgpt/service/common/file/gridfs/controller';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import pLimit from 'p-limit';
import { connectionMongo } from '@fastgpt/service/common/mongo';

/**
 * 此脚本用于恢复被错误更新为 S3 key 的 fileId/imageId
 *
 * 使用场景：
 * - 迁移后 fileId 被改成了 S3 key
 * - 但 S3 上的文件丢失了
 * - GridFS 数据还在
 *
 * 恢复逻辑：
 * 1. 遍历所有 fileId 以 "dataset/" 开头的 collection（这些是已迁移但 S3 丢失的）
 * 2. 从 S3 key 中提取 datasetId 和文件名
 * 3. 在 GridFS 中查找匹配的文件
 * 4. 恢复 fileId 为原始的 GridFS ObjectId
 */

// 获取 dataset_image 的 GridFS collection
function getDatasetImageGFSCollection() {
  return connectionMongo.connection.db!.collection('dataset_image.files');
}

// 从 S3 key 中提取 datasetId 和文件名
function parseS3Key(
  s3Key: string
): { datasetId: string; filename: string; randomPrefix: string } | null {
  // 格式: dataset/{datasetId}/{随机6位}-{原始文件名}.{ext}
  // 例如: dataset/68ae7b36920ed6e0bcc015b3/fq2mqG-开发.txt
  const match = s3Key.match(/^dataset\/([^/]+)\/(.+)$/);
  if (!match) return null;

  const [, datasetId, rawFilename] = match;

  // 去掉随机前缀 (开头的 xxxxxx-)
  // 例如: "fq2mqG-开发.txt" -> "开发.txt"
  const prefixMatch = rawFilename.match(/^([a-zA-Z0-9]{6})-(.+)$/);
  if (prefixMatch) {
    const [, randomPrefix, originalFilename] = prefixMatch;
    return {
      datasetId,
      filename: originalFilename,
      randomPrefix
    };
  }

  return { datasetId, filename: rawFilename, randomPrefix: '' };
}

// 恢复 dataset_collections 的 fileId
async function restoreCollectionFileIds() {
  addLog.info('[Restore] Starting to restore collection fileIds...');

  // 1. 查找所有 fileId 以 "dataset/" 开头的 collection
  const migratedCollections = await MongoDatasetCollection.find(
    {
      fileId: { $regex: /^dataset\// }
    },
    '_id fileId teamId datasetId name'
  ).lean();

  addLog.info(`[Restore] Found ${migratedCollections.length} collections with S3 key fileId`);

  if (migratedCollections.length === 0) {
    return { total: 0, restored: 0, failed: 0, gridFSSample: [] };
  }

  // 2. 获取所有相关的 GridFS 文件
  const teamIds = [...new Set(migratedCollections.map((c) => c.teamId.toString()))];

  const gridFSFiles = await getGFSCollection('dataset')
    .find({
      'metadata.teamId': { $in: teamIds }
    })
    .toArray();

  addLog.info(`[Restore] Found ${gridFSFiles.length} files in GridFS`);

  // 记录一些 GridFS 文件样本，用于调试
  const gridFSSample = gridFSFiles.slice(0, 5).map((f) => ({
    _id: f._id.toString(),
    filename: f.filename,
    metadata: f.metadata,
    uploadDate: f.uploadDate
  }));

  // 3. 创建多个 GridFS 文件映射，支持多种匹配策略
  // 策略1: teamId + filename
  const gridFSMapByFilename = new Map<string, { fileId: string; uploadDate: Date }[]>();
  // 策略2: teamId + datasetId（如果 metadata 中有的话）
  const gridFSMapByDatasetId = new Map<
    string,
    { fileId: string; uploadDate: Date; filename: string }[]
  >();

  for (const file of gridFSFiles) {
    const teamId = file.metadata?.teamId?.toString();
    const datasetId = file.metadata?.datasetId?.toString();
    const filename = file.filename;
    if (!teamId) continue;

    // 按 filename 索引
    if (filename) {
      const key = `${teamId}_${filename}`;
      const existing = gridFSMapByFilename.get(key) || [];
      existing.push({
        fileId: file._id.toString(),
        uploadDate: file.uploadDate
      });
      gridFSMapByFilename.set(key, existing);
    }

    // 按 datasetId 索引（如果有）
    if (datasetId) {
      const key = `${teamId}_${datasetId}`;
      const existing = gridFSMapByDatasetId.get(key) || [];
      existing.push({
        fileId: file._id.toString(),
        uploadDate: file.uploadDate,
        filename: filename || ''
      });
      gridFSMapByDatasetId.set(key, existing);
    }
  }

  // 4. 恢复每个 collection 的 fileId
  const limit = pLimit(50);
  let restored = 0;
  let failed = 0;
  const failedItems: Array<{
    collectionId: string;
    reason: string;
    s3Key?: string;
    collectionName?: string;
  }> = [];

  const tasks = migratedCollections.map((collection) =>
    limit(async () => {
      try {
        const parsed = parseS3Key(collection.fileId!);
        if (!parsed) {
          failedItems.push({
            collectionId: collection._id.toString(),
            reason: `Invalid S3 key format: ${collection.fileId}`,
            s3Key: collection.fileId
          });
          failed++;
          return;
        }

        const teamId = collection.teamId.toString();
        let gridFSFileId: string | null = null;

        // 策略1: 使用 teamId + collection.name 匹配
        const key1 = `${teamId}_${collection.name}`;
        const candidates1 = gridFSMapByFilename.get(key1);
        if (candidates1 && candidates1.length > 0) {
          gridFSFileId = candidates1.sort(
            (a, b) => b.uploadDate.getTime() - a.uploadDate.getTime()
          )[0].fileId;
        }

        // 策略2: 使用 teamId + 解析出的原始文件名匹配
        if (!gridFSFileId) {
          const key2 = `${teamId}_${parsed.filename}`;
          const candidates2 = gridFSMapByFilename.get(key2);
          if (candidates2 && candidates2.length > 0) {
            gridFSFileId = candidates2.sort(
              (a, b) => b.uploadDate.getTime() - a.uploadDate.getTime()
            )[0].fileId;
          }
        }

        // 策略3: 如果 GridFS 有 datasetId metadata，使用 teamId + datasetId + 文件名匹配
        if (!gridFSFileId) {
          const key3 = `${teamId}_${parsed.datasetId}`;
          const candidates3 = gridFSMapByDatasetId.get(key3);
          if (candidates3 && candidates3.length > 0) {
            // 在同一个 dataset 下，尝试匹配文件名
            const matchingFile = candidates3.find(
              (c) =>
                c.filename === collection.name ||
                c.filename === parsed.filename ||
                c.filename.includes(collection.name) ||
                collection.name.includes(c.filename)
            );
            if (matchingFile) {
              gridFSFileId = matchingFile.fileId;
            } else if (candidates3.length === 1) {
              // 如果只有一个文件，直接使用
              gridFSFileId = candidates3[0].fileId;
            }
          }
        }

        if (!gridFSFileId) {
          failedItems.push({
            collectionId: collection._id.toString(),
            reason: `No matching GridFS file found`,
            s3Key: collection.fileId,
            collectionName: collection.name
          });
          failed++;
          return;
        }

        await MongoDatasetCollection.updateOne(
          { _id: collection._id },
          { $set: { fileId: gridFSFileId } }
        );
        restored++;
      } catch (error) {
        failedItems.push({
          collectionId: collection._id.toString(),
          reason: error instanceof Error ? error.message : String(error),
          s3Key: collection.fileId
        });
        failed++;
      }
    })
  );

  await Promise.all(tasks);

  addLog.info(
    `[Restore] Collection fileId restore completed. Total: ${migratedCollections.length}, Restored: ${restored}, Failed: ${failed}`
  );

  if (failedItems.length > 0 && failedItems.length <= 20) {
    addLog.warn('[Restore] Failed items:', failedItems);
  }

  return {
    total: migratedCollections.length,
    restored,
    failed,
    failedItems: failedItems.slice(0, 50), // 只返回前 50 个失败项
    gridFSSample // 返回 GridFS 文件样本，帮助调试
  };
}

// 恢复 dataset_datas 的 imageId
async function restoreDataImageIds() {
  addLog.info('[Restore] Starting to restore data imageIds...');

  // 1. 查找所有 imageId 以 "dataset/" 开头的 data
  const migratedData = await MongoDatasetData.find(
    {
      imageId: { $regex: /^dataset\// }
    },
    '_id imageId teamId datasetId collectionId'
  ).lean();

  addLog.info(`[Restore] Found ${migratedData.length} data with S3 key imageId`);

  if (migratedData.length === 0) {
    return { total: 0, restored: 0, failed: 0 };
  }

  // 2. 获取所有相关的 GridFS 图片文件
  const teamIds = [...new Set(migratedData.map((d) => d.teamId.toString()))];
  const datasetIds = [...new Set(migratedData.map((d) => d.datasetId.toString()))];
  const collectionIds = [...new Set(migratedData.map((d) => d.collectionId.toString()))];

  const gridFSImages = await getDatasetImageGFSCollection()
    .find({
      'metadata.teamId': { $in: teamIds },
      'metadata.datasetId': { $in: datasetIds },
      'metadata.collectionId': { $in: collectionIds }
    })
    .toArray();

  addLog.info(`[Restore] Found ${gridFSImages.length} images in GridFS`);

  // 3. 创建 GridFS 图片映射 (collectionId + filename -> imageId)
  const gridFSImageMap = new Map<string, { imageId: string; uploadDate: Date }[]>();

  for (const image of gridFSImages) {
    const collectionId = image.metadata?.collectionId?.toString();
    const filename = image.filename;
    if (!collectionId || !filename) continue;

    const key = `${collectionId}_${filename}`;
    const existing = gridFSImageMap.get(key) || [];
    existing.push({
      imageId: image._id.toString(),
      uploadDate: image.uploadDate
    });
    gridFSImageMap.set(key, existing);
  }

  // 4. 恢复每个 data 的 imageId
  const limit = pLimit(50);
  let restored = 0;
  let failed = 0;
  const failedItems: Array<{ dataId: string; reason: string }> = [];

  const tasks = migratedData.map((data) =>
    limit(async () => {
      try {
        const parsed = parseS3Key(data.imageId!);
        if (!parsed) {
          failedItems.push({
            dataId: data._id.toString(),
            reason: `Invalid S3 key format: ${data.imageId}`
          });
          failed++;
          return;
        }

        // 遍历所有可能的匹配
        const collectionId = data.collectionId.toString();
        let foundImageId: string | null = null;

        // 遍历所有以 collectionId 开头的 key
        for (const [mapKey, candidates] of gridFSImageMap.entries()) {
          if (mapKey.startsWith(`${collectionId}_`)) {
            // 检查文件名是否匹配（忽略随机后缀）
            const mapFilename = mapKey.replace(`${collectionId}_`, '');
            const baseFilename = parsed.filename.replace(/_[a-zA-Z0-9]{6}(\.[^.]+)?$/, '$1');

            if (
              mapFilename === parsed.filename ||
              mapFilename === baseFilename ||
              mapFilename.replace(/\.[^.]+$/, '') === parsed.filename.replace(/\.[^.]+$/, '')
            ) {
              foundImageId = candidates.sort(
                (a, b) => b.uploadDate.getTime() - a.uploadDate.getTime()
              )[0].imageId;
              break;
            }
          }
        }

        if (!foundImageId) {
          failedItems.push({
            dataId: data._id.toString(),
            reason: `No matching GridFS image found`
          });
          failed++;
          return;
        }

        await MongoDatasetData.updateOne({ _id: data._id }, { $set: { imageId: foundImageId } });
        restored++;
      } catch (error) {
        failedItems.push({
          dataId: data._id.toString(),
          reason: error instanceof Error ? error.message : String(error)
        });
        failed++;
      }
    })
  );

  await Promise.all(tasks);

  addLog.info(
    `[Restore] Data imageId restore completed. Total: ${migratedData.length}, Restored: ${restored}, Failed: ${failed}`
  );

  return {
    total: migratedData.length,
    restored,
    failed,
    failedItems: failedItems.slice(0, 50)
  };
}

async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  addLog.info('[Restore] Starting fileId/imageId restore from GridFS...');

  // 预检查
  const gridFSFileCount = await getGFSCollection('dataset').countDocuments({});
  const gridFSImageCount = await getDatasetImageGFSCollection().countDocuments({});

  addLog.info(`[Restore] GridFS files: ${gridFSFileCount}, images: ${gridFSImageCount}`);

  if (gridFSFileCount === 0 && gridFSImageCount === 0) {
    return {
      error: 'GridFS data not found. Cannot restore without GridFS data.',
      gridFSFileCount,
      gridFSImageCount
    };
  }

  // 执行恢复
  const collectionResult = await restoreCollectionFileIds();
  const imageResult = await restoreDataImageIds();

  return {
    gridFS: {
      files: gridFSFileCount,
      images: gridFSImageCount
    },
    collections: collectionResult,
    images: imageResult,
    message:
      'Restore completed. After verification, you can re-run the migration script (initv4143 or initv4144).'
  };
}

export default NextAPI(handler);

export {
  getDatasetImageGFSCollection,
  parseS3Key,
  restoreCollectionFileIds,
  restoreDataImageIds,
  handler
};
