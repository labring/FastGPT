import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoToolGroups } from '@fastgpt/service/core/plugin/tool/pluginGroupSchema';
import { connectionMongo } from '@fastgpt/service/common/mongo/index';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import { refreshVersionKey } from '@fastgpt/service/common/cache';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';

const { Schema } = connectionMongo;

/**
  表迁移（直接读取信息，然后复制过去）
  1. fastgpt_plugins -> system_plugins （新表是空的，不会有任何数据，可以忽略操作）
  2. app_system_plugins -> system_plugin_tools
  数据迁移
  1. app_plugin_groups 里的数据，当做一个 tag 加到 system_plugin_tool_tags 里
  2. system_plugin_tools:
    1. isActive -> status
    2. templateType -> tags
    3. defaultInstalled: false
 */
async function handler(req: ApiRequestProps<any, any>, res: ApiResponseType<any>) {
  await authCert({ req, authRoot: true });

  addLog.info('[initv4140] 开始执行 v4.14.0 数据迁移');

  try {
    // 1. 迁移 group 到 tags 里
    const { migratedCount, typeToGroupMap } = await migrateGroupsToTags();
    // 2. 把 app_system_plugins 的数据迁移到 system_plugin_tools 里
    const migratedToolsCount = await migrateSystemPluginsToTools(typeToGroupMap);

    await refreshVersionKey(SystemCacheKeyEnum.systemTool);

    return {
      success: true,
      message: `迁移完成: ${migratedCount} 个标签, ${migratedToolsCount} 个工具`,
      migratedCount,
      migratedToolsCount
    };
  } catch (error) {
    addLog.error('[initv4140] 迁移失败:', error);
    throw error;
  }
}

/**
 * 从 app_plugin_groups 迁移数据到 system_plugin_tool_tags
 * 原表不做修改,只读取数据并写入新表
 */
async function migrateGroupsToTags(): Promise<{
  migratedCount: number;
  typeToGroupMap: Map<string, string>;
}> {
  const groups = await MongoToolGroups.find().sort({ groupOrder: 1 }).lean();

  if (!groups.length) {
    addLog.warn('[initv4140] app_plugin_groups 无数据，跳过迁移');
    return { migratedCount: 0, typeToGroupMap: new Map() };
  }

  // 构建标签数据和映射关系
  const tags: Array<{ tagId: string; tagName: any; tagOrder: number; isSystem: boolean }> = [];
  const typeToGroupMap = new Map<string, string>();
  let order = 0;

  for (const group of groups) {
    const isSystemGroup = group.groupId === 'systemPlugin';

    // systemPlugin 分组本身不迁移，但其下的 types 要迁移
    if (!isSystemGroup) {
      tags.push({
        tagId: group.groupId,
        tagName: group.groupName,
        tagOrder: order++,
        isSystem: false
      });
    }

    group.groupTypes.forEach((type: { typeId: string; typeName: any }) => {
      tags.push({
        tagId: type.typeId,
        tagName: type.typeName,
        tagOrder: order++,
        isSystem: isSystemGroup
      });
      typeToGroupMap.set(type.typeId, group.groupId);
    });
  }

  // 去重(基于 tagId)
  const uniqueTags = Array.from(new Map(tags.map((tag) => [tag.tagId, tag])).values());

  // 查询目标表中已存在的 tagId
  const existingTagIds = await MongoPluginToolTag.distinct('tagId');
  const existingTagIdSet = new Set(existingTagIds);

  // 过滤掉已存在的标签
  const tagsToInsert = uniqueTags.filter((tag) => !existingTagIdSet.has(tag.tagId));

  // 插入新标签
  if (tagsToInsert.length > 0) {
    for (const tag of tagsToInsert) {
      await MongoPluginToolTag.updateOne(
        {
          tagId: tag.tagId
        },
        tag,
        {
          upsert: true
        }
      );
    }
    addLog.info(
      `[initv4140] 标签迁移: 源表 ${uniqueTags.length} 条, 已存在 ${existingTagIds.length} 条, 成功插入 ${tagsToInsert.length} 条`
    );
  } else {
    addLog.info(
      `[initv4140] 标签迁移: 源表 ${uniqueTags.length} 条, 已存在 ${existingTagIds.length} 条, 无需插入新数据`
    );
  }

  return { migratedCount: tagsToInsert.length, typeToGroupMap };
}

/**
 * 从 app_system_plugins 迁移数据到 system_plugin_tools
 * 原表不做修改,只读取数据并写入新表
 * 字段映射: pluginId → toolId, templateType → toolTags, isActive → status
 */
async function migrateSystemPluginsToTools(typeToGroupMap: Map<string, string>): Promise<number> {
  // 1. 获取旧表的 Model (app_system_plugins)
  const OldSystemPluginSchema = new Schema(
    {
      pluginId: String,
      status: Number,
      originCost: Number,
      currentCost: Number,
      hasTokenFee: Boolean,
      pluginOrder: Number,
      systemKeyCost: Number,
      customConfig: Object,
      inputListVal: Object,
      inputConfig: Array,
      isActive: Boolean
    },
    { strict: false }
  );

  const MongoOldSystemPlugin = connectionMongo.connection.model(
    'app_system_plugins_temp',
    OldSystemPluginSchema,
    'app_system_plugins'
  );

  // 2. 从旧表读取数据
  const oldPlugins = await MongoOldSystemPlugin.find({}).lean();

  if (!oldPlugins.length) {
    addLog.warn('[initv4140] app_system_plugins 无数据，跳过迁移');
    return 0;
  }

  // 3. 转换数据
  const newTools = [];

  for (const plugin of oldPlugins) {
    const newTool: any = {
      pluginId: plugin.pluginId?.startsWith(AppToolSourceEnum.community)
        ? plugin.pluginId.replace(AppToolSourceEnum.community, AppToolSourceEnum.systemTool)
        : plugin.pluginId,
      status: plugin.isActive === false ? PluginStatusEnum.Offline : PluginStatusEnum.Normal,
      defaultInstalled: false,
      originCost: plugin.originCost || 0,
      currentCost: plugin.currentCost || 0,
      hasTokenFee: plugin.hasTokenFee || false,
      pluginOrder: plugin.pluginOrder,
      systemKeyCost: plugin.systemKeyCost || 0,
      customConfig: plugin.customConfig ? { ...plugin.customConfig } : {},
      inputListVal: plugin.inputListVal
    };

    // 迁移 templateType → tags
    // @ts-ignore
    const templateType = plugin.customConfig?.templateType;
    if (templateType) {
      const groupId = typeToGroupMap.get(templateType);
      // 对于 systemPlugin 分组,只保留 templateType,不包含 groupId
      newTool.customConfig.tags =
        groupId && groupId !== 'systemPlugin' ? [groupId, templateType] : [templateType];
      delete newTool.customConfig.templateType;
    }

    newTools.push(newTool);
  }

  // 5. 批量插入新工具到新表
  if (newTools.length > 0) {
    for (const tool of newTools) {
      await MongoSystemTool.updateOne({ pluginId: tool.pluginId }, tool, {
        upsert: true
      });
    }
    addLog.info(`[initv4140] 工具迁移: 源表 ${newTools.length} 条`);
  } else {
    addLog.info(`[initv4140] 工具迁移: 源表 ${newTools.length} 条, 无需插入新数据`);
  }

  return newTools.length;
}

export default NextAPI(handler);
