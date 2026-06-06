import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { insertDatasetDataVector } from '@fastgpt/service/common/vectorDB/controller';
import { deleteDatasetDataVector } from '@fastgpt/service/common/vectorDB/controller';
import { pushCollectionUpdateJob } from '@fastgpt/service/core/dataset/collection/mq';
import type {
  UpdateDatasetDataPropsType,
  DatasetDataIndexItemType,
  DatasetDataItemType
} from '@fastgpt/global/core/dataset/type';
import { getEmbeddingModelById } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { type ClientSession } from '@fastgpt/service/common/mongo';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { countPromptTokens } from '@fastgpt/service/common/string/tiktoken';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba/index';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { text2Chunks } from '@fastgpt/service/worker/function';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { addLog } from '@fastgpt/service/common/system/log';

const formatIndexes = async ({
  indexes = [],
  q,
  a = '',
  indexSize,
  maxIndexSize,
  indexPrefix
}: {
  indexes?: (Omit<DatasetDataIndexItemType, 'dataId'> & { dataId?: string })[];
  q: string;
  a?: string;
  indexSize: number;
  maxIndexSize: number;
  indexPrefix?: string;
}): Promise<
  {
    type: DatasetDataIndexTypeEnum;
    text: string;
    dataId?: string;
  }[]
> => {
  const formatText = (text: string) => {
    if (indexPrefix && !text.startsWith(indexPrefix)) {
      return `${indexPrefix}\n${text}`;
    }
    return text;
  };
  /* get dataset data default index */
  const getDefaultIndex = async ({
    q = '',
    a,
    indexSize
  }: {
    q?: string;
    a?: string;
    indexSize: number;
  }) => {
    const qChunks = (
      await text2Chunks({
        text: q,
        chunkSize: indexSize,
        maxSize: maxIndexSize
      })
    ).chunks;
    const aChunks = a
      ? (await text2Chunks({ text: a, chunkSize: indexSize, maxSize: maxIndexSize })).chunks
      : [];

    return [
      ...qChunks.map((text) => ({
        text: formatText(text),
        type: DatasetDataIndexTypeEnum.default
      })),
      ...aChunks.map((text) => ({
        text: formatText(text),
        type: DatasetDataIndexTypeEnum.default
      }))
    ];
  };

  // If index not type, set it to custom
  indexes = indexes.map((item) => ({
    text: typeof item.text === 'string' ? item.text : String(item.text),
    type: item.type || DatasetDataIndexTypeEnum.custom,
    dataId: item.dataId
  }));

  // Recompute default indexes, Merge ids of the same index, reduce the number of rebuilds
  const defaultIndexes = await getDefaultIndex({ q, a, indexSize });

  const concatDefaultIndexes = defaultIndexes.map((item) => {
    const oldIndex = indexes!.find((index) => index.text === item.text);
    if (oldIndex) {
      return {
        type: DatasetDataIndexTypeEnum.default,
        text: item.text,
        dataId: oldIndex.dataId
      };
    } else {
      return item;
    }
  });

  // 其他索引不能与默认索引相同，且不能自己有重复
  indexes = indexes.filter(
    (item, index, self) =>
      item.type !== DatasetDataIndexTypeEnum.default &&
      !concatDefaultIndexes.find((t) => t.text === item.text) &&
      index === self.findIndex((t) => t.text === item.text)
  );
  indexes.push(...concatDefaultIndexes);

  const chekcIndexes = (
    await Promise.all(
      indexes.map(async (item) => {
        if (item.type === DatasetDataIndexTypeEnum.default) {
          return item;
        }

        // If oversize tokens, split it
        const tokens = await countPromptTokens(item.text);
        if (tokens > maxIndexSize) {
          const splitText = (
            await text2Chunks({
              text: item.text,
              chunkSize: indexSize,
              maxSize: maxIndexSize
            })
          ).chunks;
          return splitText.map((text) => ({
            text,
            type: item.type
          }));
        }

        return item;
      })
    )
  )
    .flat()
    .filter((item) => !!item.text.trim());

  // Add prefix
  const prefixIndexes = indexPrefix
    ? chekcIndexes.map((index) => {
        if (index.type === DatasetDataIndexTypeEnum.custom) return index;
        return {
          ...index,
          text: formatText(index.text)
        };
      })
    : chekcIndexes;

  return prefixIndexes;
};

