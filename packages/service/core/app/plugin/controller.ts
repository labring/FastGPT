import { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node.d';
import { FlowNodeTypeEnum, defaultNodeVersion } from '@fastgpt/global/core/workflow/node/constant';
import { appData2FlowNodeIO, pluginData2FlowNodeIO } from '@fastgpt/global/core/workflow/utils';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import type { PluginRuntimeType } from '@fastgpt/global/core/workflow/runtime/type';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { getHandleConfig } from '@fastgpt/global/core/workflow/template/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { cloneDeep } from 'lodash';
import { MongoApp } from '../schema';
import { SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';
import { getSystemPluginTemplates } from '../../../../plugins/register';

/* 
  plugin id rule:
  personal: id
  community: community-id
  commercial: commercial-id
*/

export async function splitCombinePluginId(id: string) {
  const splitRes = id.split('-');
  if (splitRes.length === 1) {
    // app id
    return {
      source: PluginSourceEnum.personal,
      pluginId: id
    };
  }

  const [source, pluginId] = id.split('-') as [PluginSourceEnum, string];
  if (!source || !pluginId) return Promise.reject('pluginId not found');

  return { source, pluginId: id };
}

const getPluginTemplateById = async (
  id: string
): Promise<SystemPluginTemplateItemType & { teamId?: string }> => {
  const { source, pluginId } = await splitCombinePluginId(id);

  if (source === PluginSourceEnum.personal) {
    const item = await MongoApp.findById(id).lean();
    if (!item) return Promise.reject('plugin not found');

    return {
      id: String(item._id),
      teamId: String(item.teamId),
      name: item.name,
      avatar: item.avatar,
      intro: item.intro,
      showStatus: true,
      workflow: {
        nodes: item.modules,
        edges: item.edges,
        chatConfig: item.chatConfig
      },
      templateType: FlowNodeTemplateTypeEnum.teamApp,
      version: item?.pluginData?.nodeVersion || defaultNodeVersion,
      originCost: 0,
      currentCost: 0
    };
  } else {
    const item = getSystemPluginTemplates().find((plugin) => plugin.id === pluginId);
    if (!item) return Promise.reject('plugin not found');

    return cloneDeep(item);
  }
};

/* format plugin modules to plugin preview module */
export async function getPluginPreviewNode({ id }: { id: string }): Promise<FlowNodeTemplateType> {
  const plugin = await getPluginTemplateById(id);
  const isPlugin = !!plugin.workflow.nodes.find(
    (node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput
  );

  return {
    id: getNanoid(),
    pluginId: plugin.id,
    templateType: plugin.templateType,
    flowNodeType: isPlugin ? FlowNodeTypeEnum.pluginModule : FlowNodeTypeEnum.appModule,
    avatar: plugin.avatar,
    name: plugin.name,
    intro: plugin.intro,
    inputExplanationUrl: plugin.inputExplanationUrl,
    showStatus: plugin.showStatus,
    isTool: isPlugin,
    version: plugin.version,
    sourceHandle: getHandleConfig(true, true, true, true),
    targetHandle: getHandleConfig(true, true, true, true),
    ...(isPlugin
      ? pluginData2FlowNodeIO({ nodes: plugin.workflow.nodes })
      : appData2FlowNodeIO({ chatConfig: plugin.workflow.chatConfig }))
  };
}

/* run plugin time */
export async function getPluginRuntimeById(id: string): Promise<PluginRuntimeType> {
  const plugin = await getPluginTemplateById(id);

  return {
    id: plugin.id,
    teamId: plugin.teamId,
    name: plugin.name,
    avatar: plugin.avatar,
    showStatus: plugin.showStatus,
    currentCost: plugin.currentCost,
    nodes: plugin.workflow.nodes,
    edges: plugin.workflow.edges
  };
}
