/* 
  批量获取插件信息
 */
import type { NextApiResponse } from 'next';
import {
  getChildAppPreviewNode,
  splitCombinePluginId
} from '@fastgpt/service/core/app/plugin/controller';
import { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node.d';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';

export type GetBatchPluginsBody = {
  pluginIds: string[];
};

async function handler(
  req: ApiRequestProps<GetBatchPluginsBody>,
  _res: NextApiResponse<any>
): Promise<Record<string, FlowNodeTemplateType>> {
  const { pluginIds } = req.body;

  if (!pluginIds || !Array.isArray(pluginIds) || pluginIds.length === 0) {
    return {};
  }

  // 创建一个结果对象
  const result: Record<string, FlowNodeTemplateType> = {};

  // 并行处理所有插件请求
  await Promise.all(
    pluginIds.map(async (pluginId) => {
      try {
        const { source } = await splitCombinePluginId(pluginId);

        if (source === PluginSourceEnum.personal) {
          await authApp({ req, authToken: true, appId: pluginId, per: ReadPermissionVal });
        }

        const pluginData = await getChildAppPreviewNode({ id: pluginId });
        result[pluginId] = pluginData;
      } catch (error) {
        console.error(`Error fetching plugin ${pluginId}:`, error);
        // 可以选择在结果中标记错误，或者跳过这个插件
      }
    })
  );

  return result;
}

export default NextAPI(handler);
