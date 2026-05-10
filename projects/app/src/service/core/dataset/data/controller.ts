import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  insertDatasetDataPrecomputedVector,
  insertDatasetDataVector
} from '@fastgpt/service/common/vectorDB/controller';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba/index';
import { deleteDatasetDataVector } from '@fastgpt/service/common/vectorDB/controller';
import { pushCollectionUpdateJob } from '@fastgpt/service/core/dataset/collection/mq';
import type {
  UpdateDatasetDataPropsType,
  DatasetDataIndexItemType,
  DatasetDataItemType,
  CreateDatasetDataPropsType
} from '@fastgpt/global/core/dataset/type';
import { getEmbeddingModel, isImageEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { type ClientSession } from '@fastgpt/service/common/mongo';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { countPromptTokens } from '@fastgpt/service/common/string/tiktoken';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { text2Chunks } from '@fastgpt/service/worker/function';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { removeS3TTL } from '@fastgpt/service/common/s3/utils';
import { getVectorsByImage } from '@fastgpt/service/core/ai/embedding';
import { normalizeImageInputsToBase64 } from '@fastgpt/service/core/ai/image';

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
        if (
          item.type === DatasetDataIndexTypeEnum.default ||
          item.type === DatasetDataIndexTypeEnum.imageEmbedding
        ) {
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
        if (
          index.type === DatasetDataIndexTypeEnum.custom ||
          index.type === DatasetDataIndexTypeEnum.imageEmbedding
        ) {
          return index;
        }
        return {
          ...index,
          text: formatText(index.text)
        };
      })
    : chekcIndexes;

  return prefixIndexes;
};

const getImageDisplayText = (imageId?: string) => {
  if (!imageId) return '';

  const filename = imageId.split('/').pop() || imageId;
  return decodeURIComponent(filename).replace(/\.[^.]+$/, '') || filename;
};

const insertImageEmbeddingVectors = async <T>({
  imageItems,
  getImageId,
  model,
  teamId,
  datasetId,
  collectionId
}: {
  imageItems: T[];
  getImageId: (item: T) => string;
  model: ReturnType<typeof getEmbeddingModel>;
  teamId: string;
  datasetId: string;
  collectionId: string;
}) => {
  if (imageItems.length === 0) {
    return {
      insertIds: [] as string[],
      tokens: 0,
      imageItems: [] as T[]
    };
  }

  const normalizedImageItems = await normalizeImageInputsToBase64({
    items: imageItems,
    getImageUrl: getImageId
  });

  if (normalizedImageItems.length === 0) {
    return {
      insertIds: [] as string[],
      tokens: 0,
      imageItems: [] as T[]
    };
  }

  const { vectors, tokens } = await getVectorsByImage({
    model,
    imageUrls: normalizedImageItems.map((item) => item.imageUrl),
    type: 'db'
  });

  return insertDatasetDataPrecomputedVector({
    vectors,
    teamId,
    datasetId,
    collectionId
  }).then((res) => ({
    ...res,
    tokens,
    imageItems: normalizedImageItems.map((item) => item.item)
  }));
};
/* insert data.
 * 1. create data id
 * 2. insert pg
 * 3. create mongo data
 */
