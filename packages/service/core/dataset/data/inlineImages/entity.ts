import { addHours } from 'date-fns';
import type { S3TtlSchemaType } from '@fastgpt/global/common/file/s3TTL/type';
import { MongoS3TTL } from '../../../../common/s3/models/ttl';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { MongoDatasetData } from '../schema';
import { MongoDatasetTraining } from '../../training/schema';

/** 专用命名空间标识本功能管理的对象，不能把普通数据集文件纳入引用回收。 */
export const getDatasetInlineImageOwner = (key: string) =>
  /^dataset\/([a-f0-9]{24})\/inline-images\/file\/[a-f0-9]{32}(?:\.[a-z0-9._+-]+)?$/.exec(key)?.[1];

/**
 * 到期后在事务内锁住归属记录并检查引用。分块、历史和训练任务任一仍有引用便续期；
 * 无引用时标记待删除，后续写入不能再获取该图片，避免排队删除期间被重新引用。
 */
export const claimDatasetInlineImageCleanup = async (file: S3TtlSchemaType) => {
  const datasetId = getDatasetInlineImageOwner(file.minioKey);
  const teamId = file.datasetInlineImage?.teamId;
  if (!teamId || !datasetId || datasetId !== String(file.datasetInlineImage?.datasetId)) {
    throw new Error('Invalid dataset inline image ownership');
  }

  return mongoSessionRun(async (session) => {
    const claimed = await MongoS3TTL.findOneAndUpdate(
      { _id: file._id, expiredTime: { $eq: file.expiredTime, $lte: new Date() } },
      { $set: { 'datasetInlineImage.cleanupPending': true } },
      { new: true, session }
    ).lean();
    if (!claimed) return false;

    // 子串匹配采取保守策略：正文或历史仍提及 key 时不物理删除。
    const pattern = new RegExp(file.minioKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const textReferences = [
      { q: pattern },
      { a: pattern },
      { imageId: file.minioKey },
      { 'indexes.text': pattern }
    ];
    const dataReference = await MongoDatasetData.exists({
      teamId,
      datasetId,
      $or: [...textReferences, { 'history.q': pattern }, { 'history.a': pattern }]
    }).session(session);
    const trainingReference = dataReference
      ? undefined
      : await MongoDatasetTraining.exists({ teamId, datasetId, $or: textReferences }).session(
          session
        );

    if (dataReference || trainingReference) {
      await MongoS3TTL.updateOne(
        { _id: file._id },
        {
          $set: { expiredTime: addHours(new Date(), 3), 'datasetInlineImage.cleanupPending': false }
        },
        { session }
      );
      return false;
    }
    return true;
  });
};

/** 删除 worker 只接受已取得回收权的内嵌图片；普通对象继续沿用原删除语义。 */
export const filterDeletableDatasetInlineImages = async ({
  bucketName,
  keys
}: {
  bucketName: string;
  keys: string[];
}) => {
  const managedKeys = keys.filter((key) => getDatasetInlineImageOwner(key));
  if (managedKeys.length === 0) return keys;
  const owned = await MongoS3TTL.find({
    bucketName,
    minioKey: { $in: managedKeys },
    'datasetInlineImage.cleanupPending': true
  }).lean();
  const deletable = new Set(
    owned
      .filter(
        (file) =>
          getDatasetInlineImageOwner(file.minioKey) === String(file.datasetInlineImage?.datasetId)
      )
      .map((file) => file.minioKey)
  );
  return keys.filter((key) => !getDatasetInlineImageOwner(key) || deletable.has(key));
};

/** 物理删除成功后才移除归属记录；失败保留待删除状态，成功后的重复任务由筛选器拦截。 */
export const completeDatasetInlineImageCleanup = async ({
  bucketName,
  keys
}: {
  bucketName: string;
  keys: string[];
}) => {
  const managedKeys = keys.filter((key) => getDatasetInlineImageOwner(key));
  if (managedKeys.length === 0) return;
  await MongoS3TTL.deleteMany({
    bucketName,
    minioKey: { $in: managedKeys },
    'datasetInlineImage.cleanupPending': true
  });
};
