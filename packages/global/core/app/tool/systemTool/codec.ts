import type { LangEnum } from '../../../../common/i18n/type';
import { parseI18nString } from '../../../../common/i18n/utils';
import type { ToolListItemType } from '../../../../sdk/fastgpt-plugin';
import type { SystemPluginToolCollectionType } from '../../../plugin/tool/type';
import { PluginStatusEnum } from '../../../plugin/type';
import type { SystemToolListItemType } from './type';

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
      source: 'system',
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
      etag: tool.etag,
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
  }
};
