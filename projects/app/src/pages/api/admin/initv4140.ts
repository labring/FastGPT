import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoPluginToolTag } from '@fastgpt/service/core/plugin/tool/tagSchema';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoToolGroups } from '@fastgpt/service/core/plugin/tool/pluginGroupSchema';
import { MongoTeamInstalledPlugin } from '@fastgpt/service/core/plugin/schema/teamInstalledPluginSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { connectionMongo } from '@fastgpt/service/common/mongo/index';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';

const { Schema } = connectionMongo;

/**
 * 1. app_system_plugins → system_plugin_tools
 * 2. app_plugin_groups → system_plugin_tool_tags
 * 3. team_installed_plugins
 */
async function handler(req: ApiRequestProps<any, any>, res: ApiResponseType<any>) {
  await authCert({ req, authRoot: true });

  addLog.info('[initv4140] 开始执行 v4.14.0 数据迁移');

  try {
    const { migratedCount, typeToGroupMap } = await migrateGroupsToTags();
    const migratedToolsCount = await migrateSystemPluginsToTools(typeToGroupMap);
    const installedRecordsCount = await createTeamInstalledRecords();

    addLog.info(
      `[initv4140] 迁移完成: ${migratedCount} 个标签, ${migratedToolsCount} 个工具, ${installedRecordsCount} 条安装记录`
    );

    return {
      success: true,
      message: `迁移完成: ${migratedCount} 个标签, ${migratedToolsCount} 个工具, ${installedRecordsCount} 条安装记录`,
      migratedCount,
      migratedToolsCount,
      installedRecordsCount
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
    // systemPlugin 分组本身不迁移，但其下的 types 要迁移
    if (group.groupId !== 'systemPlugin') {
      tags.push({
        tagId: group.groupId,
        tagName: group.groupName,
        tagOrder: order++,
        isSystem: true
      });
    }

    // 迁移所有 types
    group.groupTypes.forEach((type) => {
      tags.push({
        tagId: type.typeId,
        tagName: type.typeName,
        tagOrder: order++,
        isSystem: true
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
    await MongoPluginToolTag.insertMany(tagsToInsert);
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
      originCost: plugin.originCost || 0,
      currentCost: plugin.currentCost || 0,
      hasTokenFee: plugin.hasTokenFee || false,
      pluginOrder: plugin.pluginOrder,
      systemKeyCost: plugin.systemKeyCost || 0,
      customConfig: plugin.customConfig ? { ...plugin.customConfig } : {},
      inputListVal: plugin.inputListVal || {}
    };

    // 迁移 templateType → toolTags
    // @ts-ignore
    const templateType = plugin.customConfig?.templateType;
    if (templateType) {
      const groupId = typeToGroupMap.get(templateType);
      // 对于 systemPlugin 分组,只保留 templateType,不包含 groupId
      newTool.customConfig.toolTags =
        groupId && groupId !== 'systemPlugin' ? [groupId, templateType] : [templateType];
      delete newTool.customConfig.templateType;
    }

    // 迁移 isActive → status
    newTool.status = !plugin.isActive ? PluginStatusEnum.Offline : PluginStatusEnum.Normal;
    // 添加 defaultInstalled 字段
    newTool.defaultInstalled = false;

    newTools.push(newTool);
  }

  // 4. 查询目标表中已存在的 toolId
  const db = connectionMongo.connection.db;
  const existingTools = await db
    ?.collection('system_plugin_tools')
    .find({}, { projection: { toolId: 1 } })
    .toArray();

  const existingToolIdSet = new Set(existingTools?.map((tool: any) => tool.toolId) || []);

  // 过滤掉已存在的工具
  const toolsToInsert = newTools.filter((tool) => !existingToolIdSet.has(tool.toolId));

  // 5. 批量插入新工具到新表
  if (toolsToInsert.length > 0) {
    await db?.collection('system_plugin_tools').insertMany(toolsToInsert);
    addLog.info(
      `[initv4140] 工具迁移: 源表 ${newTools.length} 条, 已存在 ${existingToolIdSet.size} 条, 成功插入 ${toolsToInsert.length} 条`
    );
  } else {
    addLog.info(
      `[initv4140] 工具迁移: 源表 ${newTools.length} 条, 已存在 ${existingToolIdSet.size} 条, 无需插入新数据`
    );
  }

  return toolsToInsert.length;
}

/**
 * 为所有团队和所有工具创建已安装记录
 * 从新表 system_plugin_tools 读取工具数据(使用 toolId 字段)
 */
async function createTeamInstalledRecords(): Promise<number> {
  // 获取所有团队
  const teams = await MongoTeam.find({}).lean();
  if (!teams.length) {
    addLog.warn('[initv4140] 无团队数据，跳过创建安装记录');
    return 0;
  }

  // 从新表 system_plugin_tools 获取所有工具
  const db = connectionMongo.connection.db;
  const tools = await db?.collection('system_plugin_tools').find({}).toArray();

  if (!tools?.length) {
    addLog.warn('[initv4140] system_plugin_tools 无数据，跳过创建安装记录');
    return 0;
  }

  // 查询已存在的安装记录
  const existingRecords = await MongoTeamInstalledPlugin.find(
    {},
    { teamId: 1, pluginId: 1 }
  ).lean();

  // 构建已存在的 teamId-pluginId 组合的 Set
  const existingRecordSet = new Set(
    existingRecords.map((record) => `${record.teamId}-${record.pluginId}`)
  );

  // 为每个团队和每个工具创建安装记录
  // 注意: team_installed_plugins 表的 pluginId 字段将存储新表的 toolId 值
  const installedRecords = [];
  for (const team of teams) {
    for (const tool of tools) {
      const toolId = tool.pluginId;
      const recordKey = `${team._id}-${toolId}`;

      // 跳过已存在的记录
      if (!existingRecordSet.has(recordKey)) {
        installedRecords.push({
          teamId: team._id,
          pluginType: 'tool',
          pluginId: tool.pluginId,
          installed: true
        });
      }
    }
  }

  // 批量插入新记录
  if (installedRecords.length > 0) {
    await MongoTeamInstalledPlugin.insertMany(installedRecords);
    addLog.info(
      `[initv4140] 安装记录创建: 应有 ${teams.length * tools.length} 条, 已存在 ${existingRecords.length} 条, 成功插入 ${installedRecords.length} 条`
    );
  } else {
    addLog.info(
      `[initv4140] 安装记录创建: 应有 ${teams.length * tools.length} 条, 已存在 ${existingRecords.length} 条, 无需插入新数据`
    );
  }

  return installedRecords.length;
}

export default NextAPI(handler);
