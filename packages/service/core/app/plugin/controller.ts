import { type FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node.d';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  appData2FlowNodeIO,
  parseI18nString,
  pluginData2FlowNodeIO,
  toolData2FlowNodeIO,
  toolSetData2FlowNodeIO
} from '@fastgpt/global/core/workflow/utils';
import { cloneDeep } from 'lodash';
import { MongoApp } from '../schema';
import type { localeType } from '@fastgpt/global/core/workflow/type';
import { type SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';
import { getSystemPluginTemplates } from '../../../../plugins/register';
import {
  checkIsLatestVersion,
  getAppLatestVersion,
  getAppVersionById
} from '../version/controller';
import { type PluginRuntimeType } from '@fastgpt/global/core/plugin/type';
import { MongoSystemPlugin } from './systemPluginSchema';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { Types } from 'mongoose';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';

/*
  plugin id rule:
  - personal: id
  - commercial: commercial-id
  - systemtool: systemTool-id
  (deprecated) community: community-id
*/
export function splitCombineToolId(id: string) {
  const splitRes = id.split('-');
  if (splitRes.length === 1) {
    // app id
    return {
      source: PluginSourceEnum.personal,
      pluginId: id
    };
  }

  const [source, pluginId] = id.split('-') as [PluginSourceEnum, string | undefined];
  if (!source || !pluginId) throw new Error('pluginId not found');
  if (source === 'community') {
    return { source: PluginSourceEnum.systemTool, pluginId: id };
  }
  return { source, pluginId: id };
}

type ChildAppType = SystemPluginTemplateItemType & {
  teamId?: string;
  tmbId?: string;
  inputs?: FlowNodeInputItemType[];
  outputs?: FlowNodeOutputItemType[];
};

const getSystemPluginTemplateById = async (
  pluginId: string,
  versionId?: string
): Promise<ChildAppType> => {
  const items = getSystemPluginTemplates();
  const item = getSystemPluginTemplates().find((plugin) => plugin.id === pluginId);
  if (!item) return Promise.reject(PluginErrEnum.unExist);

  const plugin = cloneDeep(item);

  if (plugin.associatedPluginId) {
    // The verification plugin is set as a system plugin
    const systemPlugin = await MongoSystemPlugin.findOne(
      { pluginId: plugin.id, 'customConfig.associatedPluginId': plugin.associatedPluginId },
      'associatedPluginId'
    ).lean();
    if (!systemPlugin) return Promise.reject(PluginErrEnum.unExist);

    const app = await MongoApp.findById(plugin.associatedPluginId).lean();
    if (!app) return Promise.reject(PluginErrEnum.unExist);

    const version = versionId
      ? await getAppVersionById({
          appId: plugin.associatedPluginId,
          versionId,
          app
        })
      : await getAppLatestVersion(plugin.associatedPluginId, app);
    if (!version.versionId) return Promise.reject('App version not found');
    const isLatest = version.versionId
      ? await checkIsLatestVersion({
          appId: plugin.associatedPluginId,
          versionId: version.versionId
        })
      : true;

    return {
      ...plugin,
      workflow: {
        nodes: version.nodes,
        edges: version.edges,
        chatConfig: version.chatConfig
      },
      version: versionId ? version?.versionId : '',
      versionLabel: version?.versionName,
      isLatestVersion: isLatest,
      teamId: String(app.teamId),
      tmbId: String(app.tmbId)
    };
  }

  return {
    ...plugin,
    version: undefined,
    isLatestVersion: true
  };
};

/* Format plugin to workflow preview node data */
export async function getChildAppPreviewNode({
  appId,
  versionId,
  lang = 'zh-CN'
}: {
  appId: string;
  versionId?: string;
  lang?: localeType;
}): Promise<FlowNodeTemplateType> {
  const { source, pluginId } = splitCombineToolId(appId);
  const app: ChildAppType = await (async () => {
    if (source === PluginSourceEnum.personal) {
      const item = await MongoApp.findById(appId).lean();
      if (!item) return Promise.reject(PluginErrEnum.unExist);

      const version = await getAppVersionById({ appId, versionId, app: item });

      const isLatest =
        version.versionId && Types.ObjectId.isValid(version.versionId)
          ? await checkIsLatestVersion({
              appId,
              versionId: version.versionId
            })
          : true;

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

        version: versionId ? version?.versionId : '',
        versionLabel: version?.versionName,
        isLatestVersion: isLatest,

        originCost: 0,
        currentCost: 0,
        hasTokenFee: false,
        pluginOrder: 0
      } as ChildAppType;
    } else {
      return getSystemPluginTemplateById(pluginId, versionId);
    }
  })();

  const isSystemTool = source === PluginSourceEnum.systemTool;

  const isPlugin = !!app.workflow.nodes.find(
    (node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput
  );

  const isTool =
    !!app.workflow.nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.tool) &&
    app.workflow.nodes.length === 1;

  const isToolSet =
    !!app.workflow.nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.toolSet) &&
    app.workflow.nodes.length === 1;

  const { flowNodeType, nodeIOConfig } = (() => {
    if (isToolSet)
      return {
        flowNodeType: FlowNodeTypeEnum.toolSet,
        nodeIOConfig: toolSetData2FlowNodeIO({ nodes: app.workflow.nodes })
      };
    if (isTool)
      return {
        flowNodeType: FlowNodeTypeEnum.tool,
        nodeIOConfig: toolData2FlowNodeIO({ nodes: app.workflow.nodes })
      };
    if (isPlugin)
      return {
        flowNodeType: FlowNodeTypeEnum.pluginModule,
        nodeIOConfig: pluginData2FlowNodeIO({ nodes: app.workflow.nodes })
      };
    if (isSystemTool)
      return {
        flowNodeType: FlowNodeTypeEnum.tool,
        nodeIOConfig: {
          inputs: app.inputs!,
          outputs: app.outputs!,
          toolConfig: {
            systemToolConfig: {
              toolId: app.id
            }
          }
        }
      };
    return {
      flowNodeType: FlowNodeTypeEnum.appModule,
      nodeIOConfig: appData2FlowNodeIO({ chatConfig: app.workflow.chatConfig })
    };
  })();

  return {
    id: getNanoid(),
    pluginId: app.id,
    templateType: app.templateType,
    flowNodeType,
    avatar: app.avatar,
    name: parseI18nString(app.name, lang),
    intro: parseI18nString(app.intro, lang),
    courseUrl: app.courseUrl,
    userGuide: app.userGuide,
    showStatus: app.showStatus,
    isTool: true,

    version: app.version,
    versionLabel: app.versionLabel,
    isLatestVersion: app.isLatestVersion,

    ...nodeIOConfig
  };
}

