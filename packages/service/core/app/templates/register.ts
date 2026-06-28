import { isProduction } from '@fastgpt/global/common/system/constants';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { type AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { MongoAppTemplate } from './templateSchema';
import { pluginClient } from '../../../thirdProvider/fastgptPlugin';
import { addMinutes } from 'date-fns';

type PluginSystemTemplateDbConfig = Pick<AppTemplateSchemaType, 'templateId'> &
  Partial<
    Pick<
      AppTemplateSchemaType,
      | 'isActive'
      | 'isPromoted'
      | 'promoteTags'
      | 'hideTags'
      | 'recommendText'
      | 'isQuickTemplate'
      | 'order'
    >
  >;

const getFileTemplates = async (): Promise<AppTemplateSchemaType[]> => {
  return (await pluginClient.listWorkflows()) as AppTemplateSchemaType[];
};

const formatTemplateAvatar = (avatar?: string | null) => {
  if (!avatar) {
    return '';
  }

  if (avatar.startsWith('/') || avatar.startsWith('http://') || avatar.startsWith('https://')) {
    return avatar;
  }

  return `/${avatar}`;
};

/**
 * 社区模板由 fastgpt-plugin 维护内容，Mongo 只保存平台运营态配置。
 */
export const pickPluginSystemTemplateDbConfig = (config: PluginSystemTemplateDbConfig) => ({
  ...Object.fromEntries(
    Object.entries({
      isActive: config.isActive,
      isPromoted: config.isPromoted,
      promoteTags: config.promoteTags,
      hideTags: config.hideTags,
      recommendText: config.recommendText,
      isQuickTemplate: config.isQuickTemplate,
      order: config.order
    }).filter(([, value]) => value !== undefined)
  )
});

export const pluginSystemTemplateDbUnsetFields = {
  name: '',
  intro: '',
  avatar: '',
  author: '',
  tags: '',
  type: '',
  userGuide: '',
  workflow: ''
} as const;

/**
 * 提取系统模板允许由数据库覆盖的运营字段。
 *
 * 系统模板来自 plugin 服务，workflow、userGuide、type 等内容字段必须始终以 plugin 返回为准。
 * 数据库只作为展示卡片、上下线、推荐和标签等运营配置层，避免后台保存的旧 workflow 覆盖新版模板。
 */
const pickPluginSystemTemplateEditableConfig = pickPluginSystemTemplateDbConfig;

const getAppTemplates = async () => {
  const originCommunityTemplates = await getFileTemplates();
  const communityTemplates = originCommunityTemplates.map((template) => {
    return {
      ...template,
      avatar: formatTemplateAvatar(template.avatar),
      templateId: `${AppToolSourceEnum.community}-${template.templateId.split('.')[0]}`
    };
  });

  const dbTemplates = await MongoAppTemplate.find().lean();

  // Merge db data to community templates
  const communityTemplateConfig = communityTemplates.map((template) => {
    const config = dbTemplates.find((t) => t.templateId === template.templateId);

    if (config) {
      return {
        ...config,
        ...template,
        ...pickPluginSystemTemplateEditableConfig(config)
      };
    }

    return template;
  });
  const res = [
    ...communityTemplateConfig,
    ...dbTemplates.filter((t) => isCommercialTemaplte(t.templateId))
  ].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return res;
};

export const getAppTemplatesAndLoadThem = async (refresh = false) => {
  // 首次强制刷新
  if (!global.templatesRefreshTime) {
    global.templatesRefreshTime = Date.now() - 10000;
  }
  if (!global.appTemplates) {
    global.appTemplates = [];
  }

  if (
    isProduction &&
    // 有模板缓存
    global.appTemplates.length > 0 &&
    // 缓存时间未过期
    global.templatesRefreshTime > Date.now() &&
    !refresh
  ) {
    return global.appTemplates;
  }

  try {
    const appTemplates = await getAppTemplates();
    global.appTemplates = appTemplates;
    global.templatesRefreshTime = addMinutes(new Date(), 30).getTime(); // 缓存30分钟
    return appTemplates;
  } catch {
    return [];
  }
};

export const isCommercialTemaplte = (templateId: string) => {
  return templateId.startsWith(`${AppToolSourceEnum.commercial}-`);
};

/**
 * 判断模板是否来自 fastgpt-plugin 的系统模板列表。
 * 系统模板的 workflow 和 userGuide 由 plugin 服务维护，本地数据库只保存展示和上下线等覆盖配置。
 */
export const isPluginSystemTemplate = (templateId: string) => {
  return templateId.startsWith(`${AppToolSourceEnum.community}-`);
};