/**
 * Insert vector indexes for an existing Data record.
 * Called by generateVector to update pre-created Data with vector embeddings.
 *
 * Steps:
 * 1. formatIndexes — compute default + custom indexes from q/a
 * 2. Embedding + Vector DB insert
 * 3. Update Data.indexes
 * 4. Trigger collection update (indexes now ready for search)
 */
export async function insertDataVector({
  dataId,
  q,
  a,
  indexSize = 512,
  indexes,
  indexPrefix,
  embeddingModelId,
  teamId,
  datasetId,
  collectionId,
  session
}: {
  dataId: string;
  q: string;
  a?: string;
  indexSize: number;
  indexes?: (Omit<DatasetDataIndexItemType, 'dataId'> & { dataId?: string })[];
  indexPrefix?: string;
  embeddingModelId: string;
  teamId: string;
  datasetId: string;
  collectionId: string;
  session?: ClientSession;
}) {
  const embModel = getEmbeddingModelById(embeddingModelId);
  indexSize = Math.min(embModel.maxToken, indexSize);

  // 1. Format indexes (merge custom indexes with default q/a indexes)
  const newIndexes = await formatIndexes({
    indexes,
    q,
    a: a || '',
    indexSize,
    maxIndexSize: embModel.maxToken,
    indexPrefix
  });

  // 2. Embedding + insert to Vector DB
  const { tokens, insertIds } = await insertDatasetDataVector({
    inputs: newIndexes.map((item) => item.text),
    model: embModel,
    teamId,
    datasetId,
    collectionId
  });

  // Defensive check: insertIds must match newIndexes in length.
  // A mismatch indicates the vector DB silently dropped one or more inserts,
  // which would produce dataId: undefined in the results and corrupt Data.indexes.
  if (insertIds.length !== newIndexes.length) {
    throw new Error(
      `insertIds length mismatch: expected ${newIndexes.length}, got ${insertIds.length}`
    );
  }

  const results = newIndexes.map((item, i) => ({
    ...item,
    dataId: insertIds[i]
  }));

  // 3. Update Data.indexes (overwrite) and set indexingCompleteTime
  await MongoDatasetData.updateOne(
    { _id: dataId },
    { $set: { indexes: results, indexingCompleteTime: new Date() } },
    { session }
  );

  // 4. Trigger collection update (indexes now ready for search)
  pushCollectionUpdateJob({
    collectionId: String(collectionId),
    datasetId: String(datasetId),
    teamId: String(teamId)
  });

  return { insertId: dataId, tokens };
}

/**
 * Update data(indexes overwrite)
 * 1. compare indexes
 * 2. insert new pg data
 * session run:
 *  3. update mongo data(session run)
 *  4. delete old pg data
 */
type PatchIndexesProps =
  | {
      type: 'create';
      index: Omit<DatasetDataIndexItemType, 'dataId'> & {
        dataId?: string;
      };
    }
  | {
      type: 'update';
      index: DatasetDataIndexItemType;
    }
  | {
      type: 'delete';
      index: DatasetDataIndexItemType;
    }
  | {
      type: 'unChange';
      index: DatasetDataIndexItemType;
    };
