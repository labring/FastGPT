import { LangEnum } from '../../../../common/i18n/type';
import { parseI18nString } from '../../../../common/i18n/utils';
import { getNanoid } from '../../../../common/string/tools';
import { ToolListItemType } from '../../../../sdk/fastgpt-plugin';
import { SystemPluginToolCollectionType } from '../../../plugin/tool/type';
import { PluginStatusEnum } from '../../../plugin/type';
import { FlowNodeTypeEnum, FlowNodeOutputTypeEnum } from '../../../workflow/node/constant';
import { Output_Template_Error_Message } from '../../../workflow/template/output';
import { FlowNodeTemplateType } from '../../../workflow/type/node';
import { SystemToolListItemType, SystemToolDetailType } from '../type';

export const SystemToolCodec = {
  getDBPluginId: (pluginId: string) => `systemTool-${pluginId}`,
  getPluginIdFromDB: (dbPluginId: string) => dbPluginId.replace(/^systemTool-/, ''),

  fromDBTypeToListItemType(item: SystemPluginToolCollectionType): SystemToolListItemType {
    const {
      name,
      avatar,
      intro,
      toolDescription,
      version,
      userGuide,
      author = '',
      tags
    } = item.customConfig!;

    return {
      id: item.pluginId,
      version,
      status: item.status ?? PluginStatusEnum.Normal,
      author,
      name,
      avatar: avatar ?? '',
      intro: intro ?? '',
      tags: tags ?? [],
      currentCost: item.currentCost ?? 0,
      hasTokenFee: item.hasTokenFee ?? false,
      pluginOrder: item.pluginOrder,
      userGuide,
      // 数据库内配置的 system tool 一定没有 system secret
      hasSystemSecret: false,
      systemKeyCost: 0,
      // 数据库里面取出来的一定不是 toolset
      isToolSet: false,
      toolDescription: toolDescription ?? intro ?? '',
      hideTags: item.hideTags ?? [],
      promoteTags: item.promoteTags ?? []
      // TODO: 不知道谁做落了，之后再补吧
      // courseUrl: '',

      // readmeURL 没有
      // readmeUrl: ''
    };
  },

  attachToolConfig({
    tool,
    config,
    lang
  }: {
    tool: ToolListItemType;
    config?: SystemPluginToolCollectionType;
    lang?: `${LangEnum}`;
  }): SystemToolListItemType {
    return {
      id: this.getDBPluginId(tool.pluginId),
      author: tool.author ?? global.feConfigs.systemTitle ?? '',
      avatar: tool.icon,
      currentCost: config?.currentCost ?? 0,
      hasSystemSecret: !!(config?.secretsVal ?? config?.inputListVal),
      hasTokenFee: config?.hasTokenFee ?? false,
      intro: parseI18nString(tool.description, lang),
      isToolSet: !!tool.children && tool.children.length > 0,
      name: parseI18nString(tool.name, lang),
      status: config?.status ?? PluginStatusEnum.Normal,
      systemKeyCost: config?.systemKeyCost ?? 0,
      tags: config?.customConfig?.tags ?? tool.tags ?? [],
      toolDescription: config?.customConfig?.toolDescription ?? tool.toolDescription ?? '',
      version: tool.version,
      courseUrl: tool.tutorialUrl,
      hideTags: config?.hideTags ?? [],
      promoteTags: config?.promoteTags ?? [],
      pluginOrder: config?.pluginOrder ?? 0,
      readmeUrl: tool.readmeUrl,
      source: tool.source,
      userGuide: config?.customConfig?.userGuide
    };
  },

  fromToolDetailToFlowNodeTemplateType(item: SystemToolDetailType): FlowNodeTemplateType {
    // return {
    //   id: getNanoid(),
    //   name: item.name,
    //   avatar: item.avatar,
    //   courseUrl: item.courseUrl,
    //   inputs: item.inputs,
    //   outputs: item.outputs
    // };
    return {
      id: getNanoid(),
      pluginId: item.id,
      flowNodeType: item.isToolSet ? FlowNodeTypeEnum.toolSet : FlowNodeTypeEnum.tool,
      avatar: item.avatar,
      name: item.name,
      intro: item.intro,
      toolDescription: item.toolDescription,
      courseUrl: item.courseUrl,
      userGuide: item.userGuide,
      showStatus: true,
      isTool: true,
      catchError: false,

      version: item.version,
      versionLabel: item.version,
      isLatestVersion: item.isLatestVersion,
      showSourceHandle: true,
      showTargetHandle: true,

      currentCost: item.currentCost,
      systemKeyCost: item.systemKeyCost,
      hasTokenFee: item.hasTokenFee,
      hasSystemSecret: item.hasSystemSecret,
      isFolder: item.isToolSet,
      status: item.status,
      inputs: item.inputs,

      // ...nodeIOConfig,
      outputs: item.outputs.some((item) => item.type === FlowNodeOutputTypeEnum.error)
        ? item.outputs
        : [...item.outputs, Output_Template_Error_Message]
    };
  }
};
