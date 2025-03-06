import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  CreateDatasetDataProps,
  PatchIndexesProps,
  UpdateDatasetDataProps
} from '@fastgpt/global/core/dataset/controller';
import { insertDatasetDataVector } from '@fastgpt/service/common/vectorStore/controller';
import { getDefaultIndex } from '@fastgpt/global/core/dataset/utils';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba';
import { deleteDatasetDataVector } from '@fastgpt/service/common/vectorStore/controller';
import { DatasetDataIndexItemType, DatasetDataItemType } from '@fastgpt/global/core/dataset/type';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { ClientSession } from '@fastgpt/service/common/mongo';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

const formatIndexes = ({
  indexes,
  q,
  a = ''
}: {
  indexes?: (Omit<DatasetDataIndexItemType, 'dataId'> & { dataId?: string })[];
  q: string;
  a?: string;
}) => {
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
  const defaultIndexes = getDefaultIndex({ q, a });
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

  return indexes.map((index) => ({
    type: index.type,
    text: index.text,
    dataId: index.dataId
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
  a = '',
  chunkIndex = 0,
  indexes,
  model,
  session
}: CreateDatasetDataProps & {
  model: string;
  session?: ClientSession;
}) {
  if (!q || !datasetId || !collectionId || !model) {
    return Promise.reject('q, datasetId, collectionId, model is required');
  }
  if (String(teamId) === String(tmbId)) {
    return Promise.reject("teamId and tmbId can't be the same");
  }

  // 1. Get vector indexes and insert
  // Empty indexes check, if empty, create default index
  const newIndexes = formatIndexes({ indexes, q, a });

  // insert to vector store
  const result = await Promise.all(
    newIndexes.map(async (item) => {
      const result = await insertDatasetDataVector({
        query: item.text,
        model: getEmbeddingModel(model),
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
        fullTextToken: jiebaSplit({ text: `${q}\n${a}`.trim() })
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
  model
}: UpdateDatasetDataProps & { model: string }) {
  if (!Array.isArray(indexes)) {
    return Promise.reject('indexes is required');
  }

  // 1. Get mongo data
  const mongoData = await MongoDatasetData.findById(dataId);
  if (!mongoData) return Promise.reject('core.dataset.error.Data not found');

  // 2. Compute indexes
  const formatIndexesResult = formatIndexes({ indexes, q, a });

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
  mongoData.updateTime = new Date();
  await mongoData.save();

  // 5. Insert vector
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

  // console.log(clonePatchResult2Insert);
  await mongoSessionRun(async (session) => {
    // Update MongoData
    mongoData.q = q || mongoData.q;
    mongoData.a = a ?? mongoData.a;
    mongoData.indexes = newIndexes;
    await mongoData.save({ session });

    // update mongo data text
    await MongoDatasetDataText.updateOne(
      { dataId: mongoData._id },
      { fullTextToken: jiebaSplit({ text: `${mongoData.q}\n${mongoData.a}`.trim() }) },
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
