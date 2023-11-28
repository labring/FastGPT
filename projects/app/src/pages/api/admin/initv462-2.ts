import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { delay } from '@/utils/tools';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constant';
import { ModuleDataTypeEnum, ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { ModuleItemType } from '@fastgpt/global/core/module/type';

let success = 0;
/* pg 中的数据搬到 mongo dataset.datas 中，并做映射 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { limit = 50 } = req.body as { limit: number };
    await authCert({ req, authRoot: true });
    await connectToDatabase();
    success = 0;

    console.log('total', await MongoApp.countDocuments());

    await initApp(limit);

    jsonRes(res, {
      message: 'success'
    });
  } catch (error) {
    console.log(error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}
export async function initApp(limit = 50): Promise<any> {
  try {
    const apps = await MongoApp.find({ inited: false }).limit(limit);
    if (apps.length === 0) return;

    const result = await Promise.allSettled(
      apps.map(async (app) => {
        // 遍历app的modules，找到 datasetSearch, 如果 rerank=true， searchMode = embFullTextReRank, 否则等于embedding
        const modules = JSON.parse(JSON.stringify(app.modules)) as ModuleItemType[];
        modules.forEach((module) => {
          if (module.flowType === FlowNodeTypeEnum.datasetSearchNode) {
            module.inputs.forEach((input, i) => {
              if (input.key === 'rerank') {
                const val = !!input.value as boolean;
                module.inputs.splice(i, 1, {
                  key: ModuleInputKeyEnum.datasetSearchMode,
                  type: FlowNodeInputTypeEnum.hidden,
                  label: 'core.dataset.search.Mode',
                  valueType: ModuleDataTypeEnum.string,
                  showTargetInApp: false,
                  showTargetInPlugin: false,
                  value: val
                    ? DatasetSearchModeEnum.embFullTextReRank
                    : DatasetSearchModeEnum.embedding
                });
              }
            });
          }
        });
        app.modules = modules;
        app.inited = true;
        await app.save();
      })
    );

    success += result.filter((item) => item.status === 'fulfilled').length;
    console.log(`success: ${success}`);
    return initApp(limit);
  } catch (error) {
    console.log(error);
    await delay(1000);
    return initApp(limit);
  }
}
