import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { delay } from '@/utils/tools';
import { PgClient } from '@fastgpt/service/common/pg';
import {
  DatasetDataIndexTypeEnum,
  PgDatasetTableName
} from '@fastgpt/global/core/dataset/constant';

import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';

let success = 0;
/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50 } = req.body as { limit: number };
    await authCert({ req, authRoot: true });
    await connectToDatabase();
    success = 0;

    jsonRes(res, {
      data: await init(limit)
    });
  } catch (error) {
    console.log(error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}

type PgItemType = {
  id: string;
  q: string;
  a: string;
  dataset_id: string;
  collection_id: string;
  data_id: string;
};

async function init(limit: number): Promise<any> {
  const { rows: idList } = await PgClient.query<{ id: string }>(
    `SELECT id FROM ${PgDatasetTableName} WHERE inited=1`
  );

  console.log('totalCount', idList.length);

  await delay(2000);

  if (idList.length === 0) return;

  for (let i = 0; i < limit; i++) {
    initData(i);
  }

  async function initData(index: number): Promise<any> {
    const dataId = idList[index]?.id;
    if (!dataId) {
      console.log('done');
      return;
    }
    // get limit data where data_id is null
    const { rows } = await PgClient.query<PgItemType>(
      `SELECT id,q,a,dataset_id,collection_id,data_id FROM ${PgDatasetTableName} WHERE id=${dataId};`
    );
    const data = rows[0];
    if (!data) {
      console.log('done');
      return;
    }

    try {
      // update mongo data and update inited
      await MongoDatasetData.findByIdAndUpdate(data.data_id, {
        q: data.q,
        a: data.a,
        indexes: [
          {
            defaultIndex: !data.a,
            type: data.a ? DatasetDataIndexTypeEnum.qa : DatasetDataIndexTypeEnum.chunk,
            dataId: data.id,
            text: data.q
          }
        ]
      });
      // update pg data_id
      await PgClient.query(`UPDATE ${PgDatasetTableName} SET inited=0 WHERE id=${dataId};`);

      return initData(index + limit);
    } catch (error) {
      console.log(error);
      console.log(data);
      await delay(500);
      return initData(index);
    }
  }
}
