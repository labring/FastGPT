import { type AppSchemaType } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { MongoApp } from './schema';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getClientToolPreviewNode } from './tool/utils/client';
import { formatToolInputSecrets } from './tool/secretConfig';
import { MongoEvaluation } from './evaluation/evalSchema';
import { removeEvaluationJob } from './evaluation/mq';
import { MongoOutLink } from '../../support/outLink/schema';
import { MongoOpenApi } from '../../support/openapi/schema';
import { MongoAppVersion } from './version/schema';
import { MongoChatInputGuide } from '../chat/inputGuide/schema';
import { MongoChatFavouriteApp } from '../chat/favouriteApp/schema';
import { MongoChatSetting } from '../chat/setting/schema';
import { resourcePermissionRepo } from '../../support/permission/repository/resourcePermissionRepo';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { removeImageByPath } from '../../common/file/image/controller';
import { MongoAppLogKeys } from './logs/logkeysSchema';
import { MongoAppChatLog } from './logs/chatLogsSchema';
import { MongoAppRegistration } from '../../support/appRegistration/schema';
import { MongoMcpKey } from '../../support/mcp/schema';
import { MongoAppRecord } from './record/schema';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { type ClientSession } from '../../common/mongo';
import { getLogger, LogCategories } from '../../common/logger';
import { deleteAppSandboxes } from '../ai/sandbox/interface/resource/sourceCleanup';
import { MongoSystemTool } from '../plugin/tool/systemToolSchema';
import { StoredSelectedDatasetSchema } from '@fastgpt/global/core/workflow/type/io';
import {
  StoredSelectedAgentSkillItemTypeSchema,
  type AppFormEditFormType
} from '@fastgpt/global/core/app/formEdit/type';
import z from 'zod';
import { nodeInputIsReference } from '@fastgpt/global/core/workflow/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { deleteChatResourcesBySource } from '../chat/delete';

const logger = getLogger(LogCategories.MODULE.APP.FOLDER);

/**
 * 在更新应用前，对工作流节点数据进行格式化和安全处理。
 * 主要职责：
 * 1. 知识库：移除编辑态状态并保留展示快照（datasetId, avatar, name, vectorModel）。
 * 2. Skill: 移除编辑态状态并保留展示快照（skillId, avatar, name, description）。
 * 3. 密钥输入：清理敏感信息。
 */
export const beforeUpdateAppFormat = async ({
  nodes,
  teamId
}: {
  nodes?: StoreNodeItemType[];
  teamId?: string;
}) => {
  if (!nodes) return;

  /**
   * 格式化数据集选择值，保存阶段保留展示快照（datasetId, avatar, name, vectorModel），移除编辑态临时字段。
   * 引用模式由调用处判断并跳过，避免把 [nodeId, key] 误压缩成空数组。
   * 未配置的草稿节点按空数组保存，仍由发布/运行前的工作流校验提示必填。
   * 兼容历史单选格式 { datasetId }，避免旧应用再次保存时丢失知识库配置。
   */
  const formatDatasetSelectValue = (value: unknown) => {
    if (value === undefined || value === null) return [];

    const datasets = z
      .union([StoredSelectedDatasetSchema, z.array(StoredSelectedDatasetSchema)])
      .parse(value);

    const datasetList = Array.isArray(datasets) ? datasets : [datasets];
    return datasetList.map(({ datasetId, avatar, name, vectorModel }) => ({
      datasetId,
      ...(avatar ? { avatar } : {}),
      ...(name ? { name } : {}),
      ...(vectorModel ? { vectorModel } : {})
    }));
  };

  nodes.forEach((node) => {
    const isDatasetNode =
      node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode ||
      node.flowNodeType === FlowNodeTypeEnum.agent;

    // Format header secret
    node.inputs.forEach((input) => {
      formatToolInputSecrets({ inputs: [input] });
      if (nodeInputIsReference(input)) return;
      // 知识库
      if (isDatasetNode) {
        // Agent
        if (input.key === NodeInputKeyEnum.datasetSelectList) {
          input.value = formatDatasetSelectValue(input.value);
        }
        // workflow
        if (input.key === NodeInputKeyEnum.datasetParams) {
          const datasetParams = input.value as AppFormEditFormType['dataset'] | undefined;
          if (datasetParams?.datasets) {
            input.value = {
              ...datasetParams,
              datasets: formatDatasetSelectValue(datasetParams.datasets)
            };
          }
        }
      }

      // Skills
      if (input.key === NodeInputKeyEnum.skills) {
        input.value = z.array(StoredSelectedAgentSkillItemTypeSchema).parse(input.value);
      }
    });
  });

  await Promise.all(
    nodes.map(async (node) => {
      if (node.flowNodeType !== FlowNodeTypeEnum.agent) return;

      const selectedToolsInput = node.inputs.find(
        (input) => input.key === NodeInputKeyEnum.selectedTools
      );
      if (!selectedToolsInput || nodeInputIsReference(selectedToolsInput)) return;
      if (!Array.isArray(selectedToolsInput.value)) return;

      await Promise.all(
        selectedToolsInput.value.map(async (selectedTool: any) => {
          if (!selectedTool?.id || !selectedTool.config) return;

          try {
            const preview = await getClientToolPreviewNode({
              appId: selectedTool.id,
              versionId: selectedTool.version,
              source: selectedTool.source,
              teamId
            });
            const inputMap = new Map(preview.inputs.map((input) => [input.key, input]));
            const configInputs = Object.keys(selectedTool.config)
              .map((key) => inputMap.get(key))
              .filter((input): input is (typeof preview.inputs)[number] => !!input);

            configInputs.forEach((input) => {
              input.value = selectedTool.config[input.key];
            });
            formatToolInputSecrets({ inputs: configInputs });
            configInputs.forEach((input) => {
              selectedTool.config[input.key] = input.value;
            });
          } catch {
            // 工具已删除或暂时不可用时，至少清理嵌套 system/team 临时值。
            const systemInput = selectedTool.config.system_input_config;
            if (
              systemInput &&
              typeof systemInput === 'object' &&
              systemInput.type !== SystemToolSecretInputTypeEnum.manual
            ) {
              delete systemInput.value;
            }
          }
        })
      );
    })
  );
};

