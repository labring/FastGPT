import { insertData2Dataset, updateData2Dataset } from '@/service/core/dataset/data/controller';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  deleteDatasetDataVector,
  insertDatasetDataPrecomputedVector,
  insertDatasetDataVector
} from '@fastgpt/service/common/vectorDB/controller';
import { getEmbeddingModel, isImageEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getMaxIndexSize } from '@fastgpt/global/core/dataset/training/utils';
import type {
  DatasetDataSchemaType,
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { delay } from '@fastgpt/service/common/bullmq';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { getVectorsByImage } from '@fastgpt/service/core/ai/embedding';
import { normalizeImageToBase64 } from '@fastgpt/service/core/ai/image';

const logger = getLogger(LogCategories.MODULE.DATASET.EMBEDDING);

const reduceQueue = () => {
  global.vectorQueueLen = global.vectorQueueLen > 0 ? global.vectorQueueLen - 1 : 0;

  return global.vectorQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModel: string; vlmModel?: string };
  collection: { name: string; indexPrefixTitle: boolean; imageIndex?: boolean };
  data: {
    _id: string;
    q: string;
    a?: string;
    imageId?: string;
    indexes: DatasetDataSchemaType['indexes'];
  };
};
type TrainingDataType = DatasetTrainingSchemaType & PopulateType;

const matchMarkdownImageUrls = (text = '') => {
  const regex = /!\[([\s\S]*?)\]\((.*?)\)/g;
  return Array.from(text.matchAll(regex))
    .map((match) => match[2])
    .filter(Boolean);
};

const getRebuildBaseIndexes = (trainingData: TrainingDataType) => {
  const sourceIndexes = trainingData.indexes?.length
    ? trainingData.indexes.map((index) => ({ ...index, dataId: '' }))
    : trainingData.data.indexes;

  return sourceIndexes.filter((index) => {
    if (index.type === DatasetDataIndexTypeEnum.imageEmbedding) return false;
    if (
      index.type === DatasetDataIndexTypeEnum.image &&
      (!trainingData.dataset.vlmModel || !trainingData.collection.imageIndex)
    ) {
      return false;
    }
    return true;
  });
};

const appendImageEmbeddingIndexes = ({
  indexes,
  trainingData,
  embModel,
  q
}: {
  indexes: ReturnType<typeof getRebuildBaseIndexes>;
  trainingData: TrainingDataType;
  embModel: ReturnType<typeof getEmbeddingModel>;
  q: string;
}) => {
  if (!isImageEmbeddingModel(embModel)) return indexes;

  const imageIds = [
    trainingData.data.imageId,
    ...(trainingData.collection.imageIndex ? matchMarkdownImageUrls(q) : [])
  ].filter(Boolean) as string[];

  const uniqueImageIds = imageIds.filter((item, index, self) => index === self.indexOf(item));

  return indexes.concat(
    uniqueImageIds.map((imageId) => ({
      type: DatasetDataIndexTypeEnum.imageEmbedding,
      text: imageId,
      dataId: ''
    }))
  );
};

