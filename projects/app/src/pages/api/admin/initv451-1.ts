import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { App, connectToDatabase } from '@/service/mongo';
import { PgClient } from '@/service/pg';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { PgDatasetTableName } from '@/constants/plugin';
import { FlowModuleTypeEnum } from '@/constants/flow';
import { delay } from '@/utils/tools';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { strIsLink } from '@fastgpt/global/common/string/tools';
import { GridFSStorage } from '@/service/lib/gridfs';
import { Types } from 'mongoose';

let successApp = 0;
let successCollection = 0;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50 } = req.body as { limit: number };
    await connectToDatabase();

    console.log('rename');
    await rename();
    jsonRes(res, {
      data: {}
    });
  } catch (error) {
    console.log(error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}

async function rename() {
  // rename mongo kbs -> datasets
  try {
    const collections = await connectionMongo.connection.db
      .listCollections({ name: 'kbs' })
      .toArray();
    if (collections.length > 0) {
      const kbCollection = connectionMongo.connection.db.collection('kbs');
      await kbCollection.rename('datasets', { dropTarget: true });
      console.log('success rename kbs -> datasets');
    }
  } catch (error) {
    console.log('error： rename kbs -> datasets', error);
  }

  // rename pg: kb_id -> dataset_id
  try {
    const { rows } = await PgClient.query(`SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = '${PgDatasetTableName}'
      AND column_name = 'kb_id'
  );`);

    if (rows[0].exists) {
      await PgClient.query(`ALTER TABLE ${PgDatasetTableName} RENAME COLUMN kb_id TO dataset_id`);
      console.log('success rename kb_id -> dataset_id');
    }
  } catch (error) {
    console.log('error： rename kb_id -> dataset_id', error);
  }
  // rename pg: file_id -> collection_id
  try {
    const { rows } = await PgClient.query(`SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = '${PgDatasetTableName}'
      AND column_name = 'file_id'
  );`);

    if (rows[0].exists) {
      await PgClient.query(
        `ALTER TABLE ${PgDatasetTableName} RENAME COLUMN file_id TO collection_id`
      );
      console.log('success rename file_id -> collection_id');
    }
  } catch (error) {
    console.log('error： rename file_id -> collection_id', error);
  }
}
