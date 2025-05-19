import { Types } from 'mongoose';
import { MongoDatasetImage } from './schema';
import { DatasetImageSchemaType } from '@fastgpt/global/core/dataset/image/type.d';
import { ClientSession } from 'mongoose';
import { formatId } from '../../../common/string/format';

/**
 * 创建数据集图片
 */
export async function createDatasetImage({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  binary,
  metadata = {},
  expiredTime,
  session
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId?: string;
  binary: Buffer;
  metadata?: DatasetImageSchemaType['metadata'];
  expiredTime?: Date;
  session?: ClientSession;
}) {
  const _id = new Types.ObjectId();

  await MongoDatasetImage.create(
    [
      {
        _id,
        teamId,
        tmbId,
        datasetId,
        collectionId,
        binary,
        metadata,
        expiredTime
      }
    ],
    { session }
  );

  return { _id: _id.toString() };
}

/**
 * 获取数据集图片
 */
export async function getDatasetImageById(id: string, session?: ClientSession) {
  const formatId = id;
  const data = await MongoDatasetImage.findById(formatId, undefined, {
    session
  });

  if (!data) return null;

  return {
    ...data.toObject(),
    _id: data._id.toString()
  };
}

/**
 * 根据文档ID获取关联图片
 */
export async function getDatasetImagesByDocId({
  teamId,
  relatedDocId,
  limit = 100
}: {
  teamId: string;
  relatedDocId: string;
  limit?: number;
}) {
  const images = await MongoDatasetImage.find(
    {
      teamId,
      'metadata.relatedDocId': relatedDocId
    },
    { binary: 0 }
  )
    .limit(limit)
    .lean();

  return images.map((image) => ({
    ...image,
    _id: image._id.toString()
  }));
}

/**
 * 根据集合ID获取图片
 */
export async function getDatasetImagesByCollectionId({
  teamId,
  datasetId,
  collectionId,
  limit = 100
}: {
  teamId: string;
  datasetId: string;
  collectionId: string;
  limit?: number;
}) {
  const images = await MongoDatasetImage.find({ teamId, datasetId, collectionId }, { binary: 0 })
    .limit(limit)
    .lean();

  return images.map((image) => ({
    ...image,
    _id: image._id.toString()
  }));
}

/**
 * 删除数据集图片
 */
export async function deleteDatasetImageById(id: string, session?: ClientSession) {
  return MongoDatasetImage.findByIdAndDelete(id, { session });
}

/**
 * 根据集合ID删除所有图片
 */
export async function deleteDatasetImagesByCollectionId({
  teamId,
  datasetId,
  collectionId,
  session
}: {
  teamId: string;
  datasetId: string;
  collectionId: string;
  session?: ClientSession;
}) {
  return MongoDatasetImage.deleteMany({ teamId, datasetId, collectionId }, { session });
}

/**
 * 根据数据集ID删除所有图片
 */
export async function deleteDatasetImagesByDatasetId({
  teamId,
  datasetId,
  session
}: {
  teamId: string;
  datasetId: string;
  session?: ClientSession;
}) {
  return MongoDatasetImage.deleteMany({ teamId, datasetId }, { session });
}

/**
 * 更新图片信息（不包括二进制数据）
 */
export async function updateDatasetImageMetadata({
  id,
  metadata,
  session
}: {
  id: string;
  metadata: Partial<DatasetImageSchemaType['metadata']>;
  session?: ClientSession;
}) {
  return MongoDatasetImage.findByIdAndUpdate(
    id,
    {
      $set: {
        metadata: metadata,
        updateTime: new Date()
      }
    },
    { session }
  );
}
