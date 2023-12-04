import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  CreateDatasetDataProps,
  PatchIndexesProps,
  UpdateDatasetDataProps
} from '@fastgpt/global/core/dataset/controller';
import { deletePgDataById } from '@fastgpt/service/core/dataset/data/pg';
import { insertData2Pg, updatePgDataById } from './pg';
import { Types } from 'mongoose';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { getDefaultIndex } from '@fastgpt/global/core/dataset/utils';
import { jiebaSplit } from '../utils';

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
  model
}: CreateDatasetDataProps & {
  model: string;
}) {
  if (!q || !datasetId || !collectionId || !model) {
    console.log(q, a, datasetId, collectionId, model);
    return Promise.reject('q, datasetId, collectionId, model is required');
  }
  if (String(teamId) === String(tmbId)) {
    return Promise.reject("teamId and tmbId can't be the same");
  }

  const id = new Types.ObjectId();
  const qaStr = `${q}\n${a}`.trim();

  // empty indexes check, if empty, create default index
  indexes =
    Array.isArray(indexes) && indexes.length > 0
      ? indexes.map((index) => ({
          ...index,
          dataId: undefined,
          defaultIndex: indexes?.length === 1 && index.text === qaStr ? true : index.defaultIndex
        }))
      : [getDefaultIndex({ q, a })];

  // insert to pg
  const result = await Promise.all(
    indexes.map((item) =>
      insertData2Pg({
        mongoDataId: String(id),
        input: item.text,
        model,
        teamId,
        tmbId,
        datasetId,
        collectionId
      })
    )
  );

  // create mongo
  const { _id } = await MongoDatasetData.create({
    _id: id,
    teamId,
    tmbId,
    datasetId,
    collectionId,
    q,
    a,
    fullTextToken: jiebaSplit({ text: qaStr }),
    chunkIndex,
    indexes: indexes.map((item, i) => ({
      ...item,
      dataId: result[i].insertId
    }))
  });

  return {
    insertId: _id,
    tokenLen: result.reduce((acc, cur) => acc + cur.tokenLen, 0)
  };
}

/**
 * update data
 * 1. compare indexes
 * 2. update pg data
 * 3. update mongo data
 */
export async function updateData2Dataset({
  dataId,
  q,
  a,
  indexes,
  model
}: UpdateDatasetDataProps & { model: string }) {
  if (!Array.isArray(indexes)) {
    return Promise.reject('indexes is required');
  }
  const qaStr = `${q}\n${a}`.trim();

  // patch index and update pg
  const mongoData = await MongoDatasetData.findById(dataId);
  if (!mongoData) return Promise.reject('Data not found');

  // make sure have one index
  if (indexes.length === 0) {
    const databaseDefaultIndex = mongoData.indexes.find((index) => index.defaultIndex);

    indexes = [
      getDefaultIndex({
        q,
        a,
        dataId: databaseDefaultIndex ? String(databaseDefaultIndex.dataId) : undefined
      })
    ];
  }

  // patch indexes, create, update, delete
  const patchResult: PatchIndexesProps[] = [];

  // find database indexes in new Indexes, if have not,  delete it
  for (const item of mongoData.indexes) {
    const index = indexes.find((index) => index.dataId === item.dataId);
    if (!index) {
      patchResult.push({
        type: 'delete',
        index: item
      });
    }
  }
  for (const item of indexes) {
    const index = mongoData.indexes.find((index) => index.dataId === item.dataId);
    // in database, update
    if (index) {
      // manual update index
      if (index.text !== item.text) {
        patchResult.push({
          type: 'update',
          index: item
        });
      } else if (index.defaultIndex && index.text !== qaStr) {
        // update default index
        patchResult.push({
          type: 'update',
          index: {
            ...item,
            type:
              item.type === DatasetDataIndexTypeEnum.qa && !a
                ? DatasetDataIndexTypeEnum.chunk
                : item.type,
            text: qaStr
          }
        });
      }
    } else {
      // not in database, create
      patchResult.push({
        type: 'create',
        index: item
      });
    }
  }

  const result = await Promise.all(
    patchResult.map(async (item) => {
      if (item.type === 'create') {
        const result = await insertData2Pg({
          mongoDataId: dataId,
          input: item.index.text,
          model,
          teamId: mongoData.teamId,
          tmbId: mongoData.tmbId,
          datasetId: mongoData.datasetId,
          collectionId: mongoData.collectionId
        });
        item.index.dataId = result.insertId;
        return result;
      }
      if (item.type === 'update' && item.index.dataId) {
        return updatePgDataById({
          id: item.index.dataId,
          input: item.index.text,
          model
        });
      }
      if (item.type === 'delete' && item.index.dataId) {
        return deletePgDataById(['id', item.index.dataId]);
      }
      return {
        tokenLen: 0
      };
    })
  );

  const tokenLen = result.reduce((acc, cur) => acc + cur.tokenLen, 0);

  // update mongo
  mongoData.q = q || mongoData.q;
  mongoData.a = a ?? mongoData.a;
  mongoData.fullTextToken = jiebaSplit({ text: mongoData.q + mongoData.a });
  // @ts-ignore
  mongoData.indexes = indexes;
  await mongoData.save();

  return {
    tokenLen
  };
}
