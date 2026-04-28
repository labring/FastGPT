import type { localeType } from '@fastgpt/global/common/i18n/type';
import { getToolRawId } from '@fastgpt/global/core/app/tool/utils';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { SystemToolCodec } from '@fastgpt/global/core/app/tool/systemTool/codec';
import { SystemToolRepo } from './systemTool/systemTool.repo';

/**
 * 系统工具详情转为 mToolNodeType 类型
 */
// const getSystemToolByIdAndVersionIdNode = async ({
//   toolId,
//   version,
//   source = 'system'
// }: {
//   toolId: string;
//   version?: string;
//   source?: 'system' | string;
// }): Promise<AppToolType> => {
//   const toolDetail = getSystemToolDetail({
//     pluginId,
//     version
//   });
//   const dbTool = await MongoSystemTool.findOne({ pluginId: toolId }).lean();

//   // SystemTool with associated plugin, admin configured workflow plugin
//   if (dbTool && dbTool.customConfig && dbTool.customConfig.associatedPluginId) {
//     const associatedPluginId = dbTool.customConfig.associatedPluginId;
//     const app = await MongoApp.findById(associatedPluginId).lean();
//     if (!app) return Promise.reject(PluginErrEnum.unExist);

//     const appVersion = version
//       ? await getAppVersionById({
//           appId: associatedPluginId,
//           versionId: version,
//           app
//         })
//       : await getAppLatestVersion(associatedPluginId, app);

//     if (!appVersion.versionId) return Promise.reject(new UserError('App version not found'));
//     const isLatest = appVersion.versionId
//       ? await checkIsLatestVersion({
//           appId: associatedPluginId,
//           versionId: appVersion.versionId
//         })
//       : true;

//     return {
//       id: toolId,
//       ...dbTool.customConfig,
//       workflow: {
//         nodes: appVersion.nodes,
//         edges: appVersion.edges,
//         chatConfig: appVersion.chatConfig
//       },
//       version: version ? appVersion?.versionId : '',
//       versionLabel: appVersion?.versionName,
//       isLatestVersion: isLatest,
//       teamId: String(app.teamId),
//       tmbId: String(app.tmbId)
//     } satisfies AppToolType;
//   }

//   // System tool

//   const tool = await pluginClient.getPlugin({
//     pluginId: getToolRawId(toolId),
//     version,
//     source
//   });

//   return SystemToolCodec.fromPluginToAppToolTemplateItemType(tool, dbTool);
// };

/**
 * 获得工具的 Template 类型供工作流渲染
 */
export async function getToolPreviewNode({
  pluginId,
  versionId,
  lang = 'en',
  source: toolSource = 'system'
}: {
  pluginId: string;
  versionId?: string;
  lang?: localeType;
  source?: string;
}): Promise<FlowNodeTemplateType> {
  // const { source, pluginId } = splitCombineToolId(appId);

  const systemToolRepo = SystemToolRepo.getInstance();
  const toolDetail = await systemToolRepo.getSystemToolDetail({
    pluginId: getToolRawId(pluginId),
    version: versionId,
    lang,
    source: toolSource
  });
  return SystemToolCodec.fromToolDetailToFlowNodeTemplateType(toolDetail);
}