/*
  Get runtime plugin data
  System plugin: plugin id
  Personal plugin: Version id
*/
export async function getChildAppRuntimeById(
  id: string,
  versionId?: string,
  lang: localeType = 'zh-CN'
): Promise<PluginRuntimeType> {
  const app = await (async () => {
    const { source, pluginId } = splitCombineToolId(id);

    if (source === PluginSourceEnum.personal) {
      const item = await MongoApp.findById(id).lean();
      if (!item) return Promise.reject(PluginErrEnum.unExist);

      const version = await getAppVersionById({
        appId: id,
        versionId,
        app: item
      });

      return {
        id: String(item._id),
        teamId: String(item.teamId),
        tmbId: String(item.tmbId),
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

        originCost: 0,
        currentCost: 0,
        hasTokenFee: false,
        pluginOrder: 0
      };
    } else {
      // System
      return getSystemPluginTemplateById(pluginId, versionId);
    }
  })();

  return {
    id: app.id,
    teamId: app.teamId,
    tmbId: app.tmbId,
    name: parseI18nString(app.name, lang),
    avatar: parseI18nString(app.avatar, lang),
    showStatus: app.showStatus,
    currentCost: app.currentCost,
    nodes: app.workflow.nodes,
    edges: app.workflow.edges,
    hasTokenFee: app.hasTokenFee
  };
}