export async function updateData2Dataset({
  dataId,
  q = '',
  a,
  indexes,
  modelId,
  indexSize = 512,
  indexPrefix
}: UpdateDatasetDataPropsType & { modelId: string; indexSize?: number }) {
  if (!Array.isArray(indexes)) {
    return Promise.reject('indexes is required');
  }

  // 1. Get mongo data
  const mongoData = await MongoDatasetData.findById(dataId);
  if (!mongoData) return Promise.reject('core.dataset.error.Data not found');

  // 2. Compute indexes
  const formatIndexesResult = await formatIndexes({
    indexes,
    q,
    a,
    indexSize,
    maxIndexSize: getEmbeddingModelById(modelId).maxToken,
    indexPrefix
  });

  // 3. Patch indexes, create, update, delete
  const patchResult: PatchIndexesProps[] = [];
  // find database indexes in new Indexes, if have not,  delete it
  for (const item of mongoData.indexes) {
    const index = formatIndexesResult.find((index) => index.dataId === item.dataId);
    if (!index) {
      patchResult.push({
        type: 'delete',
        index: item
      });
    }
  }
  for (const item of formatIndexesResult) {
    if (!item.dataId) {
      patchResult.push({
        type: 'create',
        index: item
      });
    } else {
      const index = mongoData.indexes.find((index) => index.dataId === item.dataId);
      if (!index) continue;

      // Not change
      if (index.text === item.text) {
        patchResult.push({
          type: 'unChange',
          index: {
            ...item,
            dataId: index.dataId
          }
        });
      } else {
        // index Update
        patchResult.push({
          type: 'update',
          index: {
            ...item,
            dataId: index.dataId
          }
        });
      }
    }
  }

  const deleteVectorIdList = patchResult
    .filter((item) => item.type === 'delete' || item.type === 'update')
    .map((item) => item.index.dataId)
    .filter(Boolean) as string[];

  // 4. Update mongo updateTime(便于脏数据检查器识别)
  const updateTime = mongoData.updateTime;
  mongoData.updateTime = new Date();
  await mongoData.save();

  // 5. insert vector

  const insertItems = patchResult.filter(
    (item) => item.type === 'create' || item.type === 'update'
  );
  const tokens = await (async () => {
    if (insertItems.length > 0) {
      // Batch insert vectors
      const result = await insertDatasetDataVector({
        inputs: insertItems.map((item) => item.index.text),
        model: getEmbeddingModelById(modelId),
        teamId: mongoData.teamId,
        datasetId: mongoData.datasetId,
        collectionId: mongoData.collectionId
      });

      // Update dataIds for the items
      insertItems.forEach((item, index) => {
        item.index.dataId = result.insertIds[index];
      });

      return result.tokens;
    }
    return 0;
  })();

  const newIndexes = patchResult
    .filter((item) => item.type !== 'delete')
    .map((item) => item.index) as DatasetDataIndexItemType[];

  // 6. update mongo data
  await mongoSessionRun(async (session) => {
    // Update history
    mongoData.history =
      q !== mongoData.q || a !== mongoData.a
        ? [
            {
              q: mongoData.q,
              a: mongoData.a,
              updateTime: updateTime
            },
            ...(mongoData.history?.slice(0, 9) || [])
          ]
        : mongoData.history;
    mongoData.q = q || mongoData.q;
    mongoData.a = a ?? mongoData.a;
    mongoData.indexes = newIndexes;
    await mongoData.save({ session });

    // update mongo data text
    await MongoDatasetDataText.updateOne(
      { dataId: mongoData._id },
      { fullTextToken: await jiebaSplit({ text: `${mongoData.q}\n${mongoData.a}`.trim() }) },
      { session }
    );

    // Delete vector
    if (deleteVectorIdList.length > 0) {
      await deleteDatasetDataVector({
        teamId: mongoData.teamId,
        idList: deleteVectorIdList
      });
    }
  });

  // Trigger collection update (async, with 5s delay and debounce)
  pushCollectionUpdateJob({
    collectionId: String(mongoData.collectionId),
    datasetId: String(mongoData.datasetId),
    teamId: String(mongoData.teamId)
  });

  return {
    tokens
  };
}

export const deleteDatasetData = async (data: DatasetDataItemType) => {
  await mongoSessionRun(async (session) => {
    if (data.imageId && !isS3ObjectKey(data.imageId, 'dataset')) {
      return Promise.reject('Invalid dataset image key');
    }

    // 1. Delete MongoDB data
    await MongoDatasetData.deleteOne({ _id: data.id }, { session });
    await MongoDatasetDataText.deleteMany({ dataId: data.id }, { session });

    if (data.imageId) {
      await getS3DatasetSource().deleteDatasetFileByKey(data.imageId);
    }

    // 2. Delete vector data
    await deleteDatasetDataVector({
      teamId: data.teamId,
      idList: data.indexes.map((item) => item.dataId)
    });
  });

  // Trigger collection update (async, with 5s delay and debounce)
  pushCollectionUpdateJob({
    collectionId: String(data.collectionId),
    datasetId: String(data.datasetId),
    teamId: String(data.teamId)
  });
};
