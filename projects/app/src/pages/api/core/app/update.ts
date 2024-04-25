import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import type { AppUpdateParams } from '@fastgpt/global/core/app/api';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { getGuideModule, splitGuideModule } from '@fastgpt/global/core/workflow/utils';
import { getNextTimeByCronStringAndTimezone } from '@fastgpt/global/common/string/time';
import { getScheduleTriggerApp } from '@/service/core/app/utils';

/* 获取我的模型 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const {
      name,
      avatar,
      type,
      intro,
      modules: nodes,
      edges,
      permission,
      teamTags
    } = req.body as AppUpdateParams;
    const { appId } = req.query as { appId: string };

    if (!appId) {
      throw new Error('appId is empty');
    }

    // 凭证校验
    await authApp({ req, authToken: true, appId, per: permission ? 'owner' : 'w' });

    // format nodes data
    // 1. dataset search limit, less than model quoteMaxToken
    if (nodes) {
      let maxTokens = 3000;

      nodes.forEach((item) => {
        if (
          item.flowNodeType === FlowNodeTypeEnum.chatNode ||
          item.flowNodeType === FlowNodeTypeEnum.tools
        ) {
          const model =
            item.inputs.find((item) => item.key === NodeInputKeyEnum.aiModel)?.value || '';
          const chatModel = getLLMModel(model);
          const quoteMaxToken = chatModel.quoteMaxToken || 3000;

          maxTokens = Math.max(maxTokens, quoteMaxToken);
        }
      });

      nodes.forEach((item) => {
        if (item.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
          item.inputs.forEach((input) => {
            if (input.key === NodeInputKeyEnum.datasetMaxTokens) {
              const val = input.value as number;
              if (val > maxTokens) {
                input.value = maxTokens;
              }
            }
          });
        }
      });
    }
    // 2. get schedule plan
    const { scheduledTriggerConfig } = splitGuideModule(getGuideModule(nodes || []));

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
        version: 'v2',
        teamTags: teamTags,
        ...(nodes && {
          modules: nodes
        }),
        ...(edges && {
          edges
        }),
        scheduledTriggerConfig,
        scheduledTriggerNextTime: scheduledTriggerConfig
          ? getNextTimeByCronStringAndTimezone(scheduledTriggerConfig)
          : null
      }
    );

    getScheduleTriggerApp();

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
