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
import { getAppLatestVersion, getAppVersionById } from '../version/controller';

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

type ChildAppType = SystemPluginTemplateItemType & { teamId?: string };
const getSystemPluginTemplateById = async (
  pluginId: string
): Promise<SystemPluginTemplateItemType> => {
  const item = getSystemPluginTemplates().find((plugin) => plugin.id === pluginId);
  if (!item) return Promise.reject('plugin not found');

  return cloneDeep(item);
};

/* format plugin modules to plugin preview module */
export async function getChildAppPreviewNode({
  id
}: {
  id: string;
}): Promise<FlowNodeTemplateType> {
  const app: ChildAppType = await (async () => {
    const { source, pluginId } = await splitCombinePluginId(id);

    if (source === PluginSourceEnum.personal) {
      const item = await MongoApp.findById(id).lean();
      if (!item) return Promise.reject('plugin not found');

      const version = await getAppLatestVersion(id, item);

      if (!version.versionId) return Promise.reject('App version not found');

      return {
        id: String(item._id),
        teamId: String(item.teamId),
        name: item.name,
        avatar: item.avatar,
        intro: item.intro,
        showStatus: true,
        workflow: {
          nodes: version.nodes,
          edges: version.edges,
          chatConfig: version.chatConfig
        },
        templateType: FlowNodeTemplateTypeEnum.teamApp,
        version: version.versionId,
        originCost: 0,
        currentCost: 0
      };
    } else {
      return getSystemPluginTemplateById(pluginId);
    }
  })();

  const isPlugin = !!app.workflow.nodes.find(
    (node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput
  );

  return {
    id: getNanoid(),
    pluginId: app.id,
    templateType: app.templateType,
    flowNodeType: isPlugin ? FlowNodeTypeEnum.pluginModule : FlowNodeTypeEnum.appModule,
    avatar: app.avatar,
    name: app.name,
    intro: app.intro,
    courseUrl: app.courseUrl,
    showStatus: app.showStatus,
    isTool: true,
    version: app.version,
    sourceHandle: getHandleConfig(true, true, true, true),
    targetHandle: getHandleConfig(true, true, true, true),
    ...(isPlugin
      ? pluginData2FlowNodeIO({ nodes: app.workflow.nodes })
      : appData2FlowNodeIO({ chatConfig: app.workflow.chatConfig }))
  };
}

/* 
  Get runtime plugin data
  System plugin: plugin id
  Personal plugin: Version id
*/
export async function getChildAppRuntimeById(
  id: string,
  versionId?: string
): Promise<PluginRuntimeType> {
  const app: ChildAppType = await (async () => {
    const { source, pluginId } = await splitCombinePluginId(id);

    if (source === PluginSourceEnum.personal) {
      const item = await MongoApp.findById(id).lean();
      if (!item) return Promise.reject('plugin not found');

      const version = await getAppVersionById({
        appId: id,
        versionId,
        app: item
      });

      return {
        id: String(item._id),
        teamId: String(item.teamId),
        name: item.name,
        avatar: item.avatar,
        intro: item.intro,
        showStatus: true,
        workflow: {
          nodes: version.nodes,
          edges: version.edges,
          chatConfig: version.chatConfig
        },
        templateType: FlowNodeTemplateTypeEnum.teamApp,

        // 用不到
        version: item?.pluginData?.nodeVersion || defaultNodeVersion,
        originCost: 0,
        currentCost: 0
      };
    } else {
      return getSystemPluginTemplateById(pluginId);
    }
  })();

  return {
    id: app.id,
    teamId: app.teamId,
    name: app.name,
    avatar: app.avatar,
    showStatus: app.showStatus,
    currentCost: app.currentCost,
    nodes: app.workflow.nodes,
    edges: app.workflow.edges
  };
}