/* 索引生成队列。每导入一次，就是一个单独的线程 */
export async function generateVector(): Promise<any> {
  const max = global.systemEnv?.vectorMaxProcess || 10;
  logger.debug('Vector queue size check', { queueSize: global.vectorQueueLen, max });

  if (global.vectorQueueLen >= max) return;
  global.vectorQueueLen++;

  try {
    while (true) {
      const start = Date.now();

      // get training data
      const {
        data,
        done = false,
        error = false
      } = await (async () => {
        try {
          const data = await MongoDatasetTraining.findOneAndUpdate(
            {
              mode: TrainingModeEnum.chunk,
              retryCount: { $gt: 0 },
              lockTime: { $lte: addMinutes(new Date(), -3) }
            },
            {
              lockTime: new Date(),
              $inc: { retryCount: -1 }
            }
          )
            .populate<PopulateType>([
              {
                path: 'dataset',
                select: 'vectorModel vlmModel'
              },
              {
                path: 'collection',
                select: 'name indexPrefixTitle imageIndex'
              },
              {
                path: 'data',
                select: '_id q a imageId indexes'
              }
            ])
            .lean();

          // task preemption
          if (!data) {
            return {
              done: true
            };
          }
          return {
            data
          };
        } catch (error) {
          return {
            error: true
          };
        }
      })();

      // Break loop
      if (done || !data) {
        break;
      }
      if (error) {
        logger.error('Vector queue fetch task failed', { error });
        await delay(500);
        continue;
      }

      if (!data.dataset || !data.collection) {
        logger.info('Vector queue task skipped: dataset or collection missing', {
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          trainingId: data._id
        });
        // Delete data
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }

      // auth balance
      if (!(await checkTeamAiPointsAndLock(data.teamId))) {
        continue;
      }

      logger.info('Vector queue task started', {
        trainingId: data._id,
        datasetId: data.datasetId,
        collectionId: data.collectionId,
        teamId: data.teamId,
        tmbId: data.tmbId,
        dataId: data.dataId
      });

      try {
        const { tokens } = await (async () => {
          if (data.dataId) {
            return rebuildData({ trainingData: data });
          } else {
            return insertData({ trainingData: data });
          }
        })();

        // push usage
        pushGenerateVectorUsage({
          teamId: data.teamId,
          tmbId: data.tmbId,
          inputTokens: tokens,
          model: data.dataset.vectorModel,
          usageId: data.billId
        });

        logger.info('Vector queue task finished', {
          durationMs: Date.now() - start,
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          dataId: data.dataId
        });
      } catch (err: any) {
        logger.error('Vector queue task failed', {
          error: err,
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          dataId: data.dataId
        });
        await MongoDatasetTraining.updateOne(
          {
            _id: data._id
          },
          {
            errorMsg: getErrText(err, 'unknown error')
          }
        );
        await delay(100);
      }
    }
  } catch (error) {
    logger.error('Vector queue loop failed', { error });
  }

  if (reduceQueue()) {
    logger.info('Vector queue drained', { queueSize: global.vectorQueueLen });
  }
  logger.debug('Vector queue loop exit', { queueSize: global.vectorQueueLen });
}

