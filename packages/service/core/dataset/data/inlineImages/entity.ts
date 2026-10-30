import { addHours } from 'date-fns';
import type { S3TtlSchemaType } from '@fastgpt/global/common/file/s3TTL/type';
import { MongoS3TTL } from '../../../../common/s3/models/ttl';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { MongoDatasetData } from '../schema';
import { MongoDatasetTraining } from '../../training/schema';
import { getDatasetImageReferences, type DatasetImageReferenceContent } from './utils';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { ClientSession } from '../../../../common/mongo';
import { S3Buckets } from '../../../../common/s3/config/constants';

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

    // 原始 key 查询保持既有保守匹配；转义地址再用写入侧解析器确认。
    // 随机文件名只含十六进制字符，Markdown 转义不会改变它，可先缩小候选范围。
    const hasEscapedReference = async () => {
      const filename = file.minioKey.split('/').pop()!.split('.')[0];
      const candidatePattern = new RegExp(filename);
      const fields = [
        { q: candidatePattern },
        { a: candidatePattern },
        { 'indexes.text': candidatePattern }
      ];
      const queries = [
        MongoDatasetData.find({
          teamId,
          datasetId,
          $or: [...fields, { 'history.q': candidatePattern }, { 'history.a': candidatePattern }]
        })
          .select('q a imageId indexes.text history.q history.a')
          .session(session)
          .lean(),
        MongoDatasetTraining.find({ teamId, datasetId, $or: fields })
          .select('q a imageId indexes.text')
          .session(session)
          .lean()
      ];
      for (const query of queries) {
        const cursor = query.cursor({ batchSize: 100 });
        try {
          for await (const candidate of cursor) {
            if (getDatasetImageReferences(candidate).has(file.minioKey)) return true;
          }
        } finally {
          await cursor.close();
        }
      }
      return false;
    };

    if (dataReference || trainingReference || (await hasEscapedReference())) {
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

/**
 * 写入引用时同事务更新图片归属记录，和回收事务竞争同一文档锁。
 * 待删除或已回收的图片不能重新引用；持久记录会在最后一个分块/历史/任务引用消失后回收。
 */
export const persistDatasetDataImages = async ({
  teamId,
  datasetId,
  data,
  session
}: {
  teamId: string;
  datasetId: string;
  data: DatasetImageReferenceContent[];
  session: ClientSession;
}) => {
  const keys = new Set(
    data.flatMap((item) =>
      [...getDatasetImageReferences(item)].filter(
        (key) => getDatasetInlineImageOwner(key) === String(datasetId)
      )
    )
  );
  if (keys.size > 0) {
    const renewed = await MongoS3TTL.updateMany(
      {
        minioKey: { $in: [...keys] },
        bucketName: S3Buckets.private,
        'datasetInlineImage.teamId': teamId,
        'datasetInlineImage.datasetId': datasetId,
        'datasetInlineImage.cleanupPending': { $ne: true }
      },
      { $set: { expiredTime: addHours(new Date(), 3) } },
      { session }
    );
    if (renewed.matchedCount !== keys.size)
      throw new UserError('Inline image is no longer available');
  }
};