/* Get apps */
export async function findAppAndAllChildren({
  teamId,
  appId,
  fields
}: {
  teamId: string;
  appId: string;
  fields?: string;
}): Promise<AppSchemaType[]> {
  const find = async (id: string) => {
    const children = await MongoApp.find(
      {
        teamId,
        parentId: id
      },
      fields
    ).lean();

    let apps = children;

    for (const child of children) {
      const grandChildrenIds = await find(child._id);
      apps = apps.concat(grandChildrenIds);
    }

    return apps;
  };
  const [app, childDatasets] = await Promise.all([MongoApp.findById(appId, fields), find(appId)]);

  if (!app) {
    return Promise.reject('Dataset not found');
  }

  return [app, ...childDatasets];
}

export const getAppBasicInfoByIds = async ({ teamId, ids }: { teamId: string; ids: string[] }) => {
  const apps = await MongoApp.find(
    {
      teamId,
      _id: { $in: ids }
    },
    '_id name avatar'
  ).lean();

  return apps.map((item) => ({
    id: item._id,
    name: item.name,
    avatar: item.avatar ?? ''
  }));
};

const cleanupWorkflowToolSystemToolAssociation = async (appIds: string[]) => {
  if (appIds.length === 0) return;

  await MongoSystemTool.updateMany(
    { 'customConfig.associatedPluginId': { $in: appIds } },
    { $unset: { 'customConfig.associatedPluginId': '' } }
  );
};

export const deleteAppDataProcessor = async ({
  app,
  teamId
}: {
  app: AppSchemaType;
  teamId: string;
}) => {
  const appId = String(app._id);

  if (app.type === AppTypeEnum.workflowTool) {
    await cleanupWorkflowToolSystemToolAssociation([appId]);
  }

  // 1. 删除应用头像
  await removeImageByPath(app.avatar);

  // 2. 删除聊天记录、S3 文件和 sandbox 资源。App logs 属于应用统计域，单独清理。
  await deleteAppSandboxes(appId);
  await deleteChatResourcesBySource({
    sourceType: ChatSourceTypeEnum.app,
    sourceId: appId
  });
  await MongoAppChatLog.deleteMany({ teamId, appId });

  // 3. 清理外部引用与快捷入口（分享链接、精选应用、快捷应用、MCP Key 关联，兼容旧 MQ 或补偿执行）
  await cleanupAppDirectRefs({ teamId, appIds: [appId] });

  {
    // 旧应用 APIKey 保留为系统 APIKey，仅移除 deprecated appId 兼容字段。
    await MongoOpenApi.updateMany({ appId }, { $unset: { appId: '' } });
    // 删除应用版本
    await MongoAppVersion.deleteMany({ appId });
    // 删除聊天输入引导
    await MongoChatInputGuide.deleteMany({ appId });
    // 删除权限记录
    await resourcePermissionRepo.deleteByResource({
      resourceType: PerResourceTypeEnum.app,
      teamId,
      resourceId: appId
    });
    // 删除日志密钥
    await MongoAppLogKeys.deleteMany({ appId });
    // 删除应用注册记录
    await MongoAppRegistration.deleteMany({ appId });

    // 删除应用本身
    await MongoApp.deleteOne({ _id: appId });
  }
};

