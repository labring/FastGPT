import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import type { AppUpdateParams } from '@fastgpt/global/core/app/api';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { getLLMModel } from '@fastgpt/service/core/ai/model';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { name, avatar, type, intro, modules, permission, teamTags } =
      req.body as AppUpdateParams;
    const { appId } = req.query as { appId: string };

    if (!appId) {
      throw new Error('appId is empty');
    }

    // 凭证校验
    await authApp({ req, authToken: true, appId, per: permission ? 'owner' : 'w' });

    // check modules
    // 1. dataset search limit, less than model quoteMaxToken
    if (modules) {
      let maxTokens = 3000;

      modules.forEach((item) => {
        if (
          item.flowType === FlowNodeTypeEnum.chatNode ||
          item.flowType === FlowNodeTypeEnum.tools
        ) {
          const model =
            item.inputs.find((item) => item.key === ModuleInputKeyEnum.aiModel)?.value || '';
          const chatModel = getLLMModel(model);
          const quoteMaxToken = chatModel.quoteMaxToken || 3000;

          maxTokens = Math.max(maxTokens, quoteMaxToken);
        }
      });

      modules.forEach((item) => {
        if (item.flowType === FlowNodeTypeEnum.datasetSearchNode) {
          item.inputs.forEach((input) => {
            if (input.key === ModuleInputKeyEnum.datasetMaxTokens) {
              const val = input.value as number;
              if (val > maxTokens) {
                input.value = maxTokens;
              }
            }
          });
        }
      });
    }

    // 更新模型
    await MongoApp.updateOne(
      {
        _id: appId
      },
      {
        name,
        type,
        avatar,
        intro,
        permission,
        teamTags: teamTags,
        ...(modules && {
          modules
        })
      }
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
