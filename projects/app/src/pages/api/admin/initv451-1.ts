import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, App } from '@/service/mongo';
import { PgClient } from '@/service/pg';
import mongoose from '@fastgpt/service/common/mongo';

/* rename dataset */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50 } = req.body as { limit: number };
    await connectToDatabase();

    // rename mongo kbs -> datasets
    try {
      console.log('rename kbs -> datasets');

      const kbCollection = mongoose.connection.db.collection('kbs');
      await kbCollection.rename('datasets');
      console.log('success rename kbs -> datasets');
    } catch (error) {
      console.log('error： rename kbs -> datasets');
    }

    // rename pg: q -> index
    try {
    } catch (error) {}
    // rename pg: a -> content
    // rename pg: kb_id -> dataset_id
    // rename pg: file_id -> collection_id

    jsonRes(res, {
      data: {}
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

async function name() {}
