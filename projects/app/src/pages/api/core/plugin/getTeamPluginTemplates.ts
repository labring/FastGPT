import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { FlowNodeTemplateType } from '@fastgpt/global/core/module/type';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/module/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { teamId } = await authCert({ req, authToken: true });

    const userPlugins = await MongoPlugin.find({ teamId }).lean();

    const data: FlowNodeTemplateType[] = userPlugins.map((plugin) => ({
      id: String(plugin._id),
      templateType: FlowNodeTemplateTypeEnum.personalPlugin,
      flowType: FlowNodeTypeEnum.pluginModule,
      avatar: plugin.avatar,
      name: plugin.name,
      intro: plugin.intro,
      showStatus: false,
      inputs: [],
      outputs: []
    }));

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