const rebuildData = async ({ trainingData }: { trainingData: TrainingDataType }) => {
  if (!trainingData.data) {
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id });
    return Promise.reject('Not data');
  }

  // Old vectorId
  const deleteVectorIdList = trainingData.data.indexes.map((index) => index.dataId);

  // Find next rebuilding data to insert training queue
  try {
    await retryFn(() =>
      mongoSessionRun(async (session) => {
        // get new mongoData insert to training
        const newRebuildingData = await MongoDatasetData.findOneAndUpdate(
          {
            rebuilding: true,
            teamId: trainingData.teamId,
            datasetId: trainingData.datasetId
          },
          {
            $unset: {
              rebuilding: null
            },
            updateTime: new Date()
          },
          { session }
        ).select({
          _id: 1,
          collectionId: 1,
          q: 1,
          imageId: 1,
          indexes: 1
        });

        if (newRebuildingData) {
          const collection = await MongoDatasetCollection.findById(newRebuildingData.collectionId)
            .select('imageIndex')
            .session(session);
          const hasMarkdownImages =
            !!collection?.imageIndex && matchMarkdownImageUrls(newRebuildingData.q).length > 0;
          const mode = (() => {
            if (trainingData.dataset.vlmModel && newRebuildingData.imageId) {
              return TrainingModeEnum.imageParse;
            }
            if (trainingData.dataset.vlmModel && hasMarkdownImages) {
              return TrainingModeEnum.image;
            }
            return TrainingModeEnum.chunk;
          })();

          await MongoDatasetTraining.create(
            [
              {
                teamId: trainingData.teamId,
                tmbId: trainingData.tmbId,
                datasetId: trainingData.datasetId,
                collectionId: newRebuildingData.collectionId,
                billId: trainingData.billId,
                mode,
                model:
                  (mode === TrainingModeEnum.imageParse || mode === TrainingModeEnum.image) &&
                  trainingData.dataset.vlmModel
                    ? trainingData.dataset.vlmModel
                    : trainingData.dataset.vectorModel,
                dataId: newRebuildingData._id,
                ...(newRebuildingData.imageId && { imageId: newRebuildingData.imageId }),
                ...(mode === TrainingModeEnum.image && {
                  q: newRebuildingData.q,
                  indexes: newRebuildingData.indexes
                }),
                retryCount: 50
              }
            ],
            { session, ordered: true }
          );
        }
      })
    );
  } catch (error) {}

  const embModel = getEmbeddingModel(trainingData.dataset.vectorModel);
  const q = trainingData.q || trainingData.data.q;
  const a = trainingData.a ?? trainingData.data.a;
  const rebuildIndexes = appendImageEmbeddingIndexes({
    indexes: getRebuildBaseIndexes(trainingData),
    trainingData,
    embModel,
    q
  });

  const hasPreprocessedTrainingData =
    !!trainingData.q || !!trainingData.imageDescMap || !!trainingData.indexes?.length;

  if (hasPreprocessedTrainingData) {
    const { tokens } = await updateData2Dataset({
      dataId: trainingData.data._id,
      q,
      a,
      indexes: rebuildIndexes,
      model: trainingData.dataset.vectorModel,
      indexSize:
        trainingData.indexSize ||
        getMaxIndexSize(getEmbeddingModel(trainingData.dataset.vectorModel)),
      indexPrefix: trainingData.collection.indexPrefixTitle
        ? `# ${trainingData.collection.name}`
        : undefined
    });

    await mongoSessionRun(async (session) => {
      if (trainingData.imageDescMap) {
        await MongoDatasetData.updateOne(
          { _id: trainingData.data._id },
          { $set: { imageDescMap: trainingData.imageDescMap } },
          { session }
        );
      }
      await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });
    });

    return { tokens };
  }

  const textIndexes = rebuildIndexes.filter(
    (index) => index.type !== DatasetDataIndexTypeEnum.imageEmbedding
  );
  const imageIndexes = rebuildIndexes.filter(
    (index) => index.type === DatasetDataIndexTypeEnum.imageEmbedding
  );

  const textInsertResult = textIndexes.length
    ? await insertDatasetDataVector({
        inputs: textIndexes.map((index) => index.text),
        model: embModel,
        teamId: trainingData.teamId,
        datasetId: trainingData.datasetId,
        collectionId: trainingData.collectionId
      })
    : { tokens: 0, insertIds: [] as string[] };

  textIndexes.forEach((item, index) => {
    item.dataId = textInsertResult.insertIds[index];
  });

  const imageInsertResult = await (async () => {
    if (!imageIndexes.length) {
      return {
        tokens: 0,
        insertIds: [] as string[]
      };
    }

    const { vectors, tokens } = await getVectorsByImage({
      model: embModel,
      imageUrls: await Promise.all(imageIndexes.map((index) => normalizeImageToBase64(index.text))),
      type: 'db'
    });

    return insertDatasetDataPrecomputedVector({
      vectors,
      teamId: trainingData.teamId,
      datasetId: trainingData.datasetId,
      collectionId: trainingData.collectionId
    }).then((res) => ({
      ...res,
      tokens
    }));
  })();

  imageIndexes.forEach((item, index) => {
    item.dataId = imageInsertResult.insertIds[index];
  });

  await mongoSessionRun(async (session) => {
    // 2. Ensure that the training data is deleted after the Mongo update is successful
    await MongoDatasetData.updateOne(
      { _id: trainingData.data._id },
      {
        $set: {
          indexes: rebuildIndexes
        },
        ...((!trainingData.dataset.vlmModel || !trainingData.collection.imageIndex) && {
          $unset: {
            imageDescMap: ''
          }
        })
      },
      { session }
    );
    // 3. Delete the training data
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });

    // 4. Delete old vector
    await deleteDatasetDataVector({
      teamId: trainingData.teamId,
      idList: deleteVectorIdList
    });
  });

  return { tokens: textInsertResult.tokens + imageInsertResult.tokens };
};

const insertData = async ({ trainingData }: { trainingData: TrainingDataType }) => {
  return mongoSessionRun(async (session) => {
    // insert new data to dataset
    const { tokens } = await insertData2Dataset({
      teamId: trainingData.teamId,
      tmbId: trainingData.tmbId,
      datasetId: trainingData.datasetId,
      collectionId: trainingData.collectionId,
      q: trainingData.q,
      a: trainingData.a,
      imageId: trainingData.imageId,
      imageDescMap: trainingData.imageDescMap,
      chunkIndex: trainingData.chunkIndex,
      indexSize:
        trainingData.indexSize ||
        getMaxIndexSize(getEmbeddingModel(trainingData.dataset.vectorModel)),
      indexes: trainingData.indexes,
      indexPrefix: trainingData.collection.indexPrefixTitle
        ? `# ${trainingData.collection.name}`
        : undefined,
      embeddingModel: trainingData.dataset.vectorModel,
      session
    });

    // delete data from training
    await MongoDatasetTraining.deleteOne({ _id: trainingData._id }, { session });

    return {
      tokens
    };
  });
};
