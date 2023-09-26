import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { connectToDatabase, App } from '@/service/mongo';
import { FlowInputItemTypeEnum, FlowModuleTypeEnum } from '@/constants/flow';
import { SystemInputEnum } from '@/constants/app';

const limit = 300;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authUser({ req, authRoot: true });

    const totalApps = await App.countDocuments();

    // init app
    await App.updateMany({}, { $set: { inited: false } });

    for (let i = 0; i < totalApps; i += limit) {
      await initVariable();
      console.log(i + limit);
    }

    jsonRes(res, {
      data: {
        total: totalApps
      }
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

async function initVariable(): Promise<any> {
  try {
    const apps = await App.find({ inited: false }).limit(limit);
    await Promise.all(
      apps.map(async (app) => {
        const jsonAPP = app.toObject();
        // @ts-ignore
        app.inited = true;
        const modules = jsonAPP.modules;

        // 找到 variable
        const variable = modules.find((item) => item.flowType === FlowModuleTypeEnum.variable);
        if (!variable) return await app.save();

        // 找到 guide 模块
        const userGuideModule = modules.find(
          (item) => item.flowType === FlowModuleTypeEnum.userGuide
        );
        if (userGuideModule) {
          userGuideModule.inputs = [
            userGuideModule.inputs[0],
            {
              key: SystemInputEnum.variables,
              type: FlowInputItemTypeEnum.systemInput,
              label: '对话框变量',
              value: variable.inputs[0]?.value
            }
          ];
        } else {
          modules.unshift({
            moduleId: 'userGuide',
            flowType: FlowModuleTypeEnum.userGuide,
            name: '用户引导',
            position: {
              x: 447.98520778293346,
              y: 721.4016845336229
            },
            inputs: [
              {
                key: SystemInputEnum.welcomeText,
                type: FlowInputItemTypeEnum.input,
                label: '开场白'
              },
              {
                key: SystemInputEnum.variables,
                type: FlowInputItemTypeEnum.systemInput,
                label: '对话框变量',
                value: variable.inputs[0]?.value
              }
            ],
            outputs: []
          });
        }

        jsonAPP.modules = jsonAPP.modules.filter(
          (item) => item.flowType !== FlowModuleTypeEnum.variable
        );

        app.modules = JSON.parse(JSON.stringify(jsonAPP.modules));

        await app.save();
      })
    );
  } catch (error) {
    return initVariable();
  }
}
