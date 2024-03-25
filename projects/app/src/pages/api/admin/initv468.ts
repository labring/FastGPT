import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { PgClient } from '@fastgpt/service/common/vectorStore/pg';
import { PgDatasetTableName } from '@fastgpt/global/common/vectorStore/constants';
import { MongoImage } from '@fastgpt/service/common/file/image/schema';
import { MongoImageSchemaType } from '@fastgpt/global/common/file/image/type';
import { delay } from '@fastgpt/global/common/system/utils';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { ModuleItemType } from '@fastgpt/global/core/module/type';
import { DYNAMIC_INPUT_KEY, ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';

let success = 0;
let deleteImg = 0;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 设置所有app为 inited = false
    const result = await MongoApp.updateMany({}, { $set: { inited: false } });
    console.log(result);

    await initApp();

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

const systemKeys: string[] = [
  ModuleInputKeyEnum.switch,
  ModuleInputKeyEnum.httpMethod,
  ModuleInputKeyEnum.httpReqUrl,
  ModuleInputKeyEnum.httpHeaders,
  DYNAMIC_INPUT_KEY,
  ModuleInputKeyEnum.addInputParam
];
const initApp = async (): Promise<any> => {
  const app = await MongoApp.findOne({ inited: false }).sort({ updateTime: -1 });
  if (!app) {
    return;
  }

  try {
    const modules = JSON.parse(JSON.stringify(app.modules)) as ModuleItemType[];
    let update = false;
    // 找到http模块
    modules.forEach((module) => {
      if (module.flowType === 'httpRequest') {
        const method = module.inputs.find((input) => input.key === ModuleInputKeyEnum.httpMethod);
        if (method?.value === 'POST') {
          module.inputs.forEach((input) => {
            // 更新非系统字段的key
            if (!systemKeys.includes(input.key)) {
              // 更新output的target
              modules.forEach((item) => {
                item.outputs.forEach((output) => {
                  output.targets.forEach((target) => {
                    if (target.moduleId === module.moduleId && target.key === input.key) {
                      target.key = `data.${input.key}`;
                    }
                  });
                });
              });
              // 更新key
              input.key = `data.${input.key}`;
              update = true;
            }
          });
        }
      }
    });

    if (update) {
      console.log('update http app');
      app.modules = modules;
    }
    app.inited = true;
    await app.save();

    console.log(++success);
    return initApp();
  } catch (error) {
    console.log(error);

    await delay(1000);
    return initApp();
  }
};
