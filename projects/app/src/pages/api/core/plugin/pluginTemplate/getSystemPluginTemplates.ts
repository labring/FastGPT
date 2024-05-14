import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/index.d';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    await authCert({ req, authToken: true });

    const data: FlowNodeTemplateType[] =
      global.communityPlugins?.map((plugin) => ({
        id: plugin.id,
        pluginId: plugin.id,
        templateType: plugin.templateType ?? FlowNodeTemplateTypeEnum.other,
        flowNodeType: FlowNodeTypeEnum.pluginModule,
        avatar: plugin.avatar,
        name: plugin.name,
        intro: plugin.intro,
        showStatus: true,
        isTool: plugin.isTool,
        version: '481',
        inputs: [],
        outputs: []
      })) || [];

    jsonRes<FlowNodeTemplateType[]>(res, {
      data
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
