import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { FlowModuleTemplateType } from '@fastgpt/global/core/module/type';
import { ModuleTemplateTypeEnum } from '@fastgpt/global/core/module/constants';
import { GET } from '@fastgpt/service/common/api/plusRequest';
import type { PluginTemplateType } from '@fastgpt/global/core/plugin/type.d';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { teamId } = await authCert({ req, authToken: true });

    const [userPlugins, plusPlugins] = await Promise.all([
      MongoPlugin.find({ teamId }).lean(),
      FastGPTProUrl ? GET<PluginTemplateType[]>('/core/plugin/getTemplates') : []
    ]);

    const data: FlowModuleTemplateType[] = [
      ...userPlugins.map((plugin) => ({
        id: String(plugin._id),
        templateType: ModuleTemplateTypeEnum.personalPlugin,
        flowType: FlowNodeTypeEnum.pluginModule,
        avatar: plugin.avatar,
        name: plugin.name,
        intro: plugin.intro,
        showStatus: false,
        inputs: [],
        outputs: []
      })),
      ...(global.communityPlugins?.map((plugin) => ({
        id: plugin.id,
        templateType: plugin.templateType ?? ModuleTemplateTypeEnum.other,
        flowType: FlowNodeTypeEnum.pluginModule,
        avatar: plugin.avatar,
        name: plugin.name,
        intro: plugin.intro,
        showStatus: true,
        inputs: [],
        outputs: []
      })) || [])
    ];

    jsonRes<FlowModuleTemplateType[]>(res, {
      data
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