/**
 * 清理应用的外部引用与快捷入口（分享链接、精选应用、快捷应用、MCP Key 关联）。
 * 在应用删除时立即执行，并在 MQ 异步清理中幂等兜底执行。
 */
export const cleanupAppDirectRefs = async ({
  teamId,
  appIds,
  session
}: {
  teamId: string;
  appIds: string[];
  session?: ClientSession;
}) => {
  if (appIds.length === 0) return;

  // 删除分享链接
  await MongoOutLink.deleteMany({ teamId, appId: { $in: appIds } }, { session });
  // 删除精选应用记录
  await MongoChatFavouriteApp.deleteMany({ teamId, appId: { $in: appIds } }, { session });
  // 从快捷应用中移除对应应用
  await MongoChatSetting.updateMany(
    { teamId },
    { $pull: { quickAppIds: { $in: appIds } } },
    { session }
  );
  // 从 MCP key apps 数组中移除对应应用
  await MongoMcpKey.updateMany(
    { teamId, 'apps.appId': { $in: appIds } },
    { $pull: { apps: { appId: { $in: appIds } } } },
    { session }
  );
};

/**
 * 立即移除一些重要的 app 资源
 */
export const deleteAppsImmediate = async ({
  teamId,
  appIds,
  session
}: {
  teamId: string;
  appIds: string[];
  session?: ClientSession;
}) => {
  // 解除工作流插件与系统工具的关联
  const workflowToolApps = await MongoApp.find(
    {
      teamId,
      _id: { $in: appIds },
      type: AppTypeEnum.workflowTool
    },
    '_id',
    { session }
  ).lean();

  await cleanupWorkflowToolSystemToolAssociation(workflowToolApps.map((app) => String(app._id)));

  // 立即清理应用访问记录
  await MongoAppRecord.deleteMany({ teamId, appId: { $in: appIds } }, { session });

  // 立即清理外部引用与快捷入口（分享链接、精选应用、快捷应用、MCP Key 关联，避免 MQ 异步延迟导致仍可访问）
  await cleanupAppDirectRefs({ teamId, appIds, session });

  // 终止运行中的评测任务
  const evalJobs = await MongoEvaluation.find(
    {
      teamId,
      appId: { $in: appIds }
    },
    '_id',
    { session }
  ).lean();
  await Promise.all(evalJobs.map((evalJob) => removeEvaluationJob(evalJob._id)));
};

export const updateParentFoldersUpdateTime = ({ parentId }: { parentId?: string | null }) => {
  mongoSessionRun(async (session) => {
    const existsId = new Set<string>();
    while (true) {
      if (!parentId || existsId.has(parentId)) return;

      existsId.add(parentId);

      const parentApp = await MongoApp.findById(parentId, 'parentId updateTime');
      if (!parentApp) return;

      parentApp.updateTime = new Date();
      await parentApp.save({ session });

      // 递归更新上层
      parentId = parentApp.parentId;
    }
  }).catch((err) => {
    logger.error('Failed to update parent folder updateTime', { error: err });
  });
};

/**
 * 更新应用或文件夹的置顶状态。
 *
 * 置顶只影响列表排序，因此刻意不改动任何既有副作用：
 * - 不刷新 updateTime，否则取消置顶后资源无法回到原排序位置；
 * - 不刷新父文件夹 updateTime；
 * - 不写审计日志。
 *
 * 重复置顶保持幂等，不刷新 pinnedAt，避免置顶项之间顺序抖动。
 */
export const updateAppPin = async ({
  teamId,
  appId,
  isPinned,
  session
}: {
  teamId: string;
  appId: string;
  isPinned: boolean;
  session?: ClientSession;
}) => {
  if (isPinned) {
    // 已置顶的记录不满足条件，因此不会覆盖首次置顶时间
    await MongoApp.updateOne(
      { _id: appId, teamId, deleteTime: null, isPinned: { $ne: true } },
      { $set: { isPinned: true, pinnedAt: new Date() } },
      { session }
    );
    return;
  }

  await MongoApp.updateOne(
    { _id: appId, teamId, deleteTime: null },
    { $set: { isPinned: false }, $unset: { pinnedAt: '' } },
    { session }
  );
};
