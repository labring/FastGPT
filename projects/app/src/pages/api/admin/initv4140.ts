import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoPluginTag } from '@fastgpt/service/core/app/plugin/pluginTagSchema';
import { MongoSystemPlugin } from '@fastgpt/service/core/app/plugin/systemPluginSchema';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoToolGroups } from '@fastgpt/service/core/app/plugin/pluginGroupSchema';

/**
 * 初始化 v4.14.0 版本数据迁移脚本
 *
 * 迁移内容:
 * 1. app_plugin_groups → app_plugin_tags (扁平化 group 和 groupTypes)
 * 2. plugin.templateType → plugin.pluginTags
 * 3. plugin.isActive → plugin.status
 * 4. 添加 plugin.defaultInstalled 字段
 */
async function handler(req: ApiRequestProps<any, any>, res: ApiResponseType<any>) {
  await authCert({ req, authRoot: true });

  addLog.info('[initv4140] 开始执行 v4.14.0 数据迁移');

  try {
    const { migratedCount, typeToGroupMap } = await migrateGroupsToTags();
    const updatedPluginsCount = await migratePluginData(typeToGroupMap);

    addLog.info(`[initv4140] 迁移完成: ${migratedCount} 个标签, ${updatedPluginsCount} 个插件`);

    return {
      success: true,
      message: `迁移完成: ${migratedCount} 个标签, ${updatedPluginsCount} 个插件`,
      migratedCount,
      updatedPluginsCount
    };
  } catch (error) {
    addLog.error('[initv4140] 迁移失败:', error);
    throw error;
  }
}

/**
 * 从 app_plugin_groups 迁移数据到 app_plugin_tags
 */
async function migrateGroupsToTags(): Promise<{
  migratedCount: number;
  typeToGroupMap: Map<string, string>;
}> {
  const groups = await MongoToolGroups.find().sort({ groupOrder: 1 }).lean();

  if (!groups.length) {
    addLog.warn('[initv4140] 无分组数据，跳过迁移');
    return { migratedCount: 0, typeToGroupMap: new Map() };
  }

  await MongoPluginTag.deleteMany({});

  const tags: Array<{ tagId: string; tagName: any; tagOrder: number }> = [];
  const typeToGroupMap = new Map<string, string>();
  let order = 0;

  for (const group of groups) {
    // systemPlugin 分组本身不迁移，但其下的 types 要迁移
    if (group.groupId !== 'systemPlugin') {
      tags.push({ tagId: group.groupId, tagName: group.groupName, tagOrder: order++ });
    }

    // 迁移所有 types
    group.groupTypes.forEach((type) => {
      tags.push({ tagId: type.typeId, tagName: type.typeName, tagOrder: order++ });
      typeToGroupMap.set(type.typeId, group.groupId);
    });
  }

  // 去重并插入
  const uniqueTags = Array.from(new Map(tags.map((tag) => [tag.tagId, tag])).values());

  if (uniqueTags.length) {
    await MongoPluginTag.insertMany(uniqueTags);
    addLog.info(`[initv4140] 已迁移 ${uniqueTags.length} 个标签`);
  }

  return { migratedCount: uniqueTags.length, typeToGroupMap };
}

/**
 * 迁移插件数据：templateType → pluginTags, isActive → status
 */
async function migratePluginData(typeToGroupMap: Map<string, string>): Promise<number> {
  const plugins = await MongoSystemPlugin.find({}).lean();

  if (!plugins.length) {
    addLog.warn('[initv4140] 无插件数据，跳过迁移');
    return 0;
  }

  let updatedCount = 0;

  for (const plugin of plugins) {
    const updateFields: any = {};
    const unsetFields: any = {};

    // 迁移 templateType → pluginTags
    const templateType = plugin.customConfig?.templateType;
    if (templateType) {
      const groupId = typeToGroupMap.get(templateType);
      updateFields['customConfig.pluginTags'] = groupId ? [groupId, templateType] : [templateType];
      unsetFields['customConfig.templateType'] = '';
    }

    // 迁移 isActive → status
    if (plugin.status === undefined || plugin.status === null) {
      updateFields.status = plugin.isActive === false ? 0 : 1;
    }

    // 添加 defaultInstalled
    if (plugin.defaultInstalled === undefined || plugin.defaultInstalled === null) {
      updateFields.defaultInstalled = true;
    }

    // 删除 isActive 字段
    if (plugin.isActive !== undefined) {
      unsetFields.isActive = '';
    }

    // 批量更新
    if (Object.keys(updateFields).length || Object.keys(unsetFields).length) {
      const updateOps: any = {};
      if (Object.keys(updateFields).length) updateOps.$set = updateFields;
      if (Object.keys(unsetFields).length) updateOps.$unset = unsetFields;

      await MongoSystemPlugin.updateOne({ pluginId: plugin.pluginId }, updateOps);
      updatedCount++;
    }
  }

  addLog.info(`[initv4140] 已更新 ${updatedCount} 个插件`);
  return updatedCount;
}

export default NextAPI(handler);