export async function insertData2Dataset({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  q,
  a,
  imageId,
  chunkIndex = 0,
  indexSize = 512,
  indexes,
  indexPrefix,
  embeddingModel,
  imageDescMap,
  session
}: CreateDatasetDataPropsType & {
  embeddingModel: string;
  indexSize?: number;
  imageDescMap?: Record<string, string>;
  session?: ClientSession;
}) {
  q = q || getImageDisplayText(imageId);

  if ((!q && !imageId) || !datasetId || !collectionId || !embeddingModel) {
    return Promise.reject('q or imageId, datasetId, collectionId, embeddingModel is required');
  }
  if (String(teamId) === String(tmbId)) {
    return Promise.reject("teamId and tmbId can't be the same");
  }

  const embModel = getEmbeddingModel(embeddingModel);
  indexSize = Math.min(embModel.maxToken, indexSize);

  // 1. Get vector indexes and insert
  // Empty indexes check, if empty, create default index
  const newIndexes = await formatIndexes({
    indexes,
    q,
    a,
    indexSize,
    maxIndexSize: embModel.maxToken,
    indexPrefix
  });

  const textIndexes = newIndexes.filter(
    (item) => item.type !== DatasetDataIndexTypeEnum.imageEmbedding
  );
  const imageIndexCandidates = newIndexes.filter(
    (item) => item.type === DatasetDataIndexTypeEnum.imageEmbedding
  );
  if (imageId) {
    imageIndexCandidates.push({
      text: imageId,
      type: DatasetDataIndexTypeEnum.imageEmbedding
    });
  }
  const imageIndexes = isImageEmbeddingModel(embModel)
    ? imageIndexCandidates.filter(
        (item, index, self) => index === self.findIndex((t) => t.text === item.text)
      )
    : [];

  const { tokens, insertIds } = textIndexes.length
    ? await insertDatasetDataVector({
        inputs: textIndexes.map((item) => item.text),
        model: embModel,
        teamId,
        datasetId,
        collectionId
      })
    : { tokens: 0, insertIds: [] };

  const imageInsertResult = await insertImageEmbeddingVectors({
    imageItems: imageIndexes,
    getImageId: (item) => item.text,
    model: embModel,
    teamId,
    datasetId,
    collectionId
  });

  const results = textIndexes
    .map((item, index) => ({
      ...item,
      dataId: insertIds[index]
    }))
    .concat(
      imageInsertResult.imageItems.map((item, index) => ({
        ...item,
        dataId: imageInsertResult.insertIds[index]
      }))
    );

  const [{ _id }] = await MongoDatasetData.create(
    [
      {
        teamId,
        tmbId,
        datasetId,
        collectionId,
        q,
        a,
        imageId,
        imageDescMap,
        chunkIndex,
        indexes: results
      }
    ],
    { session, ordered: true }
  );

  // 3. Create mongo data text
  await MongoDatasetDataText.create(
    [
      {
        teamId,
        datasetId,
        collectionId,
        dataId: _id,
        fullTextToken: await jiebaSplit({ text: `${q}\n${a}`.trim() })
      }
    ],
    { session, ordered: true }
  );

  // 只移除图片数据集的图片的 TTL
  if (isS3ObjectKey(imageId, 'dataset')) {
    await removeS3TTL({ key: imageId, bucketName: 'private', session });
  }

  // Trigger collection update (async, with 5s delay and debounce)
  pushCollectionUpdateJob({
    collectionId: String(collectionId),
    datasetId: String(datasetId),
    teamId: String(teamId)
  });

  return {
    insertId: _id,
    tokens: tokens + imageInsertResult.tokens
  };
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
  model,
  indexSize = 512,
  indexPrefix
}: UpdateDatasetDataPropsType & { model: string; indexSize?: number }) {
  if (!Array.isArray(indexes)) {
    return Promise.reject('indexes is required');
  }

  // 1. Get mongo data
  const mongoData = await MongoDatasetData.findById(dataId);
  if (!mongoData) return Promise.reject('core.dataset.error.Data not found');

  // 2. Compute indexes
  const embModel = getEmbeddingModel(model);
  const formatIndexesResult = await formatIndexes({
    indexes,
    q,
    a,
    indexSize,
    maxIndexSize: embModel.maxToken,
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
  const skippedImageInsertItems = new Set<PatchIndexesProps>();
  const tokens = await (async () => {
    if (insertItems.length === 0) return 0;

    const textInsertItems = insertItems.filter(
      (item) => item.index.type !== DatasetDataIndexTypeEnum.imageEmbedding
    );
    const imageInsertItems = insertItems.filter(
      (item) => item.index.type === DatasetDataIndexTypeEnum.imageEmbedding
    );

    const textInsertResult = textInsertItems.length
      ? await insertDatasetDataVector({
          inputs: textInsertItems.map((item) => item.index.text),
          model: embModel,
          teamId: mongoData.teamId,
          datasetId: mongoData.datasetId,
          collectionId: mongoData.collectionId
        })
      : { tokens: 0, insertIds: [] as string[] };

    textInsertItems.forEach((item, index) => {
      item.index.dataId = textInsertResult.insertIds[index];
    });

    const imageInsertResult = await (async () => {
      if (!imageInsertItems.length) {
        return { tokens: 0, insertIds: [] as string[], imageItems: [] as typeof imageInsertItems };
      }
      if (!isImageEmbeddingModel(embModel)) {
        imageInsertItems.forEach((item) => skippedImageInsertItems.add(item));
        return { tokens: 0, insertIds: [] as string[], imageItems: [] as typeof imageInsertItems };
      }

      return insertImageEmbeddingVectors({
        imageItems: imageInsertItems,
        getImageId: (item) => item.index.text || mongoData.imageId || '',
        model: embModel,
        teamId: mongoData.teamId,
        datasetId: mongoData.datasetId,
        collectionId: mongoData.collectionId
      });
    })();

    const validImageInsertItems = new Set(imageInsertResult.imageItems);
    imageInsertItems.forEach((item) => {
      if (!validImageInsertItems.has(item)) {
        skippedImageInsertItems.add(item);
      }
    });
    imageInsertResult.imageItems.forEach((item, index) => {
      item.index.dataId = imageInsertResult.insertIds[index];
    });

    return textInsertResult.tokens + imageInsertResult.tokens;
  })();

  const newIndexes = patchResult
    .filter((item) => item.type !== 'delete' && !skippedImageInsertItems.has(item))
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
