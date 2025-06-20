import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  type CreateDatasetDataProps,
  type PatchIndexesProps,
  type UpdateDatasetDataProps
} from '@fastgpt/global/core/dataset/controller';
import { insertDatasetDataVector } from '@fastgpt/service/common/vectorDB/controller';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba/index';
import { deleteDatasetDataVector } from '@fastgpt/service/common/vectorDB/controller';
import {
  type DatasetDataIndexItemType,
  type DatasetDataItemType
} from '@fastgpt/global/core/dataset/type';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { type ClientSession } from '@fastgpt/service/common/mongo';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { countPromptTokens } from '@fastgpt/service/common/string/tiktoken';
import { deleteDatasetImage } from '@fastgpt/service/core/dataset/image/controller';
import { text2Chunks } from '@fastgpt/service/worker/function';

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
    type: `${DatasetDataIndexTypeEnum}`;
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
}: CreateDatasetDataProps & {
  embeddingModel: string;
  indexSize?: number;
  imageDescMap?: Record<string, string>;
  session?: ClientSession;
}) {
  if (!q || !datasetId || !collectionId || !embeddingModel) {
    return Promise.reject('q, datasetId, collectionId, embeddingModel is required');
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

  // insert to vector store
  const results: {
    tokens: number;
    index: {
      dataId: string;
      type: `${DatasetDataIndexTypeEnum}`;
      text: string;
    };
  }[] = [];
  for await (const item of newIndexes) {
    const result = await insertDatasetDataVector({
      query: item.text,
      model: embModel,
      teamId,
      datasetId,
      collectionId
    });
    results.push({
      tokens: result.tokens,
      index: {
        ...item,
        dataId: result.insertId
      }
    });
  }

  // 2. Create mongo data
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
        indexes: results.map((item) => item.index)
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

  return {
    insertId: _id,
    tokens: results.reduce((acc, cur) => acc + cur.tokens, 0)
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
export async function updateData2Dataset({
  dataId,
  q = '',
  a,
  indexes,
  model,
  indexSize = 512,
  indexPrefix
}: UpdateDatasetDataProps & { model: string; indexSize?: number }) {
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
    maxIndexSize: getEmbeddingModel(model).maxToken,
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
  const insertResults: {
    tokens: number;
  }[] = [];
  for await (const item of patchResult) {
    if (item.type === 'delete' || item.type === 'unChange') continue;

    // insert new vector and update dateId
    const result = await insertDatasetDataVector({
      query: item.index.text,
      model: getEmbeddingModel(model),
      teamId: mongoData.teamId,
      datasetId: mongoData.datasetId,
      collectionId: mongoData.collectionId
    });
    item.index.dataId = result.insertId;
    insertResults.push({
      tokens: result.tokens
    });
  }

  const tokens = insertResults.reduce((acc, cur) => acc + cur.tokens, 0);

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

  return {
    tokens
  };
}

export const deleteDatasetData = async (data: DatasetDataItemType) => {
  await mongoSessionRun(async (session) => {
    // 1. Delete MongoDB data
    await MongoDatasetData.deleteOne({ _id: data.id }, { session });
    await MongoDatasetDataText.deleteMany({ dataId: data.id }, { session });

    // 2. If there are any image files, delete the image records and GridFS file.
    if (data.imageId) {
      await deleteDatasetImage(data.imageId);
    }

    // 3. Delete vector data
    await deleteDatasetDataVector({
      teamId: data.teamId,
      idList: data.indexes.map((item) => item.dataId)
    });
  });
};
