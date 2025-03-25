import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  CreateDatasetDataProps,
  PatchIndexesProps,
  UpdateDatasetDataProps
} from '@fastgpt/global/core/dataset/controller';
import { insertDatasetDataVector } from '@fastgpt/service/common/vectorStore/controller';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba/index';
import { deleteDatasetDataVector } from '@fastgpt/service/common/vectorStore/controller';
import { DatasetDataIndexItemType, DatasetDataItemType } from '@fastgpt/global/core/dataset/type';
import { getEmbeddingModel, getLLMModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { ClientSession } from '@fastgpt/service/common/mongo';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { countPromptTokens } from '@fastgpt/service/common/string/tiktoken';

const formatIndexes = async ({
  indexes,
  q,
  a = '',
  indexSize,
  maxIndexSize
}: {
  indexes?: (Omit<DatasetDataIndexItemType, 'dataId'> & { dataId?: string })[];
  q: string;
  a?: string;
  indexSize: number;
  maxIndexSize: number;
}): Promise<
  {
    type: `${DatasetDataIndexTypeEnum}`;
    text: string;
    dataId?: string;
  }[]
> => {
  /* get dataset data default index */
  const getDefaultIndex = ({
    q = '',
    a,
    indexSize
  }: {
    q?: string;
    a?: string;
    indexSize: number;
  }) => {
    const qChunks = splitText2Chunks({
      text: q,
      chunkSize: indexSize,
      maxSize: maxIndexSize
    }).chunks;
    const aChunks = a
      ? splitText2Chunks({ text: a, chunkSize: indexSize, maxSize: maxIndexSize }).chunks
      : [];

    return [
      ...qChunks.map((text) => ({
        text,
        type: DatasetDataIndexTypeEnum.default
      })),
      ...aChunks.map((text) => ({
        text,
        type: DatasetDataIndexTypeEnum.default
      }))
    ];
  };

  indexes = indexes || [];
  // If index not type, set it to custom
  indexes = indexes
    .map((item) => ({
      text: typeof item.text === 'string' ? item.text : String(item.text),
      type: item.type || DatasetDataIndexTypeEnum.custom,
      dataId: item.dataId
    }))
    .filter((item) => !!item.text.trim());

  // Recompute default indexes, Merge ids of the same index, reduce the number of rebuilds
  const defaultIndexes = getDefaultIndex({ q, a, indexSize });
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
  indexes = indexes.filter((item) => item.type !== DatasetDataIndexTypeEnum.default);
  indexes.push(...concatDefaultIndexes);

  // Filter same text
  indexes = indexes.filter(
    (item, index, self) => index === self.findIndex((t) => t.text === item.text)
  );

  const chekcIndexes = (
    await Promise.all(
      indexes.map(async (item) => {
        // If oversize tokens, split it
        const tokens = await countPromptTokens(item.text);
        if (tokens > indexSize) {
          const splitText = splitText2Chunks({
            text: item.text,
            chunkSize: 512,
            maxSize: maxIndexSize
          }).chunks;
          return splitText.map((text) => ({
            text,
            type: item.type
          }));
        }
        return item;
      })
    )
  ).flat();

  return chekcIndexes;
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
  a = '',
  chunkIndex = 0,
  indexSize = 512,
  indexes,
  embeddingModel,
  session
}: CreateDatasetDataProps & {
  embeddingModel: string;
  indexSize?: number;
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
    maxIndexSize: embModel.maxToken
  });

  // insert to vector store
  const result = await Promise.all(
    newIndexes.map(async (item) => {
      const result = await insertDatasetDataVector({
        query: item.text,
        model: embModel,
        teamId,
        datasetId,
        collectionId
      });
      return {
        tokens: result.tokens,
        index: {
          ...item,
          dataId: result.insertId
        }
      };
    })
  );

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
        chunkIndex,
        indexes: result.map((item) => item.index)
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
    tokens: result.reduce((acc, cur) => acc + cur.tokens, 0)
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
  indexSize = 512
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
    maxIndexSize: getEmbeddingModel(model).maxToken
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

  // 4. Update mongo updateTime(便于脏数据检查器识别)
  const updateTime = mongoData.updateTime;
  mongoData.updateTime = new Date();
  await mongoData.save();

  // 5. insert vector
  const insertResult = await Promise.all(
    patchResult
      .filter((item) => item.type === 'create' || item.type === 'update')
      .map(async (item) => {
        // insert new vector and update dateId
        const result = await insertDatasetDataVector({
          query: item.index.text,
          model: getEmbeddingModel(model),
          teamId: mongoData.teamId,
          datasetId: mongoData.datasetId,
          collectionId: mongoData.collectionId
        });
        item.index.dataId = result.insertId;
        return {
          tokens: result.tokens
        };
      })
  );
  const tokens = insertResult.reduce((acc, cur) => acc + cur.tokens, 0);

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
    const deleteIdList = patchResult
      .filter((item) => item.type === 'delete' || item.type === 'update')
      .map((item) => item.index.dataId)
      .filter(Boolean) as string[];
    if (deleteIdList.length > 0) {
      await deleteDatasetDataVector({
        teamId: mongoData.teamId,
        idList: deleteIdList
      });
    }
  });

  return {
    tokens
  };
}

export const deleteDatasetData = async (data: DatasetDataItemType) => {
  await mongoSessionRun(async (session) => {
    await MongoDatasetData.deleteOne({ _id: data.id }, { session });
    await MongoDatasetDataText.deleteMany({ dataId: data.id }, { session });
    await deleteDatasetDataVector({
      teamId: data.teamId,
      idList: data.indexes.map((item) => item.dataId)
    });
  });
};
