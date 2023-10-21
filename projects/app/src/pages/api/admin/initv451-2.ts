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

    console.log('init mongo data');
    await initMongo(limit);

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

async function initMongo(limit: number) {
  async function initApp(limit = 100): Promise<any> {
    // 遍历所有 app，更新 app modules 里的 FlowModuleTypeEnum.kbSearchNode
    const apps = await App.find({ inited: false }).limit(limit);

    if (apps.length === 0) return;

    try {
      await Promise.all(
        apps.map(async (app) => {
          const modules = app.toObject().modules;
          // @ts-ignore
          app.inited = true;

          modules.forEach((module) => {
            // @ts-ignore
            if (module.flowType === 'kbSearchNode') {
              module.flowType = FlowModuleTypeEnum.datasetSearchNode;
              module.inputs.forEach((input) => {
                if (input.key === 'kbList') {
                  input.key = 'datasets';
                  input.value?.forEach((item: any) => {
                    item.datasetId = item.kbId;
                  });
                }
              });
            }
          });

          app.modules = JSON.parse(JSON.stringify(modules));
          await app.save();
        })
      );
      successApp += limit;
      console.log('mongo init:', successApp);
      return initApp(limit);
    } catch (error) {
      return initApp(limit);
    }
  }

  // init app
  await App.updateMany(
    {},
    {
      $set: {
        inited: false
      }
    }
  );

  successApp = 0;
  const totalApp = await App.countDocuments();
  console.log(`total app: ${totalApp}`);
  await delay(2000);
  console.log('start init app');
  await initApp(limit);
  console.log('init mongo success');
}
